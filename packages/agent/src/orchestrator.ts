import { PassThrough } from "node:stream";
import type { GraphState, WorkflowDefinition, WorkflowId } from "@kortyx/core";
import {
  createLangGraph,
  type FrameworkAdapter,
  makeRequestId,
  makeResumeToken,
  type PendingRequestRecord,
  type PendingRequestStore,
} from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import { Command } from "@langchain/langgraph";
import { transformGraphStreamForUI } from "./stream/transform-graph-stream-for-ui";

export type SelectWorkflowFn = (
  workflowId: string,
) => Promise<WorkflowDefinition>;

export type SaveMemoryFn = (
  sessionId: string,
  state: GraphState,
) => Promise<void>;

export interface CompiledGraphLike {
  config?: Record<string, unknown>;
  streamEvents: (
    state: GraphState,
    options?: { version?: string; configurable?: Record<string, unknown> },
  ) => AsyncIterable<unknown> | AsyncGenerator<unknown>;
}

export interface OrchestrateArgs {
  sessionId?: string;
  runId: string;
  graph: CompiledGraphLike; // minimal graph surface used here
  state: GraphState; // initial state
  config: Record<string, unknown>; // runtime config
  selectWorkflow: SelectWorkflowFn;
  frameworkAdapter?: FrameworkAdapter;
}

/**
 * Orchestrates LangGraph execution with mid-stream transitions.
 * Works with both:
 *  - transition chunks emitted via transformGraphStreamForUI
 *  - transition events emitted via ctx.emit("transition", ...)
 */
export async function orchestrateGraphStream({
  sessionId,
  runId,
  graph,
  state,
  config,
  selectWorkflow,
  frameworkAdapter,
}: OrchestrateArgs): Promise<NodeJS.ReadableStream> {
  const out = new PassThrough({ objectMode: true });

  let currentGraph = graph;
  let currentState: GraphState = state;
  let finished = false;
  const namespacesUsed = new Set<string>();

  // Announce session id to clients so they can persist it
  try {
    const sid = (config as any)?.session?.id as string | undefined;
    if (sid && typeof sid === "string") {
      out.write({ type: "session", sessionId: sid } as any);
    }
  } catch {}

  // Pending transition captured from ctx.emit(...)
  const pending: { to: string | null; payload: Record<string, unknown> } = {
    to: null,
    payload: {},
  };

  // Bridge internal graph emits to our stream AND capture transitions
  // Track which nodes streamed text so we can suppress duplicate full messages
  const streamedNodes = new Set<string>();
  let lastStatusMsg = "";
  let lastStatusAt = 0;

  // No chunking needed for final ui.message; we forward a single "message" event now.
  // Capture interrupt payloads to emit a final interrupt chunk after graph ends.
  interface HumanInputPayload {
    node?: string;
    workflow?: string;
    input?: {
      kind?: string;
      multiple?: boolean;
      question?: string;
      options?: Array<{
        id: string;
        label: string;
        description?: string;
        value?: unknown;
      }>;
    };
  }
  // Track latest interrupt token for updating stored snapshot at end
  let pendingRecordToken: string | null = null;
  // Track if current invocation is a resume, so we can de-dupe interrupt events
  let activeIsResume = false;
  // Avoid emitting duplicate interrupt chunks (e.g., both from forwardEmit and placeholder)
  let wroteHumanInput = false;

  const pendingStore: PendingRequestStore | undefined =
    frameworkAdapter?.pendingRequests;
  const pendingTtlMs = frameworkAdapter?.ttlMs ?? 15 * 60 * 1000;

  const forwardEmit = (event: string, payload: unknown) => {
    if (event === "error") {
      const msg = String(
        (payload as { message?: unknown })?.message ?? "Unexpected error",
      );
      out.write({ type: "error", message: msg });
      out.write({ type: "done" });
      finished = true;
      out.end();
      return;
    }
    if (event === "status") {
      const msg = String((payload as { message?: unknown })?.message ?? "");
      const now = Date.now();
      if (msg && msg === lastStatusMsg && now - lastStatusAt < 250) return; // de-dupe rapid duplicates
      lastStatusMsg = msg;
      lastStatusAt = now;
      out.write({ type: "status", message: msg });
      return;
    }
    if (event === "text-start") {
      const node = (payload as { node?: string })?.node;
      if (!node) return;
      out.write({ type: "text-start", node });
      streamedNodes.add(node);
      return;
    }
    if (event === "text-delta") {
      const node = (payload as { node?: string })?.node;
      const delta = String((payload as { delta?: unknown })?.delta ?? "");
      if (!node || !delta) return;
      out.write({ type: "text-delta", delta, node });
      streamedNodes.add(node);
      return;
    }
    if (event === "text-end") {
      const node = (payload as { node?: string })?.node;
      if (!node) return;
      out.write({ type: "text-end", node });
      return;
    }
    if (event === "message") {
      const node = (payload as { node?: string })?.node;
      const text = String((payload as { content?: unknown })?.content ?? "");
      out.write({ type: "message", node, content: text });
      return;
    }
    if (event === "structured_data") {
      out.write({
        type: "structured-data",
        node: (payload as { node?: string })?.node,
        dataType: (payload as { dataType?: string })?.dataType,
        data: (payload as { data?: unknown })?.data,
      });
      return;
    }
    // legacy 'human_required' removed — dynamic interrupts are used instead
    if (event === "transition") {
      // 1) surface to the client (useful for dev tools)
      out.write({
        type: "transition",
        transitionTo: (payload as { transitionTo?: string })?.transitionTo,
        payload:
          (payload as { payload?: Record<string, unknown> })?.payload ?? {},
      });
      // 2) capture for orchestration even if the uiStream never emits it
      pending.to = (payload as { transitionTo?: string })?.transitionTo ?? null;
      pending.payload =
        (payload as { payload?: Record<string, unknown> })?.payload ?? {};
      return;
    }
    if (event === "interrupt") {
      // Ignore duplicate interrupt events on resume invocations to avoid double prompts
      if (activeIsResume) return;
      try {
        const p = payload as any;
        // eslint-disable-next-line no-console
        console.log(
          `[orchestrator] interrupt node=${p?.node} workflow=${p?.workflow} options=${
            Array.isArray(p?.input?.options) ? p.input.options.length : 0
          }`,
        );
      } catch {}
      // Persist a snapshot and emit a typed chunk immediately
      const p = payload as any;
      const local: HumanInputPayload = {
        node: p?.node,
        workflow: p?.workflow,
        input: p?.input,
      };

      const token = makeResumeToken();
      const requestId = makeRequestId("human");
      pendingRecordToken = token;
      const options = Array.isArray(local.input?.options)
        ? (local.input!.options! as Array<any>)
        : [];

      const kind =
        local.input?.kind ||
        (local.input?.multiple ? "multi-choice" : "choice");
      const isText = kind === "text";

      const record: PendingRequestRecord = {
        token,
        requestId,
        sessionId: sessionId,
        runId,
        workflow: local.workflow || (currentState.currentWorkflow as string),
        node: local.node || "",
        // Provide an immediate snapshot so resume can work even if user clicks fast
        state: { ...(currentState as GraphState), awaitingHumanInput: true },
        schema: isText
          ? {
              kind: kind as any,
              multiple: Boolean(local.input?.multiple),
              ...(local.input?.question
                ? { question: local.input.question }
                : {}),
            }
          : {
              kind: kind as any,
              multiple: Boolean(local.input?.multiple),
              question: String(
                local.input?.question || "Please choose an option.",
              ),
            },
        options: options.map((o: any) => ({
          id: String(o.id),
          label: String(o.label),
          description:
            typeof o.description === "string" ? o.description : undefined,
          value: (o as any).value,
        })),
        createdAt: Date.now(),
        ttlMs: pendingTtlMs,
      };
      if (pendingStore) {
        pendingStore.save(record).catch((e) => {
          // eslint-disable-next-line no-console
          console.error("[orchestrator] failed to save pending request", e);
        });
      }
      out.write({
        type: "interrupt",
        requestId: record.requestId,
        resumeToken: record.token,
        workflow: record.workflow,
        node: record.node,
        input: {
          kind: record.schema.kind,
          multiple: record.schema.multiple,
          question: record.schema.question,
          options: record.options.map((o) => ({
            id: o.id,
            label: o.label,
            description: o.description,
          })),
        },
      } as any);
      wroteHumanInput = true;
      return;
    }
  };

  (async () => {
    while (true) {
      let workflowFinalState: GraphState | null = null;

      // Ensure the compiled graph uses our forwardEmit
      currentGraph.config = currentGraph.config || {};
      currentGraph.config.emit = forwardEmit;
      const threadId =
        ((currentGraph.config as any)?.session?.id as string | undefined) ||
        sessionId ||
        "anonymous-session";
      const checkpointNs = String(currentState.currentWorkflow || "default");
      namespacesUsed.add(checkpointNs);
      out.write({
        type: "status",
        message: `🧵 thread_id=${threadId} run_id=${runId} workflow=${currentState.currentWorkflow}`,
      });

      // Stream runtime events (LLM deltas, node starts/ends, etc.)
      const isResume = Boolean((currentGraph.config as any)?.resume);
      activeIsResume = isResume;
      // For static breakpoints, resume with null input; if a resumeUpdate was provided,
      // use Command({ update }) to merge selection into state at resume time.
      const resumeUpdate = (currentGraph.config as any)?.resumeUpdate as
        | Record<string, unknown>
        | undefined;
      const resumeValue = (currentGraph.config as any)?.resumeValue as
        | unknown
        | undefined;
      const invokeState = isResume
        ? resumeValue !== undefined
          ? (new Command({ resume: resumeValue }) as any)
          : resumeUpdate
            ? (new Command({ update: resumeUpdate }) as any)
            : (null as any)
        : (currentState as any);
      const runtimeStream = currentGraph.streamEvents(invokeState, {
        version: "v2",
        configurable: {
          thread_id: runId,
          // Use a stable namespace so checkpoints survive across recompiles of same workflow
          checkpoint_ns: checkpointNs,
        },
      });

      // Diagnostics for stream invocation shape
      try {
        out.write({
          type: "status",
          message: `▶️ streamEvents invoke: resume=${Boolean((currentGraph.config as any)?.resume)} thread_id=${threadId} run_id=${runId} ns=${String(currentState.currentWorkflow || "default")}`,
        } as any);
      } catch {}

      const uiStream = transformGraphStreamForUI(runtimeStream as any, {
        debug: Boolean((config as any)?.features?.tracing),
      });

      // Also allow transition detection via uiStream (if transformer emits it)
      let loopTransitionTo: string | null = null;
      let loopTransitionPayload: Record<string, unknown> = {};

      for await (const chunk of uiStream as AsyncIterable<StreamChunk>) {
        if (finished) break;
        const node = (chunk as { node?: string }).node;
        // Convert placeholder interrupt chunk (from transformer) into a real chunk with tokens + persist snapshot
        if (
          (chunk as any).type === "interrupt" &&
          (!(chunk as any).resumeToken || !(chunk as any).requestId)
        ) {
          if (wroteHumanInput) {
            // Already emitted an interrupt for this pause; skip placeholder
            continue;
          }
          const hi = chunk as any;
          const token = makeResumeToken();
          const requestId = makeRequestId("human");
          pendingRecordToken = token;
          const options = Array.isArray(hi.input?.options)
            ? hi.input.options
            : [];

          const kind =
            hi.input?.kind || (hi.input?.multiple ? "multi-choice" : "choice");
          const isText = kind === "text";

          const record: PendingRequestRecord = {
            token,
            requestId,
            sessionId: sessionId,
            runId,
            workflow: currentState.currentWorkflow as string,
            node: node || "",
            state: {
              ...(currentState as GraphState),
              awaitingHumanInput: true,
            },
            schema: isText
              ? {
                  kind: kind as any,
                  multiple: Boolean(hi.input?.multiple),
                  ...(hi.input?.question
                    ? { question: hi.input.question }
                    : {}),
                }
              : {
                  kind: kind as any,
                  multiple: Boolean(hi.input?.multiple),
                  question: String(
                    hi.input?.question || "Please choose an option.",
                  ),
                },
            options: options.map((o: any) => ({
              id: String(o.id),
              label: String(o.label),
              description:
                typeof o.description === "string" ? o.description : undefined,
              value: (o as any).value,
            })),
            createdAt: Date.now(),
            ttlMs: pendingTtlMs,
          };
          if (pendingStore) {
            await pendingStore.save(record);
          }
          out.write({
            type: "interrupt",
            requestId,
            resumeToken: token,
            workflow: record.workflow,
            node: record.node,
            input: {
              kind: record.schema.kind,
              multiple: record.schema.multiple,
              question: record.schema.question,
              options: record.options.map((o) => ({
                id: o.id,
                label: o.label,
                description: o.description,
              })),
            },
          } as any);
          wroteHumanInput = true;
          continue;
        }
        if (chunk.type === "text-delta") {
          if (typeof chunk.delta === "string" && chunk.delta.length > 60) {
            const text = chunk.delta as string;
            for (let i = 0; i < text.length; i += 60) {
              out.write({
                type: "text-delta",
                delta: text.slice(i, i + 60),
                node,
              });
            }
            if (node) streamedNodes.add(node);
          } else {
            out.write(chunk);
            if (node) streamedNodes.add(node);
          }
        } else {
          out.write(chunk);
        }

        // Transition surfaced by transformer
        if (chunk.type === "transition") {
          loopTransitionTo = String(chunk.transitionTo || "");
          loopTransitionPayload = chunk.payload ?? {};
          break; // stop current workflow, move to next
        }

        if (chunk.type === "done") {
          workflowFinalState = (chunk.data as GraphState) ?? null;
          break;
        }
      }

      if (finished) return;

      // Prefer transition detected from the uiStream; otherwise use pending from emit()
      const transitionTo = loopTransitionTo || pending.to;
      const transitionPayload = Object.keys(loopTransitionPayload).length
        ? loopTransitionPayload
        : pending.payload;

      // Reset pending so we don't carry it accidentally
      pending.to = null;
      pending.payload = {};

      if (transitionTo) {
        // 🔁 Handoff to the next workflow
        try {
          const nextWorkflow = await selectWorkflow(transitionTo);
          const nextGraph = await createLangGraph(nextWorkflow, {
            ...(config as Record<string, unknown>),
            emit: forwardEmit, // keep forwarding emits
          });

          // Merge data: prefer the final state's data if present, then add transition payload
          const mergedData = {
            ...(workflowFinalState?.data ?? currentState.data ?? {}),
            ...(transitionPayload ?? {}),
          };

          const rawInputFromPayload = (
            transitionPayload as {
              rawInput?: unknown;
            }
          )?.rawInput;
          const newInput =
            typeof rawInputFromPayload === "string"
              ? rawInputFromPayload
              : currentState.input;

          currentState = {
            ...currentState,
            currentWorkflow: transitionTo as WorkflowId,
            input: newInput,
            data: mergedData,
            ui: {}, // reset UI layer on new graph
          };

          currentGraph = nextGraph;
          continue; // run the next graph
        } catch (err) {
          out.write({
            type: "status",
            message: `⚠️ Transition failed to '${transitionTo}': ${
              err instanceof Error ? err.message : String(err)
            }`,
          });
          out.end();
          return;
        }
      }

      // No transition → either graph returned done or ended naturally
      if (workflowFinalState) {
        // If we paused for an interrupt, persist a pending request and emit an interrupt chunk
        // Attach final state to pending record if we have one
        if (workflowFinalState && pendingRecordToken) {
          if (pendingStore) {
            await pendingStore.update(pendingRecordToken, {
              state: workflowFinalState,
            });
          }
        }

        const shouldKeepFrameworkState =
          Boolean(pendingRecordToken) ||
          Boolean((workflowFinalState as any)?.awaitingHumanInput);
        if (!shouldKeepFrameworkState) {
          // Best-effort cleanup: completed runs don't need to retain checkpoints.
          try {
            if (frameworkAdapter?.cleanupRun) {
              await frameworkAdapter.cleanupRun(
                runId,
                Array.from(namespacesUsed),
              );
            } else {
              const cp = (currentGraph.config as any)
                ?.checkpointer as unknown as {
                deleteThread?: (id: string) => any;
              };
              if (cp?.deleteThread) {
                await cp.deleteThread(runId);
              }
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[orchestrator] framework cleanup failed", e);
          }
        }

        finished = true;
        out.write({ type: "done", data: workflowFinalState } as any);
        out.end();
        return;
      }

      // Natural end with no explicit "done" (defensive close)
      if (!finished) {
        out.write({ type: "done" });
        out.end();
      }
      return;
    }
  })().catch((err) => {
    console.error("[error:orchestrateGraphStream]", err);
    out.write({ type: "status", message: `Error: ${err.message}` });
    out.end();
  });

  return out;
}
