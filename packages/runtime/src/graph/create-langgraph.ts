import type {
  GraphState,
  NodeConfig,
  NodeContext,
  NodeResult,
  WorkflowDefinition,
} from "@kortyx/core";
import { runWithHookContext } from "@kortyx/hooks";
import type { MemoryAdapter } from "@kortyx/memory";
import type { GetProviderFn } from "@kortyx/providers";
import { contentToText, deepMergeWithArrayOverwrite } from "@kortyx/utils";
import {
  type AIMessageChunk,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { Annotation, interrupt, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { getCheckpointer } from "../checkpointer";
import { resolveNodeHandler } from "../node-loader";

export interface GraphRuntimeConfig {
  emit?: (event: string, payload: unknown) => void;
  onCheckpoint?: (args: { nodeId: string; state: GraphState }) => void;
  memoryAdapter?: MemoryAdapter;
  checkpointer?: BaseCheckpointSaver;
  /**
   * Provider factory used by ctx.speak to obtain a streaming model.
   * Use @kortyx/providers or implement your own GetProviderFn.
   */
  getProvider?: GetProviderFn;
  [key: string]: unknown;
}

export async function createLangGraph(
  workflow: WorkflowDefinition,
  config: GraphRuntimeConfig,
) {
  const StateAnnotation = Annotation.Root({
    input: Annotation<unknown>,
    output: Annotation<string>,
    lastNode: Annotation<string>,
    lastCondition: Annotation<string>,
    lastIntent: Annotation<string>,
    memory: Annotation<Record<string, unknown>>({
      reducer: (l, r) => deepMergeWithArrayOverwrite(l ?? {}, r ?? {}),
      default: () => ({}),
    }),
    config: Annotation<unknown>,
    transitionTo: Annotation<string | null>,
    data: Annotation<Record<string, unknown>>({
      reducer: (l, r) => deepMergeWithArrayOverwrite(l ?? {}, r ?? {}),
      default: () => ({}),
    }),
    conversationHistory: Annotation<
      Array<{ node: string; message: string; timestamp: string }>
    >({
      reducer: (l, r) => [...(l ?? []), ...(r ?? [])],
      default: () => [],
    }),
    awaitingHumanInput: Annotation<boolean>,
  });

  const builder = new StateGraph(StateAnnotation);
  const edgeApi = builder as unknown as {
    addEdge: (from: string, to: string) => void;
    addConditionalEdges: (
      from: string,
      fn: (s: GraphState) => string,
      mapping: Record<string, string>,
    ) => void;
    compile: () => any;
  };
  const workflowName = workflow.id;

  // Ensure an emit function exists so ctx.emit can always call without optional chaining
  type WithEmit = GraphRuntimeConfig & {
    emit: (event: string, payload: unknown) => void;
  };
  const runtimeConfig = config as WithEmit;
  if (!runtimeConfig.emit) {
    runtimeConfig.emit = () => {};
  }

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const toRecordInput = (value: unknown): Record<string, unknown> => {
    if (isRecord(value)) return value;
    if (value === undefined) return {};
    return { rawInput: value };
  };

  const buildNodeConfig = (
    params: Record<string, unknown> | undefined,
    nodeBehavior: Record<string, unknown> | undefined,
  ): NodeConfig => {
    const model = isRecord(params?.model) ? (params!.model as any) : undefined;
    const tool = isRecord(params?.tool) ? (params!.tool as any) : undefined;
    const behaviorFromParams = isRecord(params?.behavior)
      ? (params!.behavior as any)
      : undefined;
    const behavior = {
      ...(behaviorFromParams ?? {}),
      ...(nodeBehavior ?? {}),
    } as any;
    const options = params ?? undefined;
    return {
      ...(model ? { model } : {}),
      ...(tool ? { tool } : {}),
      ...(Object.keys(behavior).length > 0 ? { behavior } : {}),
      ...(options ? { options } : {}),
    } as NodeConfig;
  };

  for (const [nodeId, nodeDef] of Object.entries(workflow.nodes ?? {})) {
    const resolvedRun = await resolveNodeHandler({
      run: nodeDef.run,
      workflow,
    });
    const nodeParams = (nodeDef.params ?? undefined) as
      | Record<string, unknown>
      | undefined;
    const nodeConfig: NodeConfig = buildNodeConfig(
      nodeParams,
      (nodeDef.behavior ?? undefined) as unknown as
        | Record<string, unknown>
        | undefined,
    );
    const behavior = nodeConfig.behavior ?? {};

    builder.addNode(nodeId, async (state: GraphState) => {
      const ctx = {
        graph: { name: workflowName, node: nodeId },
        config: nodeConfig,
        emit: (event: string, payload: unknown) => {
          runtimeConfig.emit(event, payload);
        },
        error: (message: string) => {
          runtimeConfig.emit("error", {
            node: nodeId,
            message,
          });
        },
        awaitInterrupt: (interruptConfig: any) => {
          const { kind, question } = interruptConfig;
          const isMulti =
            kind === "multi-choice" ||
            (interruptConfig.kind !== "text" &&
              interruptConfig.multiple === true);
          const payload: any = {
            kind,
            multiple: isMulti,
            question,
            ...(interruptConfig.kind !== "text"
              ? { options: interruptConfig.options }
              : {}),
          };
          runtimeConfig.emit("interrupt", {
            node: nodeId,
            workflow: workflowName,
            input: payload,
          });
          const resumed = interrupt(payload) as unknown;
          if (isMulti) {
            if (Array.isArray(resumed)) {
              return (resumed as any[])
                .map((v) =>
                  typeof v === "string"
                    ? v
                    : v && typeof (v as any).id === "string"
                      ? (v as any).id
                      : "",
                )
                .filter(Boolean) as string[];
            }
            if (typeof resumed === "string") return [resumed];
            return [];
          }
          if (typeof resumed === "string") return resumed;
          if (resumed && typeof (resumed as any).id === "string")
            return String((resumed as any).id);
          return "";
        },
        speak: async (
          args: Parameters<NodeContext["speak"]>[0],
        ): Promise<string> => {
          const providerId =
            args.model?.provider ?? nodeConfig.model?.provider ?? "google";
          const modelName =
            args.model?.name ?? nodeConfig.model?.name ?? "gemini-2.5-flash";
          const temperature =
            args.model?.temperature ?? nodeConfig.model?.temperature ?? 0.3;

          const getProvider = runtimeConfig.getProvider;
          if (!getProvider) {
            throw new Error(
              "Runtime config is missing getProvider; wire a provider factory into @kortyx/runtime.",
            );
          }

          const model = getProvider(providerId, modelName, {
            temperature,
            streaming: true,
          });

          const messages = [
            ...(args.system ? [new SystemMessage(args.system)] : []),
            new HumanMessage(args.user ?? ""),
          ];

          let final = "";
          const t0 = Date.now();
          let seenFirst = false;

          const isSilent = false;

          if (!isSilent) ctx.emit("text-start", { node: nodeId });

          const stream = await model.stream(messages);
          for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
            const part = contentToText(chunk.content as unknown);
            if (!part) continue;
            if (!seenFirst) {
              seenFirst = true;
              const ttft = Date.now() - t0;
              ctx.emit("status", {
                node: nodeId,
                message: `⏱️ TTFT ${ttft}ms`,
              });
            }
            final += part;
            if (!isSilent)
              ctx.emit("text-delta", { node: nodeId, delta: part });
          }

          if (!isSilent) ctx.emit("text-end", { node: nodeId });
          const t1 = Date.now();
          if (seenFirst)
            ctx.emit("status", {
              node: nodeId,
              message: `✅ Stream done in ${t1 - t0}ms`,
            });
          return final;
        },
      } satisfies NodeContext;

      if (behavior.checkpoint && config?.onCheckpoint) {
        config.onCheckpoint({ nodeId, state });
      }

      const maxAttempts = behavior.retry?.maxAttempts ?? 1;
      let attempt = 0;
      let nodeResult: NodeResult | undefined;
      let hookMemoryUpdates: Record<string, unknown> | null = null;
      let retryHookMemory: Record<string, unknown> | null = null;

      while (attempt < maxAttempts) {
        try {
          attempt++;
          const attemptState =
            retryHookMemory && typeof retryHookMemory === "object"
              ? ({
                  ...state,
                  memory: deepMergeWithArrayOverwrite(
                    (state.memory ?? {}) as Record<string, unknown>,
                    retryHookMemory,
                  ),
                } as GraphState)
              : state;
          const hookContext = {
            node: ctx,
            state: attemptState,
            ...(runtimeConfig.getProvider
              ? { getProvider: runtimeConfig.getProvider }
              : {}),
            ...(runtimeConfig.memoryAdapter
              ? { memoryAdapter: runtimeConfig.memoryAdapter }
              : {}),
          };
          const hookRun = await runWithHookContext(hookContext, async () =>
            resolvedRun({
              input: state.input,
              params: (nodeParams ?? {}) as Record<string, unknown>,
            }),
          );
          nodeResult = hookRun.result as NodeResult;
          hookMemoryUpdates = hookRun.memoryUpdates;
          break;
        } catch (err) {
          const patch = (err as any)?.__kortyxMemoryUpdates as
            | Record<string, unknown>
            | null
            | undefined;
          if (patch && typeof patch === "object") {
            retryHookMemory = deepMergeWithArrayOverwrite(
              (retryHookMemory ?? {}) as Record<string, unknown>,
              patch,
            );
          }
          const hasMore = attempt < maxAttempts;
          const delayMs = behavior.retry?.delayMs ?? 0;
          if (hasMore && delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          if (!hasMore) throw err;
        }
      }

      const res: NodeResult = (nodeResult ?? {}) as NodeResult;
      if (hookMemoryUpdates) {
        res.infra = {
          ...(res.infra ?? {}),
          memory: deepMergeWithArrayOverwrite(
            ((res.infra?.memory ?? {}) as Record<string, unknown>) || {},
            hookMemoryUpdates,
          ),
        };
      }
      const uiMessage = res.ui?.message;
      const shouldRespond =
        typeof uiMessage === "string" && uiMessage.trim().length > 0;

      if (shouldRespond) {
        ctx.emit("message", { node: nodeId, content: uiMessage });
      }

      if (res.transitionTo) {
        ctx.emit("transition", {
          transitionTo: res.transitionTo,
          payload: res.data ?? {},
        });
      }

      const updates: Record<string, unknown> = {};

      if (typeof res.condition === "string")
        updates.lastCondition = res.condition;
      if (typeof res.intent === "string") updates.lastIntent = res.intent;

      if (res.data && typeof res.data === "object") {
        // Treat node `data` as the flowing payload between nodes.
        // Accumulate by merging into the previous input (if any).
        updates.input = deepMergeWithArrayOverwrite(
          toRecordInput(state.input),
          res.data as Record<string, unknown>,
        );
        updates.data = deepMergeWithArrayOverwrite(
          (state.data ?? {}) as Record<string, unknown>,
          res.data as Record<string, unknown>,
        );
      }
      if (res.infra?.memory && typeof res.infra.memory === "object") {
        updates.memory = deepMergeWithArrayOverwrite(
          (state.memory ?? {}) as Record<string, unknown>,
          res.infra.memory as Record<string, unknown>,
        );
      }

      if (res.ui) {
        updates.ui = {
          message:
            typeof res.ui.message === "string"
              ? res.ui.message
              : (state.ui?.message ?? ""),
          structured: deepMergeWithArrayOverwrite(
            (state.ui?.structured ?? {}) as Record<string, unknown>,
            (res.ui.structured ?? {}) as Record<string, unknown>,
          ),
        };
      }

      if (shouldRespond && uiMessage) {
        updates.conversationHistory = [
          ...(state.conversationHistory ?? []),
          {
            node: nodeId,
            message: uiMessage,
            timestamp: new Date().toISOString(),
          },
        ];
      }

      if (res.ui?.structured) {
        const payload = res.ui.structured as Record<string, unknown>;
        const inferredType =
          payload && typeof payload === "object" && "jobs" in payload
            ? "jobs"
            : typeof (payload as { summary?: unknown }).summary === "string" ||
                (payload as { topJobs?: unknown }).topJobs
              ? "summary"
              : "generic";
        ctx.emit("structured_data", {
          node: nodeId,
          dataType: inferredType,
          data: payload,
        });
      }

      return updates as any;
    });
  }

  type EdgeTriple = readonly [string, string, { when?: string }?];
  const condGroups: Record<string, Array<{ when: string; to: string }>> = {};
  const plainEdges: Array<[string, string]> = [];

  for (const edge of workflow.edges as unknown as EdgeTriple[]) {
    const [from, to, condition] = edge as unknown as EdgeTriple;
    if (condition && typeof condition.when === "string" && condition.when) {
      if (!condGroups[from]) condGroups[from] = [];
      condGroups[from].push({ when: condition.when, to });
    } else {
      plainEdges.push([from, to]);
    }
  }

  for (const [from, to] of plainEdges) {
    edgeApi.addEdge(from, to);
  }

  for (const [from, rules] of Object.entries(condGroups)) {
    const mapping: Record<string, string> = Object.fromEntries(
      rules.map((r) => [r.when, r.to]),
    );
    const fallbackKey = `__default__:${from}`;
    mapping[fallbackKey] = "__end__";
    edgeApi.addConditionalEdges(
      from,
      (s: GraphState) => {
        const trigger = s.lastCondition ?? s.lastIntent;
        if (trigger && Object.hasOwn(mapping, trigger as string)) {
          return trigger as string;
        }
        return fallbackKey;
      },
      mapping,
    );
  }

  const sessionId = (config as any)?.session?.id ?? "__default__";
  const checkpointer = config.checkpointer ?? getCheckpointer(sessionId);
  const graph = (builder as any).compile({ checkpointer });

  interface GraphExtensions {
    name: string;
    config: GraphRuntimeConfig;
    resume(state: GraphState, input: unknown): Promise<GraphState>;
    timeTravelTo(state: GraphState, checkpointId: string): Promise<GraphState>;
  }
  type RuntimeGraph = typeof graph & GraphExtensions;

  const runtimeGraph = graph as RuntimeGraph;
  runtimeGraph.name = workflow.id;
  runtimeGraph.config = config;

  runtimeGraph.resume = async (state: GraphState, input: unknown) => {
    const resumed = { ...state, input, awaitingHumanInput: false };
    return graph.invoke(resumed as any) as unknown as GraphState;
  };

  runtimeGraph.timeTravelTo = async (
    state: GraphState,
    checkpointId: string,
  ) => {
    const checkpoints = (
      state.memory as { checkpoints?: Record<string, { snapshot: unknown }> }
    )?.checkpoints;
    const snapshot = checkpoints?.[checkpointId];
    if (!snapshot) throw new Error(`Checkpoint '${checkpointId}' not found`);
    return graph.invoke(
      snapshot.snapshot as unknown as Partial<
        (typeof StateAnnotation)["State"]
      >,
    ) as unknown as GraphState;
  };

  return runtimeGraph;
}
