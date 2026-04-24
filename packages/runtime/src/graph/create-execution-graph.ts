import type {
  GraphState,
  InterruptInput,
  InterruptResult,
  NodeConfig,
  NodeContext,
  NodeResult,
  WorkflowDefinition,
} from "@kortyx/core";
import type { ReasonTraceAdapter } from "@kortyx/hooks";
import { runWithHookContext } from "@kortyx/hooks";
import { runReasonEngine } from "@kortyx/hooks/internal";
import type { GetProviderFn } from "@kortyx/providers";
import { deepMergeWithArrayOverwrite } from "@kortyx/utils";
import { Annotation, interrupt, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { getCheckpointer } from "../checkpointer";
import { resolveNodeHandler } from "../node-loader";

interface CompiledGraphBase {
  invoke(state: unknown): Promise<unknown>;
  streamEvents(
    state: GraphState,
    options?: { version?: string; configurable?: Record<string, unknown> },
  ): AsyncIterable<unknown> | AsyncGenerator<unknown>;
}

interface GraphExtensions {
  name: string;
  config: ExecutionRuntimeConfig;
  resume(state: GraphState, input: unknown): Promise<GraphState>;
  timeTravelTo(state: GraphState, checkpointId: string): Promise<GraphState>;
}

interface InterruptResultWithId {
  id: string;
}

interface HookPatchError {
  __kortyxHookStatePatch?: Record<string, unknown> | null;
}

export interface ExecutionRuntimeConfig {
  emit?: (event: string, payload: unknown) => void;
  onCheckpoint?: (args: { nodeId: string; state: GraphState }) => void;
  checkpointer?: BaseCheckpointSaver;
  reasonTrace?: ReasonTraceAdapter;
  /**
   * Provider factory used by ctx.speak to obtain a streaming model.
   * Use @kortyx/providers or implement your own GetProviderFn.
   */
  getProvider?: GetProviderFn;
  [key: string]: unknown;
}

export async function createExecutionGraph(
  workflow: WorkflowDefinition,
  config: ExecutionRuntimeConfig,
) {
  const StateAnnotation = Annotation.Root({
    input: Annotation<unknown>,
    output: Annotation<string>,
    lastNode: Annotation<string>,
    lastCondition: Annotation<string>,
    lastIntent: Annotation<string>,
    runtime: Annotation<Record<string, unknown>>({
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
    compile: (args: { checkpointer: BaseCheckpointSaver }) => CompiledGraphBase;
  };
  const workflowName = workflow.id;

  // Ensure an emit function exists so ctx.emit can always call without optional chaining
  type WithEmit = ExecutionRuntimeConfig & {
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
    const model = isRecord(params?.model)
      ? (params.model as NodeConfig["model"])
      : undefined;
    const tool = isRecord(params?.tool)
      ? (params.tool as NodeConfig["tool"])
      : undefined;
    const behaviorFromParams = isRecord(params?.behavior)
      ? (params.behavior as NodeConfig["behavior"])
      : undefined;
    const behavior: NonNullable<NodeConfig["behavior"]> = {
      ...(behaviorFromParams ?? {}),
      ...(nodeBehavior ?? {}),
    };
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
        awaitInterrupt: (interruptConfig: InterruptInput): InterruptResult => {
          const { kind, question } = interruptConfig;
          const isMulti =
            kind === "multi-choice" ||
            (interruptConfig.kind !== "text" &&
              interruptConfig.multiple === true);
          const sharedInterruptFields = {
            ...(typeof interruptConfig.id === "string" &&
            interruptConfig.id.length > 0
              ? { id: interruptConfig.id }
              : {}),
            ...(typeof interruptConfig.schemaId === "string" &&
            interruptConfig.schemaId.length > 0
              ? { schemaId: interruptConfig.schemaId }
              : {}),
            ...(typeof interruptConfig.schemaVersion === "string" &&
            interruptConfig.schemaVersion.length > 0
              ? { schemaVersion: interruptConfig.schemaVersion }
              : {}),
            ...(interruptConfig.meta &&
            typeof interruptConfig.meta === "object" &&
            !Array.isArray(interruptConfig.meta)
              ? { meta: interruptConfig.meta }
              : {}),
          };
          const payload: InterruptInput =
            interruptConfig.kind === "text"
              ? {
                  kind: "text",
                  ...(question ? { question } : {}),
                  ...sharedInterruptFields,
                }
              : {
                  kind: interruptConfig.kind,
                  multiple: isMulti,
                  question: interruptConfig.question,
                  options: interruptConfig.options,
                  ...sharedInterruptFields,
                };
          let resumed: unknown;
          try {
            resumed = interrupt(payload) as unknown;
          } catch (error) {
            runtimeConfig.emit("interrupt", {
              node: nodeId,
              workflow: workflowName,
              input: payload,
            });
            throw error;
          }
          if (isMulti) {
            if (Array.isArray(resumed)) {
              return (resumed as unknown[])
                .map((v) =>
                  typeof v === "string"
                    ? v
                    : v &&
                        typeof v === "object" &&
                        "id" in v &&
                        typeof (v as InterruptResultWithId).id === "string"
                      ? (v as InterruptResultWithId).id
                      : "",
                )
                .filter(Boolean);
            }
            if (typeof resumed === "string") return [resumed];
            return [];
          }
          if (typeof resumed === "string") return resumed;
          if (
            resumed &&
            typeof resumed === "object" &&
            "id" in resumed &&
            typeof (resumed as InterruptResultWithId).id === "string"
          ) {
            return String((resumed as InterruptResultWithId).id);
          }
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

          const result = await runReasonEngine({
            model: {
              provider: getProvider(providerId),
              modelId: modelName,
            },
            input: args.user ?? "",
            system: args.system,
            temperature,
            stream: true,
            emit: true,
            nodeId,
            emitEvent: ctx.emit,
            reasonTrace: runtimeConfig.reasonTrace,
          });
          return result.text;
        },
      } satisfies NodeContext;

      if (behavior.checkpoint && config?.onCheckpoint) {
        config.onCheckpoint({ nodeId, state });
      }

      const maxAttempts = behavior.retry?.maxAttempts ?? 1;
      let attempt = 0;
      let nodeResult: NodeResult | undefined;
      let hookRuntimeUpdates: Record<string, unknown> | null = null;
      let retryHookRuntime: Record<string, unknown> | null = null;

      while (attempt < maxAttempts) {
        try {
          attempt++;
          const attemptState =
            retryHookRuntime && typeof retryHookRuntime === "object"
              ? ({
                  ...state,
                  runtime: deepMergeWithArrayOverwrite(
                    (state.runtime ?? {}) as Record<string, unknown>,
                    retryHookRuntime,
                  ),
                } as GraphState)
              : state;
          const hookContext = {
            node: ctx,
            state: attemptState,
            reasonTrace: runtimeConfig.reasonTrace,
          };
          const hookRun = await runWithHookContext(hookContext, async () =>
            resolvedRun({
              input: state.input,
              params: (nodeParams ?? {}) as Record<string, unknown>,
            }),
          );
          nodeResult = hookRun.result as NodeResult;
          hookRuntimeUpdates = hookRun.runtimeUpdates;
          break;
        } catch (err) {
          const patch = (err as HookPatchError)?.__kortyxHookStatePatch as
            | Record<string, unknown>
            | null
            | undefined;
          if (patch && typeof patch === "object") {
            // Preserve hook runtime state even when execution pauses via interrupt.
            // Without this merge, checkpointed hook state (e.g. useReason drafts)
            // can be lost before resume.
            state.runtime = deepMergeWithArrayOverwrite(
              (state.runtime ?? {}) as Record<string, unknown>,
              patch,
            );
            retryHookRuntime = deepMergeWithArrayOverwrite(
              (retryHookRuntime ?? {}) as Record<string, unknown>,
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
      if (hookRuntimeUpdates) {
        res.infra = {
          ...(res.infra ?? {}),
          runtime: deepMergeWithArrayOverwrite(
            ((res.infra?.runtime ?? {}) as Record<string, unknown>) || {},
            hookRuntimeUpdates,
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
      if (res.infra?.runtime && typeof res.infra.runtime === "object") {
        updates.runtime = deepMergeWithArrayOverwrite(
          (state.runtime ?? {}) as Record<string, unknown>,
          res.infra.runtime as Record<string, unknown>,
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

      return updates;
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

  const sessionId =
    typeof config.session === "object" &&
    config.session &&
    "id" in config.session &&
    typeof config.session.id === "string"
      ? config.session.id
      : "__default__";
  const checkpointer = config.checkpointer ?? getCheckpointer(sessionId);
  const graph = edgeApi.compile({ checkpointer });

  type RuntimeGraph = typeof graph & GraphExtensions;

  const runtimeGraph = graph as RuntimeGraph;
  runtimeGraph.name = workflow.id;
  runtimeGraph.config = config;

  runtimeGraph.resume = async (state: GraphState, input: unknown) => {
    const resumed = { ...state, input, awaitingHumanInput: false };
    return (await graph.invoke(resumed)) as GraphState;
  };

  runtimeGraph.timeTravelTo = async (
    state: GraphState,
    checkpointId: string,
  ) => {
    const checkpoints = (
      state.runtime as { checkpoints?: Record<string, { snapshot: unknown }> }
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
