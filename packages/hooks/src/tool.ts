import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { combineAbortSignals, throwIfExecutionAborted } from "@kortyx/core";
import { isControlFlowError } from "@kortyx/core/errors";
import type {
  KortyxExecutableTool,
  ToolObservation,
  ToolOutcomeDescriptor,
} from "@kortyx/providers";
import { getHookContext } from "./context";
import { withSafeTraceSpan } from "./safe-tracing";
import type { ReasonTraceAdapter } from "./tracing";
import { emitWorkflowCall } from "./workflow-telemetry";

type ToolScope = {
  tool: KortyxExecutableTool;
  input: unknown;
  signal?: AbortSignal | undefined;
  mode: "direct" | "model";
  providerToolCallId: string;
  adopted: boolean;
  classify?: KortyxExecutableTool["outcomes"] | undefined;
  telemetry?: KortyxExecutableTool["telemetry"] | undefined;
};
const tools = new AsyncLocalStorage<ToolScope>();

export type UseToolArgs<T extends KortyxExecutableTool> = {
  tool: T;
  input: Parameters<T["execute"]> extends []
    ? unknown
    : Parameters<T["execute"]>[0];
  id?: string | undefined;
  abortSignal?: AbortSignal | undefined;
};

function classification(
  tool: KortyxExecutableTool,
  value: unknown,
  thrown: boolean,
  policy = tool.outcomes,
): ToolOutcomeDescriptor {
  const fallback: ToolOutcomeDescriptor = {
    outcome: thrown ? "fault" : "success",
  };
  try {
    if (
      value &&
      typeof value === "object" &&
      "isError" in value &&
      value.isError === true
    )
      fallback.outcome = "fault";
    const result = thrown
      ? policy?.classifyError?.(value)
      : policy?.classifyResult?.(value);
    if (!result || !["success", "denied", "fault"].includes(result.outcome))
      return fallback;
    if (result.outcome !== "denied")
      return thrown || fallback.outcome === "fault"
        ? fallback
        : { outcome: result.outcome };
    const code = result.code;
    return {
      outcome: "denied",
      code:
        typeof code === "string" &&
        /^[A-Z][A-Z0-9_]{0,63}$/.test(code) &&
        policy?.denialCodes?.includes(code)
          ? code
          : "DENIED",
    };
  } catch {
    return fallback;
  }
}

export async function closeOwnedTools(
  owned: readonly KortyxExecutableTool[],
): Promise<void> {
  const closers = new Map<
    NonNullable<KortyxExecutableTool["close"]>,
    KortyxExecutableTool
  >();
  for (const tool of owned) {
    if (tool.closeAfterUse !== false && tool.close && !closers.has(tool.close))
      closers.set(tool.close, tool);
  }
  // Cleanup is a best-effort diagnostic, never a reason to retry a committed operation.
  await Promise.all(
    [...closers].map(async ([close, tool]) => {
      try {
        await close.call(tool);
      } catch {
        const ctx = getHookContext();
        try {
          ctx.reasonTrace
            ?.startSpan({
              name: "kortyx.tool.cleanup",
              attributes: { cleanupFailed: true },
            })
            ?.end?.();
        } catch {}
      }
    }),
  );
}

/** Read only diagnostic strings; never serialize an exception, cause, input or stack. */
function captureToolError(
  observation: ToolObservation,
  error: unknown,
  policy: KortyxExecutableTool["telemetry"],
  returned = false,
) {
  try {
    const reported =
      returned &&
      error &&
      typeof error === "object" &&
      "isError" in error &&
      error.isError === true &&
      "content" in error &&
      typeof error.content === "string"
        ? { name: "ToolError", message: error.content }
        : error;
    const details = policy?.error
      ? policy.error(error)
      : typeof reported === "string"
        ? { type: "Error", message: reported }
        : reported && typeof reported === "object"
          ? {
              type:
                "name" in reported && typeof reported.name === "string"
                  ? reported.name
                  : "Error",
              message:
                "message" in reported && typeof reported.message === "string"
                  ? reported.message
                  : "Tool reported a fault.",
            }
          : { type: "Error", message: "Tool threw a non-Error value." };
    if (!details || typeof details.message !== "string") return;
    observation.errorMessage = details.message.slice(0, 8192);
    if (typeof details.type === "string")
      observation.errorType = details.type.slice(0, 256);
  } catch {
    // An application's projection or an exception getter cannot change execution.
  }
}

function ownership() {
  const ctx = getHookContext();
  const correlation = ctx.node.workflowCallTelemetry?.correlation;
  return {
    workflowId: ctx.node.graph.name,
    nodeId: ctx.node.graph.node,
    ...(correlation?.workflowRevisionId
      ? { workflowRevisionId: correlation.workflowRevisionId }
      : {}),
    ...(correlation?.parentInvocationId
      ? { parentInvocationId: correlation.parentInvocationId }
      : {}),
    ...(correlation?.runId ? { runId: correlation.runId } : {}),
    ...(correlation?.invocationId
      ? { invocationId: correlation.invocationId }
      : {}),
    ...(correlation?.branchId ? { branchId: correlation.branchId } : {}),
  };
}

/** Checkpointed safe facts let a whole cached child retain its tool evidence. */
export function rememberToolObservation(observation: ToolObservation): void {
  const ctx = getHookContext();
  const existing = ctx.workflowState.__kortyxToolObservations;
  const observations = Array.isArray(existing) ? existing : [];
  if (!observations.some((item) => item.attemptId === observation.attemptId))
    observations.push({ ...observation });
  ctx.workflowState.__kortyxToolObservations = observations;
  ctx.stateDirty = true;
}

function toolTrace(
  observation: ToolObservation,
): ReasonTraceAdapter | undefined {
  const ctx = getHookContext();
  const adapter = ctx.reasonTrace ?? ctx.node.workflowCallTelemetry?.trace;
  if (adapter) return adapter;
  const telemetry = ctx.node.workflowCallTelemetry;
  if (!telemetry?.reporter) return undefined;
  const correlation = { ...telemetry.correlation, ...observation };
  const spanId = randomUUID();
  const emit = (
    type: import("./tracing").KortyxTelemetryEventType,
    payload: Record<string, unknown>,
  ) =>
    emitWorkflowCall(
      {
        ...telemetry,
        correlation,
        trace: {
          startSpan: () => undefined,
          getActiveContext: () => ({
            traceId: correlation.runId ?? spanId,
            spanId,
          }),
        },
      },
      type,
      payload,
    );
  return {
    startSpan: ({ attributes = {} }) => {
      if (attributes.executed === true) emit("tool.started", attributes);
      let ended = false;
      return {
        end: (args) => {
          if (ended) return;
          ended = true;
          const payload = { ...attributes, ...args?.attributes };
          const type =
            payload.observationKind === "reused"
              ? "tool.reused"
              : payload.observationKind === "waiting"
                ? "tool.waiting"
                : payload.suspended
                  ? "tool.suspended"
                  : payload.outcome === "denied"
                    ? "tool.denied"
                    : payload.outcome === "fault"
                      ? "tool.failed"
                      : payload.outcome === "cancelled"
                        ? "tool.cancelled"
                        : "tool.completed";
          emit(type, payload);
        },
      };
    },
  };
}

export async function executeObservedTool(args: {
  tool: KortyxExecutableTool;
  input: unknown;
  toolCallId: string;
  providerToolCallId?: string | undefined;
  callingMode: "direct" | "model";
  abortSignal?: AbortSignal | undefined;
  onObservation?: (observation: ToolObservation) => void;
}): Promise<unknown> {
  const ctx = getHookContext();
  const observation: ToolObservation = {
    version: 1,
    name: args.tool.name,
    toolCallId: args.toolCallId,
    attemptId: randomUUID(),
    callingMode: args.callingMode,
    executed: false,
    ...ownership(),
  };
  const scope: ToolScope = {
    tool: args.tool,
    input: args.input,
    signal: args.abortSignal,
    mode: args.callingMode,
    providerToolCallId: args.providerToolCallId ?? args.toolCallId,
    adopted: false,
  };
  // Admission happens before an actual-execution start and is not a tool fault.
  try {
    throwIfExecutionAborted(args.abortSignal);
  } catch (error) {
    observation.outcome = "cancelled";
    await observeToolFact(observation);
    args.onObservation?.(observation);
    throw error;
  }
  ctx.node.consumeExecution?.("maxToolCalls");
  observation.executed = true;
  const started = performance.now();
  return withSafeTraceSpan(
    toolTrace(observation),
    {
      name: "kortyx.tool",
      attributes: { ...observation, nodeId: ctx.node.graph.node },
    },
    async (span) =>
      tools.run(scope, async () => {
        try {
          const result = await args.tool.execute(args.input, {
            toolCallId: args.providerToolCallId ?? args.toolCallId,
            ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
          });
          throwIfExecutionAborted(args.abortSignal);
          const outcome = classification(
            args.tool,
            result,
            false,
            scope.classify ?? args.tool.outcomes,
          );
          observation.outcome = outcome.outcome;
          if (outcome.code) observation.denialCode = outcome.code;
          if (observation.outcome === "fault") {
            captureToolError(
              observation,
              result,
              scope.telemetry ?? args.tool.telemetry,
              true,
            );
          }
          return result;
        } catch (error) {
          if (args.abortSignal?.aborted) observation.outcome = "cancelled";
          else if (!isControlFlowError(error)) {
            const outcome = classification(
              args.tool,
              error,
              true,
              scope.classify ?? args.tool.outcomes,
            );
            observation.outcome = outcome.outcome;
            if (outcome.code) observation.denialCode = outcome.code;
            if (observation.outcome === "fault")
              captureToolError(
                observation,
                error,
                scope.telemetry ?? args.tool.telemetry,
              );
          }
          throw error;
        } finally {
          observation.durationMs = Math.max(0, performance.now() - started);
          span.end?.({
            attributes: {
              ...observation,
              ...(observation.outcome ? {} : { suspended: true }),
            },
          });
          rememberToolObservation(observation);
          args.onObservation?.({ ...observation });
        }
      }),
  );
}

/** A selected but unexecuted denial, cancellation, approval wait, or cached reuse. */
export async function observeToolFact(
  observation: ToolObservation,
  kind?: "reused" | "waiting",
  preserveOwner = false,
): Promise<void> {
  const ctx = getHookContext();
  if (!preserveOwner) Object.assign(observation, ownership());
  if (observation.outcome && kind !== "reused")
    rememberToolObservation(observation);
  await withSafeTraceSpan(
    toolTrace(observation),
    {
      name: "kortyx.tool",
      attributes: {
        ...observation,
        executed: false,
        ...(kind ? { observationKind: kind } : {}),
        nodeId: observation.nodeId ?? ctx.node.graph.node,
      },
    },
    async (span) => {
      span.end?.({
        attributes: {
          ...observation,
          executed: false,
          ...(kind ? { observationKind: kind } : {}),
        },
      });
    },
  );
}

export async function useTool<T extends KortyxExecutableTool>(
  args: UseToolArgs<T>,
): Promise<Awaited<ReturnType<T["execute"]>>> {
  const ctx = getHookContext();
  const scope = tools.getStore();
  if (
    scope?.mode === "model" &&
    !scope.adopted &&
    scope.tool.name === args.tool.name &&
    scope.input === args.input
  ) {
    scope.adopted = true;
    scope.classify = args.tool.outcomes ?? scope.classify;
    scope.telemetry = args.tool.telemetry ?? scope.telemetry;
    return tools.run({ ...scope, mode: "direct" }, () =>
      args.tool.execute(args.input, {
        toolCallId: scope.providerToolCallId,
        ...(scope.signal ? { abortSignal: scope.signal } : {}),
      }),
    ) as Promise<Awaited<ReturnType<T["execute"]>>>;
  }
  const index = ctx.toolCallIndex++;
  const key = `__useTool:${args.id ?? `auto:${index}`}`;
  let id = ctx.currentNodeState.byKey[key];
  if (typeof id !== "string") {
    id = randomUUID();
    ctx.currentNodeState.byKey[key] = id;
    ctx.stateDirty = true;
  }
  try {
    return (await executeObservedTool({
      tool: args.tool,
      input: args.input,
      toolCallId: String(id),
      callingMode: "direct",
      abortSignal: combineAbortSignals(ctx.node.abortSignal, args.abortSignal),
    })) as Awaited<ReturnType<T["execute"]>>;
  } finally {
    await closeOwnedTools([args.tool]);
  }
}

export async function replayToolObservations(
  observations: readonly ToolObservation[],
  child = false,
): Promise<void> {
  for (const original of observations) {
    const source = original.source ?? {
      ...ownershipFrom(original),
      toolCallId: original.toolCallId,
      attemptId: original.attemptId,
    };
    await observeToolFact(
      {
        ...original,
        ...ownership(),
        ...(child
          ? {
              workflowId: original.workflowId,
              nodeId: original.nodeId,
              workflowRevisionId: original.workflowRevisionId,
              invocationId: original.invocationId,
              parentInvocationId: original.parentInvocationId,
            }
          : {}),
        attemptId: randomUUID(),
        executed: false,
        source,
        durationMs: undefined,
      },
      "reused",
      child,
    );
  }
}
const ownershipFrom = (observation: ToolObservation) => ({
  runId: observation.runId,
  invocationId: observation.invocationId,
  branchId: observation.branchId,
});
