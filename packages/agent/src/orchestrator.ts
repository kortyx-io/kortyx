import { PassThrough } from "node:stream";
import type { GraphState, WorkflowDefinition, WorkflowId } from "@kortyx/core";
import {
  createExecutionCancelledError,
  type ExecutionBudget,
  isExecutionCancelled,
  isExecutionLimitReached,
  throwIfExecutionAborted,
} from "@kortyx/core";
import {
  captureGraphSnapshot,
  createExecutionGraph,
  type FrameworkAdapter,
  makeRequestId,
  makeResumeToken,
  type PendingRequestRecord,
  type PendingRequestStore,
} from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import { Command } from "@langchain/langgraph";
import {
  parseExecutionInput,
  validateExecutionOutput,
} from "./execution/contracts";
import { createResponseLifecycle } from "./stream/response-lifecycle";
import { transformGraphStreamForUI } from "./stream/transform-graph-stream-for-ui";
import {
  emitTelemetryEvent,
  shouldCaptureTelemetryContent,
} from "./telemetry/events";
import { prepareWorkflowTelemetry } from "./telemetry/topology";

export type SelectWorkflowFn = (
  workflowId: string,
) => Promise<WorkflowDefinition>;

export type SaveMemoryFn = (
  sessionId: string,
  state: GraphState,
) => Promise<void>;

export interface CompiledGraphLike {
  execution?: {
    abortSignal?: AbortSignal | undefined;
    budget?: ExecutionBudget | undefined;
    completeResponse?:
      | ((
          options: import("@kortyx/hooks").CompleteResponseOptions,
          state: GraphState,
        ) => Promise<void>)
      | undefined;
  };
  config?: Record<string, unknown>;
  streamEvents: (
    state: GraphState,
    options?: { version?: string; configurable?: Record<string, unknown> },
  ) => AsyncIterable<unknown> | AsyncGenerator<unknown>;
  getState?: (options?: {
    configurable?: Record<string, unknown>;
  }) => Promise<unknown>;
}

export type OrchestrationOutcome = {
  cancelled?: boolean;
  state: GraphState;
  pending?: PendingRequestRecord | undefined;
  checkpointId?: string | undefined;
  error?: unknown;
};

export interface OrchestrateArgs {
  executionSignal?: AbortSignal | undefined;
  onExecution?: ((completion: Promise<void>) => void) | undefined;
  abortSignal?: AbortSignal | undefined;
  emitOutput?: boolean | undefined;
  onOutcome?: ((outcome: OrchestrationOutcome) => void) | undefined;
  sessionId?: string;
  runId: string;
  graph: CompiledGraphLike; // minimal graph surface used here
  state: GraphState; // initial state
  config: Record<string, unknown>; // runtime config
  selectWorkflow: SelectWorkflowFn;
  knownWorkflowIds?: readonly string[] | undefined;
  frameworkAdapter?: FrameworkAdapter;
}

type TraceSpanLike = {
  setAttributes?: (attributes: Record<string, unknown>) => void;
  addEvent?: (name: string, attributes?: Record<string, unknown>) => void;
  end?: (args?: {
    attributes?: Record<string, unknown>;
    telemetry?: Record<string, unknown>;
  }) => void;
  fail?: (
    error: unknown,
    args?: {
      attributes?: Record<string, unknown>;
      telemetry?: Record<string, unknown>;
    },
  ) => void;
};

type TraceAdapterLike = {
  startSpan?: (args: {
    name: string;
    attributes?: Record<string, unknown>;
    telemetry?: unknown;
  }) => TraceSpanLike | undefined;
  withSpan?: <T>(
    args: {
      name: string;
      attributes?: Record<string, unknown>;
      telemetry?: unknown;
    },
    fn: (span: TraceSpanLike) => T | Promise<T>,
  ) => Promise<T>;
  getActiveContext?: () =>
    | {
        traceId: string;
        spanId: string;
      }
    | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isGraphState = (value: unknown): value is GraphState =>
  isRecord(value) && typeof value.currentWorkflow === "string";

type GraphSnapshot = {
  state: GraphState;
  checkpointId?: string;
};

const getGraphCheckpointId = (snapshot: unknown): string | undefined => {
  if (!isRecord(snapshot)) return undefined;
  const config = isRecord(snapshot.config) ? snapshot.config : undefined;
  const configurable =
    config && isRecord(config.configurable) ? config.configurable : undefined;
  const checkpointId = configurable?.checkpoint_id;
  return typeof checkpointId === "string" && checkpointId.length > 0
    ? checkpointId
    : undefined;
};

const getTraceAdapter = (
  config: Record<string, unknown>,
): TraceAdapterLike | undefined => {
  const telemetry = isRecord(config.telemetry) ? config.telemetry : undefined;
  const traceAdapter = telemetry?.trace ?? config.reasonTrace;
  return isRecord(traceAdapter)
    ? (traceAdapter as TraceAdapterLike)
    : undefined;
};

/**
 * Orchestrates runtime execution with mid-stream transitions emitted by
 * runtime events.
 */
export async function orchestrateGraphStream({
  sessionId,
  runId,
  graph,
  state,
  config: initialConfig,
  abortSignal: requestSignal,
  executionSignal,
  onExecution,
  emitOutput = true,
  onOutcome,
  selectWorkflow,
  knownWorkflowIds,
  frameworkAdapter,
}: OrchestrateArgs): Promise<NodeJS.ReadableStream> {
  const out = new PassThrough({ objectMode: true });

  const write = (chunk: unknown) => {
    if (emitOutput && !response.closed && !out.destroyed) out.write(chunk);
  };
  let outcomeState = state;
  let outcomeError: unknown;
  let sessionCheckpointId: string | undefined =
    initialConfig.responseCheckpointId as string | undefined;
  let config = initialConfig;
  const budget = config.executionBudget as ExecutionBudget | undefined;
  let currentGraph = graph;
  let currentState: GraphState = state;
  let finished = false;
  const response = createResponseLifecycle({
    enabled: emitOutput,
    restored: initialConfig.responseCompleted === true,
    requestSignal,
    executionSignal,
    onClosed: () => {
      out.write({ type: "done" });
      out.end();
    },
    finalize: async (options, nodeState) => {
      // Snapshot the foreground before any later node return or handoff.
      const snapshot = JSON.parse(JSON.stringify(nodeState)) as GraphState;
      delete snapshot.config.responseCompleted;
      delete snapshot.config.responseCheckpointId;
      if (options.message !== undefined) {
        forwardEmit("message", {
          node: nodeState.lastNode,
          content: options.message,
        });
      }
      if (options.data !== undefined) {
        forwardEmit("structured_data", {
          node: nodeState.lastNode,
          data: options.data,
        });
      }
      if (sessionId && frameworkAdapter) {
        const checkpoint = await frameworkAdapter.sessionCheckpoints.append({
          sessionId,
          runId,
          workflow: String(snapshot.currentWorkflow),
          state: snapshot,
          nodes: [...touchedNodes],
          structuredStreamIds: [...structuredStreamIds],
          pendingRequests: [],
        });
        sessionCheckpointId = checkpoint.id;
        write({
          type: "checkpoint",
          id: checkpoint.id,
          sessionId,
          turnIndex: checkpoint.turnIndex,
        });
        emitTelemetryEvent({
          config,
          type: "session.checkpointed",
          payload: {
            checkpointId: checkpoint.id,
            turnIndex: checkpoint.turnIndex,
            nodes: checkpoint.nodes,
          },
        });
      }
      throwIfExecutionAborted(abortSignal);
      config.responseCompleted = true;
      config.responseCheckpointId = sessionCheckpointId;
      currentState.config.responseCompleted = true;
      nodeState.config.responseCompleted = true;
      // The marker travels with graph config across retries, children and resumes.
      currentGraph.config!.responseCompleted = true;
      emitTelemetryEvent({
        config,
        type: "response.completed",
        payload: {
          nodeId: nodeState.lastNode,
          checkpointId: sessionCheckpointId,
        },
        flush: true,
      });
    },
  });
  const abortSignal = response.signal;
  out.on("close", () => {
    if (!finished) response.disconnect();
  });
  let structuredSeq = 0;
  const debugEnabled = Boolean((config as any)?.features?.tracing);
  const traceAdapter = getTraceAdapter(config);
  const contextMeta = isRecord(config.context) ? config.context : {};
  const telemetryConfig = isRecord(config.telemetry) ? config.telemetry : {};
  const emitResumeFailure = (resumeError: unknown) => {
    const interruptId =
      typeof config.telemetryInterruptId === "string"
        ? config.telemetryInterruptId
        : undefined;
    if (!interruptId) return;
    emitTelemetryEvent({
      config,
      type: "interrupt.resolved",
      correlation:
        typeof config.telemetryInterruptNodeId === "string"
          ? { nodeId: config.telemetryInterruptNodeId }
          : undefined,
      payload: {
        interruptId,
        resolvedAt: new Date().toISOString(),
        resumeOutcome: "failed",
        resumeError:
          resumeError instanceof Error
            ? resumeError.message
            : String(resumeError),
      },
      flush: true,
    });
  };
  const telemetryCorrelation = isRecord(telemetryConfig.correlation)
    ? telemetryConfig.correlation
    : {};
  const runSpanArgs = {
    name: "kortyx.run",
    attributes: {
      ...(sessionId ? { sessionId } : {}),
      runId,
      workflowId: state.currentWorkflow,
      ...(typeof telemetryCorrelation.topologyHash === "string"
        ? { topologyHash: telemetryCorrelation.topologyHash }
        : {}),
      ...(typeof telemetryCorrelation.workflowRevisionId === "string"
        ? { workflowRevisionId: telemetryCorrelation.workflowRevisionId }
        : {}),
      ...(typeof contextMeta.userId === "string"
        ? { userId: contextMeta.userId }
        : {}),
      ...(typeof contextMeta.tenantId === "string"
        ? { tenantId: contextMeta.tenantId }
        : {}),
    },
    telemetry: {
      metadata: {
        ...(isRecord(telemetryConfig.metadata) ? telemetryConfig.metadata : {}),
        ...contextMeta,
      },
      tags: Array.isArray(telemetryConfig.tags)
        ? telemetryConfig.tags
        : undefined,
      captureContent: telemetryConfig.captureContent,
      input:
        typeof state.input === "string"
          ? state.input
          : JSON.stringify(state.input),
    },
  };
  const namespacesUsed = new Set<string>();
  const touchedNodes = new Set<string>();
  const structuredStreamIds = new Set<string>();
  const activePendingRequests = new Map<string, PendingRequestRecord>();
  const pendingRequestWrites: Promise<void>[] = [];

  // Announce session id to clients so they can persist it
  try {
    const sid = (config as any)?.session?.id as string | undefined;
    if (sid && typeof sid === "string") {
      write({ type: "session", sessionId: sid } as any);
    }
  } catch {}

  // Pending transition captured from runtime transition events.
  const pending: {
    to: string | null;
    payload: Record<string, unknown>;
    sourceNodeId: string | undefined;
    sourceWorkflowId: string | undefined;
  } = {
    to: null,
    payload: {},
    sourceNodeId: undefined,
    sourceWorkflowId: undefined,
  };

  // Bridge internal graph emits to our stream AND capture transitions
  let lastStatusMsg = "";
  let lastStatusAt = 0;
  let accumulatedOutput = "";
  let lastOutputSegmentId: string | undefined;
  const appendAccumulatedOutput = (
    payload: unknown,
    node: string,
    delta: string,
  ) => {
    const payloadObj = payload as {
      segmentId?: unknown;
      opId?: unknown;
      id?: unknown;
    };
    const opId =
      typeof payloadObj.opId === "string" && payloadObj.opId.length > 0
        ? payloadObj.opId
        : undefined;
    const segmentId =
      typeof payloadObj.segmentId === "string" &&
      payloadObj.segmentId.length > 0
        ? payloadObj.segmentId
        : undefined;
    const textStreamId =
      opId && segmentId
        ? `${opId}:${segmentId}`
        : segmentId ||
          opId ||
          (typeof payloadObj.id === "string" && payloadObj.id.length > 0
            ? payloadObj.id
            : undefined) ||
          node;

    if (
      textStreamId &&
      lastOutputSegmentId &&
      textStreamId !== lastOutputSegmentId &&
      accumulatedOutput.length > 0 &&
      !/\s$/.test(accumulatedOutput) &&
      !/^\s/.test(delta)
    ) {
      accumulatedOutput += " ";
    }

    lastOutputSegmentId = textStreamId;
    accumulatedOutput += delta;
    if (!emitOutput) accumulatedOutput = accumulatedOutput.slice(0, 65536);
  };
  const nextStructuredStreamId = () => `${runId}:structured:${structuredSeq++}`;
  const runTraceEndArgs = () =>
    accumulatedOutput.length > 0
      ? { telemetry: { output: accumulatedOutput } }
      : undefined;

  // Capture interrupt payloads emitted by runtime hooks and forward them as
  // resumable interrupt chunks.
  interface HumanInputPayload {
    node?: string;
    workflow?: string;
    input?: {
      kind?: string;
      multiple?: boolean;
      question?: string;
      id?: string;
      schemaId?: string;
      schemaVersion?: string;
      meta?: Record<string, unknown>;
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
  // Avoid emitting duplicate interrupt chunks in the same run.
  let wroteHumanInput = false;

  const pendingStore: PendingRequestStore | undefined =
    frameworkAdapter?.pendingRequests;
  const sealPendingSnapshots = async () => {
    if (budget) outcomeState.config.executionBudget = budget;
    if (response.closed) outcomeState.config.responseCompleted = true;
    if (typeof frameworkAdapter?.checkpointer?.getTuple !== "function") return;
    for (const [token, request] of activePendingRequests) {
      if (budget) request.state!.config.executionBudget = budget;
      if (response.closed) request.state!.config.responseCompleted = true;
      const graphSnapshot = await captureGraphSnapshot(
        frameworkAdapter.checkpointer,
        runId,
        request.graphCheckpointId,
      );
      if (graphSnapshot) {
        const sealed = { ...request, graphSnapshot, ready: true };
        activePendingRequests.set(token, sealed);
        await pendingStore?.update(token, {
          graphSnapshot,
          ready: true,
          state: request.state!,
        });
      }
    }
  };
  const pendingTtlMs = frameworkAdapter?.ttlMs ?? 15 * 60 * 1000;

  const persistAndEmitInterrupt = async (
    payload: HumanInputPayload,
  ): Promise<void> => {
    if (wroteHumanInput) return;

    const token = makeResumeToken();
    const requestId = makeRequestId("human");
    pendingRecordToken = token;
    const input = payload.input ?? {};
    const optionsList = Array.isArray(input.options) ? input.options : [];
    const kind = input.kind || (input.multiple ? "multi-choice" : "choice");
    const isText = kind === "text";

    const record: PendingRequestRecord = {
      token,
      ready: false,
      responseCompleted: response.closed,
      requestId,
      sessionId,
      runId,
      workflow: payload.workflow || (currentState.currentWorkflow as string),
      node: payload.node || "",
      state: { ...(currentState as GraphState), awaitingHumanInput: true },
      schema: isText
        ? {
            kind: kind as any,
            multiple: Boolean(input.multiple),
            ...(input.question ? { question: input.question } : {}),
            ...(typeof input.id === "string" && input.id.length > 0
              ? { id: input.id }
              : {}),
            ...(typeof input.schemaId === "string" && input.schemaId.length > 0
              ? { schemaId: input.schemaId }
              : {}),
            ...(typeof input.schemaVersion === "string" &&
            input.schemaVersion.length > 0
              ? { schemaVersion: input.schemaVersion }
              : {}),
            ...(input.meta && typeof input.meta === "object"
              ? { meta: input.meta }
              : {}),
          }
        : {
            kind: kind as any,
            multiple: Boolean(input.multiple),
            question: String(input.question || "Please choose an option."),
            ...(typeof input.id === "string" && input.id.length > 0
              ? { id: input.id }
              : {}),
            ...(typeof input.schemaId === "string" && input.schemaId.length > 0
              ? { schemaId: input.schemaId }
              : {}),
            ...(typeof input.schemaVersion === "string" &&
            input.schemaVersion.length > 0
              ? { schemaVersion: input.schemaVersion }
              : {}),
            ...(input.meta && typeof input.meta === "object"
              ? { meta: input.meta }
              : {}),
          },
      options: optionsList.map((option: any) => ({
        id: String(option.id),
        label: String(option.label),
        description:
          typeof option.description === "string"
            ? option.description
            : undefined,
        value: option.value,
      })),
      createdAt: Date.now(),
      ttlMs: pendingTtlMs,
    };
    activePendingRequests.set(record.token, record);

    if (pendingStore) {
      const savePromise = pendingStore.save(record).catch((error) => {
        // eslint-disable-next-line no-console
        outcomeError = error;
        console.error("[orchestrator] failed to save pending request", error);
      });
      pendingRequestWrites.push(savePromise);
    }

    const clientMeta =
      record.schema.meta &&
      typeof record.schema.meta === "object" &&
      !Array.isArray(record.schema.meta)
        ? Object.fromEntries(
            Object.entries(record.schema.meta).filter(
              ([key]) => !key.startsWith("__kortyx"),
            ),
          )
        : undefined;

    write({
      type: "interrupt",
      requestId: record.requestId,
      resumeToken: record.token,
      workflow: record.workflow,
      node: record.node,
      ...(typeof record.schema.id === "string" && record.schema.id.length > 0
        ? { id: record.schema.id }
        : {}),
      ...(typeof record.schema.schemaId === "string" &&
      record.schema.schemaId.length > 0
        ? { schemaId: record.schema.schemaId }
        : {}),
      ...(typeof record.schema.schemaVersion === "string" &&
      record.schema.schemaVersion.length > 0
        ? { schemaVersion: record.schema.schemaVersion }
        : {}),
      input: {
        kind: record.schema.kind,
        multiple: record.schema.multiple,
        question: record.schema.question,
        ...(typeof record.schema.id === "string" && record.schema.id.length > 0
          ? { id: record.schema.id }
          : {}),
        ...(typeof record.schema.schemaId === "string" &&
        record.schema.schemaId.length > 0
          ? { schemaId: record.schema.schemaId }
          : {}),
        ...(typeof record.schema.schemaVersion === "string" &&
        record.schema.schemaVersion.length > 0
          ? { schemaVersion: record.schema.schemaVersion }
          : {}),
        ...(clientMeta && Object.keys(clientMeta).length > 0
          ? { meta: clientMeta }
          : {}),
        options: record.options.map((option) => ({
          id: option.id,
          label: option.label,
          description: option.description,
        })),
      },
    } as any);
    emitTelemetryEvent({
      config,
      type: "interrupt.created",
      correlation: { nodeId: record.node },
      payload: {
        workflowCall: record.schema.meta?.workflowCall ?? null,
        workflowCallPath: record.schema.meta?.workflowCallPath ?? null,
        branchId: config.executionBranchId ?? runId,
        interruptId: record.requestId,
        responseCompleted: response.closed,
        requestId: record.requestId,
        kind: record.schema.kind,
        interactionMode:
          record.schema.kind === "text"
            ? "freeform"
            : record.options.length > 0
              ? "static-options"
              : record.schema.schemaId
                ? "dynamic-picker"
                : "unknown",
        ...(record.schema.schemaId ? { schemaId: record.schema.schemaId } : {}),
        ...(record.schema.schemaVersion
          ? { schemaVersion: record.schema.schemaVersion }
          : {}),
        ...(typeof record.schema.question === "string" &&
        shouldCaptureTelemetryContent(telemetryConfig.captureContent, "output")
          ? { question: record.schema.question }
          : {}),
        ...(shouldCaptureTelemetryContent(
          telemetryConfig.captureContent,
          "output",
        )
          ? {
              options: record.options.map((option) => ({
                id: option.id,
                label: option.label,
                ...(option.description
                  ? { description: option.description }
                  : {}),
              })),
            }
          : {}),
        optionCount: record.options.length,
        nodeId: record.node,
        expiresAt: new Date(record.createdAt + record.ttlMs).toISOString(),
      },
      flush: true,
    });
    wroteHumanInput = true;
  };

  const forwardEmit = (event: string, payload: unknown) => {
    if (event === "error") {
      const msg = String(
        (payload as { message?: unknown })?.message ?? "Unexpected error",
      );
      outcomeError = new Error(msg);
      write({ type: "error", message: msg });
      write({ type: "done" });
      finished = true;
      out.end();
      return;
    }
    if (event === "status") {
      if (!debugEnabled) return;
      const statusMessage = (
        payload as { message?: unknown } | null | undefined
      )?.message;
      const msg =
        statusMessage === null || statusMessage === undefined
          ? ""
          : String(statusMessage);
      const now = Date.now();
      if (msg && msg === lastStatusMsg && now - lastStatusAt < 250) return; // de-dupe rapid duplicates
      lastStatusMsg = msg;
      lastStatusAt = now;
      write({ type: "status", message: msg });
      return;
    }
    if (event === "text-start") {
      const node = (payload as { node?: string })?.node;
      if (!node) return;
      touchedNodes.add(node);
      write({
        type: "text-start",
        node,
        ...(typeof (payload as { id?: string }).id === "string"
          ? { id: (payload as { id?: string }).id }
          : {}),
        ...(typeof (payload as { opId?: string }).opId === "string"
          ? { opId: (payload as { opId?: string }).opId }
          : {}),
        ...(typeof (payload as { segmentId?: string }).segmentId === "string"
          ? { segmentId: (payload as { segmentId?: string }).segmentId }
          : {}),
      });
      return;
    }
    if (event === "text-delta") {
      const node = (payload as { node?: string })?.node;
      const delta = String((payload as { delta?: unknown })?.delta ?? "");
      if (!node || !delta) return;
      touchedNodes.add(node);
      appendAccumulatedOutput(payload, node, delta);
      write({
        type: "text-delta",
        delta,
        node,
        ...(typeof (payload as { id?: string }).id === "string"
          ? { id: (payload as { id?: string }).id }
          : {}),
        ...(typeof (payload as { opId?: string }).opId === "string"
          ? { opId: (payload as { opId?: string }).opId }
          : {}),
        ...(typeof (payload as { segmentId?: string }).segmentId === "string"
          ? { segmentId: (payload as { segmentId?: string }).segmentId }
          : {}),
      });
      return;
    }
    if (event === "text-end") {
      const node = (payload as { node?: string })?.node;
      if (!node) return;
      touchedNodes.add(node);
      write({
        type: "text-end",
        node,
        ...(typeof (payload as { id?: string }).id === "string"
          ? { id: (payload as { id?: string }).id }
          : {}),
        ...(typeof (payload as { opId?: string }).opId === "string"
          ? { opId: (payload as { opId?: string }).opId }
          : {}),
        ...(typeof (payload as { segmentId?: string }).segmentId === "string"
          ? { segmentId: (payload as { segmentId?: string }).segmentId }
          : {}),
      });
      return;
    }
    if (event === "tool-call-start") {
      const payloadObj = payload as {
        tool?: unknown;
        toolCallId?: unknown;
        node?: string;
        id?: string;
        opId?: string;
        input?: unknown;
      };
      if (
        typeof payloadObj.tool !== "string" ||
        typeof payloadObj.toolCallId !== "string"
      ) {
        return;
      }
      write({
        type: "tool-call-start",
        tool: payloadObj.tool,
        toolCallId: payloadObj.toolCallId,
        ...(payloadObj.node ? { node: payloadObj.node } : {}),
        ...(payloadObj.id ? { id: payloadObj.id } : {}),
        ...(payloadObj.opId ? { opId: payloadObj.opId } : {}),
        ...(payloadObj.input !== undefined ? { input: payloadObj.input } : {}),
      });
      if (payloadObj.node) touchedNodes.add(payloadObj.node);
      return;
    }
    if (event === "tool-call-result") {
      const payloadObj = payload as {
        tool?: unknown;
        toolCallId?: unknown;
        node?: string;
        id?: string;
        opId?: string;
        content?: unknown;
        structuredContent?: unknown;
        isError?: unknown;
      };
      if (
        typeof payloadObj.tool !== "string" ||
        typeof payloadObj.toolCallId !== "string"
      ) {
        return;
      }
      write({
        type: "tool-call-result",
        tool: payloadObj.tool,
        toolCallId: payloadObj.toolCallId,
        ...(payloadObj.node ? { node: payloadObj.node } : {}),
        ...(payloadObj.id ? { id: payloadObj.id } : {}),
        ...(payloadObj.opId ? { opId: payloadObj.opId } : {}),
        content: payloadObj.content,
        ...(payloadObj.structuredContent !== undefined
          ? { structuredContent: payloadObj.structuredContent }
          : {}),
        ...(typeof payloadObj.isError === "boolean"
          ? { isError: payloadObj.isError }
          : {}),
      });
      if (payloadObj.node) touchedNodes.add(payloadObj.node);
      return;
    }
    if (event === "tool-call-error") {
      const payloadObj = payload as {
        tool?: unknown;
        toolCallId?: unknown;
        node?: string;
        id?: string;
        opId?: string;
        message?: unknown;
      };
      if (
        typeof payloadObj.tool !== "string" ||
        typeof payloadObj.toolCallId !== "string"
      ) {
        return;
      }
      write({
        type: "tool-call-error",
        tool: payloadObj.tool,
        toolCallId: payloadObj.toolCallId,
        ...(payloadObj.node ? { node: payloadObj.node } : {}),
        ...(payloadObj.id ? { id: payloadObj.id } : {}),
        ...(payloadObj.opId ? { opId: payloadObj.opId } : {}),
        message: String(payloadObj.message ?? ""),
      });
      if (payloadObj.node) touchedNodes.add(payloadObj.node);
      return;
    }
    if (event === "message") {
      const node = (payload as { node?: string })?.node;
      const text = String((payload as { content?: unknown })?.content ?? "");
      if (node) touchedNodes.add(node);
      write({ type: "message", node, content: text });
      return;
    }
    if (event === "structured_data") {
      const payloadObj = payload as {
        streamId?: string;
        dataType?: string;
        kind?: string;
        schemaId?: string;
        schemaVersion?: string;
        id?: string;
        node?: string;
        path?: string;
        value?: unknown;
        items?: unknown[];
        delta?: string;
        data?: unknown;
      };
      const kind =
        payloadObj.kind === "set" ||
        payloadObj.kind === "append" ||
        payloadObj.kind === "text-delta" ||
        payloadObj.kind === "final"
          ? payloadObj.kind
          : "final";

      const streamId =
        typeof payloadObj.streamId === "string" && payloadObj.streamId
          ? payloadObj.streamId
          : nextStructuredStreamId();
      structuredStreamIds.add(streamId);
      if (payloadObj.node) touchedNodes.add(payloadObj.node);

      write({
        type: "structured-data",
        node: payloadObj.node,
        streamId,
        dataType:
          typeof payloadObj.dataType === "string" && payloadObj.dataType
            ? payloadObj.dataType
            : "generic",
        kind,
        ...(typeof payloadObj.schemaId === "string"
          ? { schemaId: payloadObj.schemaId }
          : {}),
        ...(typeof payloadObj.schemaVersion === "string"
          ? { schemaVersion: payloadObj.schemaVersion }
          : {}),
        ...(typeof payloadObj.id === "string" ? { id: payloadObj.id } : {}),
        ...(kind === "set"
          ? {
              path: String(payloadObj.path ?? ""),
              value: payloadObj.value,
            }
          : {}),
        ...(kind === "append"
          ? {
              path: String(payloadObj.path ?? ""),
              items: Array.isArray(payloadObj.items) ? payloadObj.items : [],
            }
          : {}),
        ...(kind === "text-delta"
          ? {
              path: String(payloadObj.path ?? ""),
              delta: String(payloadObj.delta ?? ""),
            }
          : {}),
        ...(kind === "final" ? { data: payloadObj.data } : {}),
      });
      return;
    }
    // legacy 'human_required' removed — dynamic interrupts are used instead
    if (event === "transition") {
      // 1) surface to the client (useful for dev tools)
      write({
        type: "transition",
        transitionTo: (payload as { transitionTo?: string })?.transitionTo,
        payload:
          (payload as { payload?: Record<string, unknown> })?.payload ?? {},
      });
      // 2) capture for orchestration
      pending.to = (payload as { transitionTo?: string })?.transitionTo ?? null;
      pending.payload =
        (payload as { payload?: Record<string, unknown> })?.payload ?? {};
      const transition = payload as { node?: unknown; workflow?: unknown };
      pending.sourceNodeId =
        typeof transition.node === "string" ? transition.node : undefined;
      pending.sourceWorkflowId =
        typeof transition.workflow === "string"
          ? transition.workflow
          : undefined;
      return;
    }
    if (event === "interrupt") {
      const p = payload as any;
      if (typeof p?.node === "string") touchedNodes.add(p.node);
      const local: HumanInputPayload = {
        node: p?.node,
        workflow: p?.workflow,
        input: p?.input,
      };
      void persistAndEmitInterrupt(local).catch((error) => {
        // eslint-disable-next-line no-console
        console.error("[orchestrator] failed to emit interrupt", error);
      });
      return;
    }
  };

  const runLoop = async (runTraceSpan: TraceSpanLike) => {
    while (true) {
      throwIfExecutionAborted(abortSignal);
      let workflowFinalState: GraphState | null = null;
      let workflowFinalGraphCheckpointId: string | undefined;
      let sawWorkflowDone = false;
      let workflowDoneData: unknown;

      // Ensure the compiled graph uses our forwardEmit
      currentGraph.execution ??= {};
      currentGraph.execution.abortSignal = abortSignal;
      currentGraph.execution.budget = budget;
      currentGraph.execution.completeResponse = response.complete;
      currentGraph.config = currentGraph.config || {};
      currentGraph.config.emit = forwardEmit;
      currentGraph.config.executionRunId = runId;
      const threadId =
        ((currentGraph.config as any)?.session?.id as string | undefined) ||
        sessionId ||
        "anonymous-session";
      const checkpointNs = "";
      namespacesUsed.add(checkpointNs);
      const readLatestGraphCheckpointId = async (): Promise<
        string | undefined
      > => {
        const checkpointer = (currentGraph.config as any)?.checkpointer as
          | {
              getLatestCheckpointId?: (
                threadId: string,
                checkpointNs?: string,
              ) => Promise<string | undefined>;
            }
          | undefined;
        return checkpointer?.getLatestCheckpointId?.(runId, checkpointNs);
      };
      const readLatestGraphSnapshot =
        async (): Promise<GraphSnapshot | null> => {
          if (typeof currentGraph.getState !== "function") {
            const checkpointId = await readLatestGraphCheckpointId();
            return checkpointId ? { state: currentState, checkpointId } : null;
          }
          const snapshot = await currentGraph.getState({
            configurable: {
              thread_id: runId,
              checkpoint_ns: checkpointNs,
            },
          });
          const values =
            isRecord(snapshot) && "values" in snapshot
              ? snapshot.values
              : snapshot;
          const checkpointId =
            getGraphCheckpointId(snapshot) ??
            (await readLatestGraphCheckpointId());
          /* v8 ignore next -- snapshot shape branches are covered above; v8 reports a synthetic negative branch for this type guard. */
          if (!isGraphState(values)) {
            return checkpointId ? { state: currentState, checkpointId } : null;
          }
          return {
            state: values,
            ...(checkpointId ? { checkpointId } : {}),
          };
        };
      if (debugEnabled) {
        write({
          type: "status",
          message: `🧵 thread_id=${threadId} run_id=${runId} workflow=${currentState.currentWorkflow}`,
        });
      }

      // Stream runtime events (LLM deltas, node starts/ends, etc.)
      const isResume = Boolean((currentGraph.config as any)?.resume);
      // For static breakpoints, resume with null input; if a resumeUpdate was provided,
      // use Command({ update }) to merge selection into state at resume time.
      const resumeUpdate = (currentGraph.config as any)?.resumeUpdate as
        | Record<string, unknown>
        | undefined;
      const resumeValue = (currentGraph.config as any)?.resumeValue as
        | unknown
        | undefined;
      const resumeCheckpointId = (currentGraph.config as any)
        ?.resumeCheckpointId as string | undefined;
      const invokeState = isResume
        ? resumeValue !== undefined && resumeUpdate
          ? (new Command({ resume: resumeValue, update: resumeUpdate }) as any)
          : resumeValue !== undefined
            ? (new Command({ resume: resumeValue }) as any)
            : resumeUpdate
              ? (new Command({ update: resumeUpdate }) as any)
              : (null as any)
        : (currentState as any);
      const runtimeStream = currentGraph.streamEvents(invokeState, {
        version: "v2",
        configurable: {
          thread_id: runId,
          checkpoint_ns: checkpointNs,
          ...(isResume && resumeCheckpointId
            ? { checkpoint_id: resumeCheckpointId }
            : {}),
        },
      });

      if (debugEnabled) {
        write({
          type: "status",
          message: `▶️ streamEvents invoke: resume=${Boolean((currentGraph.config as any)?.resume)} thread_id=${threadId} run_id=${runId} ns=${String(currentState.currentWorkflow || "default")}`,
        } as any);
      }

      // Observe engine state independently of UI chunks or their consumers.
      const observedStream = (async function* () {
        for await (const event of runtimeStream) {
          const raw = event as {
            event?: string;
            name?: string;
            data?: { output?: unknown };
          };
          if (
            (raw.event === "on_chain_end" || raw.event === "on_graph_end") &&
            !raw.name?.startsWith("ChannelWrite") &&
            isGraphState(raw.data?.output)
          ) {
            outcomeState = raw.data.output;
          }
          yield event;
        }
      })();
      const uiStream = transformGraphStreamForUI(observedStream as any, {
        debug: debugEnabled,
        emitStatus: debugEnabled,
      });

      if (!emitOutput) {
        for await (const _event of observedStream) {
          if (finished) break;
        }
        sawWorkflowDone = true;
        workflowDoneData = outcomeState;
      }
      for await (const chunk of (emitOutput
        ? uiStream
        : []) as AsyncIterable<StreamChunk>) {
        if (finished) break;
        if ("node" in chunk && typeof chunk.node === "string") {
          touchedNodes.add(chunk.node);
        }

        if (chunk.type === "done") {
          sawWorkflowDone = true;
          workflowDoneData = chunk.data;
          continue;
        }

        write(chunk);
      }

      if (finished) {
        runTraceSpan.fail?.(outcomeError);
        return;
      }

      if (sawWorkflowDone) {
        const graphSnapshot = await readLatestGraphSnapshot();
        workflowFinalGraphCheckpointId = graphSnapshot?.checkpointId;
        workflowFinalState = isGraphState(workflowDoneData)
          ? workflowDoneData
          : (graphSnapshot?.state ?? currentState);
      }

      throwIfExecutionAborted(abortSignal);
      const transitionTo = pending.to;
      const transitionPayload = pending.payload;
      const sourceNodeId = pending.sourceNodeId;
      const sourceWorkflowId = pending.sourceWorkflowId;

      // Reset pending so we don't carry it accidentally
      pending.to = null;
      pending.payload = {};
      pending.sourceNodeId = undefined;
      pending.sourceWorkflowId = undefined;

      if (transitionTo) {
        // 🔁 Handoff to the next workflow
        try {
          const nextWorkflow = await selectWorkflow(transitionTo);
          const sourceTelemetry = isRecord(config.telemetry)
            ? config.telemetry
            : {};
          config = prepareWorkflowTelemetry({
            config,
            workflow: nextWorkflow,
            runId,
            sessionId,
            knownWorkflowIds,
          });
          const targetTelemetry = isRecord(config.telemetry)
            ? config.telemetry
            : {};
          emitTelemetryEvent({
            config,
            type: "workflow.transitioned",
            ...(sourceNodeId ? { correlation: { nodeId: sourceNodeId } } : {}),
            payload: {
              sourceNodeId: sourceNodeId ?? "",
              sourceWorkflowId:
                sourceWorkflowId ?? String(currentState.currentWorkflow),
              ...(typeof sourceTelemetry.correlation === "object" &&
              sourceTelemetry.correlation &&
              typeof (sourceTelemetry.correlation as Record<string, unknown>)
                .workflowRevisionId === "string"
                ? {
                    sourceWorkflowRevisionId: (
                      sourceTelemetry.correlation as Record<string, unknown>
                    ).workflowRevisionId,
                  }
                : {}),
              targetWorkflowId: transitionTo,
              ...(typeof targetTelemetry.correlation === "object" &&
              targetTelemetry.correlation &&
              typeof (targetTelemetry.correlation as Record<string, unknown>)
                .workflowRevisionId === "string"
                ? {
                    targetWorkflowRevisionId: (
                      targetTelemetry.correlation as Record<string, unknown>
                    ).workflowRevisionId,
                  }
                : {}),
            },
          });
          // Resume controls belong only to the graph restored from the checkpoint.
          delete config.resume;
          delete config.resumeValue;
          delete config.resumeUpdate;
          delete config.resumeCheckpointId;
          const nextGraph = await createExecutionGraph(nextWorkflow, {
            ...(config as Record<string, unknown>),
            emit: forwardEmit, // keep forwarding emits
          });

          // Merge data: prefer the final state's data if present, then add transition payload
          const mergedData = {
            ...(workflowFinalState?.data ?? currentState.data ?? {}),
            ...transitionPayload,
          };

          const rawInputFromPayload = (
            transitionPayload as {
              rawInput?: unknown;
            }
          )?.rawInput;
          const rawNextInput =
            typeof rawInputFromPayload === "string"
              ? rawInputFromPayload
              : currentState.input;

          currentState = {
            ...currentState,
            runtime: workflowFinalState?.runtime ?? currentState.runtime,
            currentWorkflow: transitionTo as WorkflowId,
            config,
            input: nextWorkflow.inputSchema
              ? parseExecutionInput(nextWorkflow, rawNextInput)
              : rawNextInput,
            data: mergedData,
            ui: {}, // reset UI layer on new graph
          };

          currentGraph = nextGraph;
          continue; // run the next graph
        } catch (err) {
          throwIfExecutionAborted(abortSignal);
          if (isExecutionCancelled(err)) throw err;
          outcomeError = err;
          runTraceSpan.fail?.(err);
          runTraceSpan.addEvent?.("kortyx.transition.error", {
            transitionTo,
          });
          write({
            type: "error",
            message: `Transition failed to '${transitionTo}': ${
              err instanceof Error ? err.message : String(err)
            }`,
          });
          write({ type: "done" });
          out.end();
          return;
        }
      }

      // No transition → either graph returned done or ended naturally
      if (workflowFinalState) {
        // If we paused for an interrupt, persist a pending request and emit an interrupt chunk
        // Attach final state to pending record if we have one
        if (workflowFinalState && pendingRecordToken) {
          if (pendingRequestWrites.length > 0) {
            await Promise.all(pendingRequestWrites);
          }
          if (pendingStore) {
            await pendingStore.update(pendingRecordToken, {
              state: workflowFinalState,
              ...(workflowFinalGraphCheckpointId
                ? { graphCheckpointId: workflowFinalGraphCheckpointId }
                : {}),
            });
          }
          const pendingRequest = activePendingRequests.get(pendingRecordToken);
          /* v8 ignore next -- pendingRecordToken is assigned only after the active request is inserted. */
          if (pendingRequest) {
            activePendingRequests.set(pendingRecordToken, {
              ...pendingRequest,
              state: workflowFinalState,
              ...(workflowFinalGraphCheckpointId
                ? { graphCheckpointId: workflowFinalGraphCheckpointId }
                : {}),
            });
          }
        }
        /* v8 ignore next -- pending writes are created only by interrupt persistence, which also sets pendingRecordToken. */
        if (!pendingRecordToken && pendingRequestWrites.length > 0) {
          await Promise.all(pendingRequestWrites);
        }

        const shouldKeepFrameworkState =
          Boolean(pendingRecordToken) ||
          Boolean((workflowFinalState as any)?.awaitingHumanInput);
        if (!shouldKeepFrameworkState) {
          workflowFinalState = await validateExecutionOutput(
            workflowFinalState,
            selectWorkflow,
          );
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

        outcomeState = workflowFinalState;
        if (!emitOutput && !shouldKeepFrameworkState)
          accumulatedOutput = JSON.stringify(workflowFinalState.data).slice(
            0,
            65536,
          );
        finished = true;
        runTraceSpan.setAttributes?.({
          "kortyx.run.awaiting_human_input": shouldKeepFrameworkState,
          "kortyx.run.final_workflow": String(currentState.currentWorkflow),
        });
        runTraceSpan.end?.(runTraceEndArgs());
        const resolvedSessionId =
          ((config as any)?.session?.id as string | undefined) ||
          sessionId ||
          "";
        await sealPendingSnapshots();
        if (
          !response.closed &&
          resolvedSessionId &&
          frameworkAdapter?.sessionCheckpoints
        ) {
          try {
            const checkpoint = await frameworkAdapter.sessionCheckpoints.append(
              {
                sessionId: resolvedSessionId,
                runId,
                ...(workflowFinalGraphCheckpointId
                  ? { graphCheckpointId: workflowFinalGraphCheckpointId }
                  : {}),
                workflow: String(workflowFinalState.currentWorkflow),
                state: workflowFinalState,
                nodes: Array.from(touchedNodes),
                structuredStreamIds: Array.from(structuredStreamIds),
                pendingRequests: Array.from(activePendingRequests.values()),
              },
            );
            sessionCheckpointId = checkpoint.id;
            write({
              type: "checkpoint",
              id: checkpoint.id,
              sessionId: checkpoint.sessionId,
              turnIndex: checkpoint.turnIndex,
              ...(checkpoint.label ? { label: checkpoint.label } : {}),
            } as StreamChunk);
            emitTelemetryEvent({
              config,
              type: "session.checkpointed",
              payload: {
                checkpointId: checkpoint.id,
                turnIndex: checkpoint.turnIndex,
                ...(checkpoint.parentCheckpointId
                  ? { parentCheckpointId: checkpoint.parentCheckpointId }
                  : {}),
                nodes: checkpoint.nodes,
              },
            });
          } catch (error) {
            // eslint-disable-next-line no-console
            outcomeError = error;
            console.error("[orchestrator] session checkpoint failed", error);
          }
        }
        write({ type: "done", data: workflowFinalState } as any);
        out.end();
        return;
      }

      // Natural end with no explicit "done" (defensive close)
      const naturalGraphSnapshot = await readLatestGraphSnapshot();
      let naturalFinalState = naturalGraphSnapshot?.state ?? currentState;
      if (!pendingRecordToken && !naturalFinalState.awaitingHumanInput) {
        naturalFinalState = await validateExecutionOutput(
          naturalFinalState,
          selectWorkflow,
        );
      }
      outcomeState = naturalFinalState;
      if (pendingRequestWrites.length > 0) {
        await Promise.all(pendingRequestWrites);
      }
      if (pendingRecordToken && naturalGraphSnapshot?.checkpointId) {
        if (pendingStore) {
          await pendingStore.update(pendingRecordToken, {
            state: naturalFinalState,
            graphCheckpointId: naturalGraphSnapshot.checkpointId,
          });
        }
        const pendingRequest = activePendingRequests.get(pendingRecordToken);
        /* v8 ignore next -- pendingRecordToken is assigned only after the active request is inserted. */
        if (pendingRequest) {
          activePendingRequests.set(pendingRecordToken, {
            ...pendingRequest,
            state: naturalFinalState,
            graphCheckpointId: naturalGraphSnapshot.checkpointId,
          });
        }
      }
      const resolvedSessionId =
        ((config as any)?.session?.id as string | undefined) || sessionId || "";
      await sealPendingSnapshots();
      if (
        !response.closed &&
        resolvedSessionId &&
        frameworkAdapter?.sessionCheckpoints
      ) {
        try {
          const checkpoint = await frameworkAdapter.sessionCheckpoints.append({
            sessionId: resolvedSessionId,
            runId,
            ...(naturalGraphSnapshot?.checkpointId
              ? { graphCheckpointId: naturalGraphSnapshot.checkpointId }
              : {}),
            workflow: String(naturalFinalState.currentWorkflow),
            state: naturalFinalState,
            nodes: Array.from(touchedNodes),
            structuredStreamIds: Array.from(structuredStreamIds),
            pendingRequests: Array.from(activePendingRequests.values()),
          });
          sessionCheckpointId = checkpoint.id;
          write({
            type: "checkpoint",
            id: checkpoint.id,
            sessionId: checkpoint.sessionId,
            turnIndex: checkpoint.turnIndex,
            ...(checkpoint.label ? { label: checkpoint.label } : {}),
          } as StreamChunk);
          emitTelemetryEvent({
            config,
            type: "session.checkpointed",
            payload: {
              checkpointId: checkpoint.id,
              turnIndex: checkpoint.turnIndex,
              ...(checkpoint.parentCheckpointId
                ? { parentCheckpointId: checkpoint.parentCheckpointId }
                : {}),
              nodes: checkpoint.nodes,
            },
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          outcomeError = error;
          console.error("[orchestrator] session checkpoint failed", error);
        }
      }
      runTraceSpan.setAttributes?.({
        "kortyx.run.final_workflow": String(naturalFinalState.currentWorkflow),
      });
      finished = true;
      runTraceSpan.end?.(runTraceEndArgs());
      write({ type: "done", data: naturalFinalState } as any);
      out.end();
      return;
    }
  };

  const emitTraceChunk = () => {
    const traceContext = traceAdapter?.getActiveContext?.();
    if (!traceContext) return;

    write({
      type: "trace",
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      runId,
      rootSpanName: "kortyx.run",
    } satisfies StreamChunk);
  };

  const fallbackRunSpan = traceAdapter?.withSpan
    ? undefined
    : traceAdapter?.startSpan?.(runSpanArgs);
  if (!traceAdapter?.withSpan) {
    emitTraceChunk();
  }
  const runPromise = traceAdapter?.withSpan
    ? traceAdapter.withSpan(runSpanArgs, (runTraceSpan) => {
        emitTraceChunk();
        return runLoop(runTraceSpan);
      })
    : runLoop(fallbackRunSpan ?? {});

  const finishCancelled = async () => {
    emitTelemetryEvent({
      config,
      type: "run.cancelled",
      correlation: { runId, workflowId: outcomeState.currentWorkflow },
      payload: { reason: "execution_aborted" },
      flush: true,
    });
    await Promise.allSettled(pendingRequestWrites);
    await Promise.allSettled(
      [...activePendingRequests.keys()].map((token) =>
        pendingStore?.delete(token),
      ),
    );
    activePendingRequests.clear();
    try {
      await frameworkAdapter?.cleanupRun?.(runId, [...namespacesUsed]);
    } catch (cleanupError) {
      console.error("[cancel:cleanupRun]", cleanupError);
    }
    outcomeError = createExecutionCancelledError();
    fallbackRunSpan?.setAttributes?.({ "kortyx.run.cancelled": true });
    fallbackRunSpan?.end?.();
    write({ type: "cancelled", runId, reason: "Execution cancelled." });
    write({ type: "done" });
    finished = true;
    out.end();
  };

  const completion = runPromise
    .catch(async (err) => {
      if (abortSignal?.aborted || isExecutionCancelled(err)) {
        await finishCancelled();
        return;
      }
      if (isExecutionLimitReached(err)) {
        try {
          const snapshot =
            frameworkAdapter &&
            (await captureGraphSnapshot(frameworkAdapter.checkpointer, runId));
          throwIfExecutionAborted(abortSignal);
          if (!snapshot)
            throw new Error(
              "Execution limit reached without a resumable checkpoint.",
            );
          const savedState = snapshot.checkpoint
            .channel_values as unknown as GraphState;
          const pausedState: GraphState = {
            ...savedState,
            config: {
              ...savedState.config,
              ...config,
              executionBudget: budget,
            },
            awaitingHumanInput: true,
          };
          // Keep the existing hook replay cache, but do not checkpoint individual tool steps.
          const patch = (
            err as unknown as {
              __kortyxHookStatePatch?: Record<string, unknown>;
            }
          ).__kortyxHookStatePatch;
          currentState = pausedState;
          outcomeState = pausedState;
          const limitReached = err.limitReached;
          write({ type: "limit-reached", runId, ...limitReached });
          emitTelemetryEvent({
            config,
            type: "run.limit_reached",
            payload: limitReached,
          });
          await persistAndEmitInterrupt({
            node: String(
              (err as unknown as { nodeId?: string }).nodeId ??
                savedState.lastNode,
            ),
            workflow: String(savedState.currentWorkflow),
            input: {
              kind: "choice",
              question: "Limit reached — Continue?",
              options: [{ id: "continue", label: "Continue" }],
              meta: {
                __kortyxExecutionLimit: true,
                executionLimit: limitReached,
                ...(patch ? { __kortyxResumeStatePatch: patch } : {}),
              },
            },
          });
          await Promise.all(pendingRequestWrites);
          throwIfExecutionAborted(abortSignal);
          if (outcomeError) throw outcomeError;
          const request = activePendingRequests.get(pendingRecordToken!)!;
          const sealed = {
            ...request,
            state: pausedState,
            graphCheckpointId: snapshot.checkpoint.id,
            graphSnapshot: snapshot,
            ready: true,
          };
          activePendingRequests.set(request.token, sealed);
          await pendingStore?.update(request.token, sealed);
          if (response.closed) pausedState.config.responseCompleted = true;
          if (!response.closed) {
            const checkpoint =
              await frameworkAdapter!.sessionCheckpoints.append({
                sessionId: sessionId!,
                runId,
                graphCheckpointId: snapshot.checkpoint.id,
                workflow: String(pausedState.currentWorkflow),
                state: pausedState,
                nodes: Array.from(touchedNodes),
                structuredStreamIds: Array.from(structuredStreamIds),
                pendingRequests: [sealed],
                label: "Execution limit reached",
              });
            throwIfExecutionAborted(abortSignal);
            sessionCheckpointId = checkpoint.id;
            write({
              type: "checkpoint",
              id: checkpoint.id,
              sessionId: checkpoint.sessionId,
              turnIndex: checkpoint.turnIndex,
              label: checkpoint.label,
            });
            emitTelemetryEvent({
              config,
              type: "session.checkpointed",
              payload: {
                checkpointId: checkpoint.id,
                turnIndex: checkpoint.turnIndex,
                nodes: checkpoint.nodes,
              },
            });
          }
          fallbackRunSpan?.setAttributes?.({
            "kortyx.run.awaiting_human_input": true,
            "kortyx.run.limit_reached": limitReached.limit,
          });
          fallbackRunSpan?.end?.();
          finished = true;
          write({ type: "done" });
          out.end();
          return;
        } catch (pauseError) {
          if (abortSignal?.aborted || isExecutionCancelled(pauseError)) {
            await finishCancelled();
            return;
          }
          await Promise.allSettled(
            [...activePendingRequests.keys()].map((token) =>
              pendingStore?.delete(token),
            ),
          );
          activePendingRequests.clear();
          err = pauseError;
        }
      }
      outcomeError = err;
      fallbackRunSpan?.fail?.(err);
      emitResumeFailure(err);
      console.error("[error:orchestrateGraphStream]", err);
      write({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      write({ type: "done" });
      finished = true;
      out.end();
    })
    .finally(() => {
      response.dispose();
      onOutcome?.({
        state: outcomeState,
        pending: pendingRecordToken
          ? activePendingRequests.get(pendingRecordToken)
          : undefined,
        checkpointId: sessionCheckpointId,
        ...(outcomeError ? { error: outcomeError } : {}),
      });
    });

  onExecution?.(completion);
  if (response.closed) out.end();
  return out;
}
