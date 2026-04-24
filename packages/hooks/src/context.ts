import { AsyncLocalStorage } from "node:async_hooks";
import type { GraphState, NodeContext, TokenUsage } from "@kortyx/core";
import type { KortyxUsage } from "@kortyx/providers";
import type { ReasonTraceAdapter } from "./tracing";

type NodeStateStore = {
  byIndex: unknown[];
  byKey: Record<string, unknown>;
};

type HookRuntimeState = {
  nodeState?: Record<string, unknown>;
  workflowState?: Record<string, unknown>;
};

type StoredNodeStateEnvelope = {
  nodeId?: unknown;
  state?: unknown;
};

type HookStatePatchedError = {
  __kortyxHookStatePatch?: Record<string, unknown>;
};

export type HookRuntimeContext = {
  node: NodeContext;
  state: GraphState;
  reasonTrace?: ReasonTraceAdapter | undefined;
};

type HookInternalContext = HookRuntimeContext & {
  nodeStateIndex: number;
  reasonCallIndex: number;
  currentNodeState: NodeStateStore;
  workflowState: Record<string, unknown>;
  tokenUsage?: TokenUsage | undefined;
  stateDirty: boolean;
  runtimeDirty: boolean;
};

const storage = new AsyncLocalStorage<HookInternalContext>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeNodeState = (value: unknown): NodeStateStore => {
  if (Array.isArray(value)) {
    return { byIndex: [...value], byKey: {} };
  }

  if (isRecord(value)) {
    const byIndex = Array.isArray(value.byIndex) ? [...value.byIndex] : [];
    const byKey = isRecord(value.byKey) ? { ...value.byKey } : {};
    return { byIndex, byKey };
  }

  return { byIndex: [], byKey: {} };
};

const cloneWorkflowState = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? { ...value } : {};

const cloneTokenUsage = (value: unknown): TokenUsage | undefined => {
  if (!isRecord(value)) return undefined;
  const input = typeof value.input === "number" ? value.input : undefined;
  const output = typeof value.output === "number" ? value.output : undefined;
  const total = typeof value.total === "number" ? value.total : undefined;
  if (input === undefined && output === undefined && total === undefined) {
    return undefined;
  }
  return {
    input: input ?? 0,
    output: output ?? 0,
    total: total ?? 0,
  };
};

const getHookRuntimeState = (state: GraphState): HookRuntimeState => {
  const runtime = (state.runtime ?? {}) as Record<string, unknown>;
  const internal = isRecord(runtime.__kortyx) ? runtime.__kortyx : undefined;
  const result: HookRuntimeState = {};
  if (isRecord(internal?.nodeState)) result.nodeState = internal?.nodeState;
  if (isRecord(internal?.workflowState)) {
    result.workflowState = internal?.workflowState;
  }
  return result;
};

const createInternalContext = (
  ctx: HookRuntimeContext,
): HookInternalContext => {
  const hookRuntimeState = getHookRuntimeState(ctx.state);
  const nodeId = ctx.node.graph.node;
  const storedNodeState = isRecord(hookRuntimeState.nodeState)
    ? (hookRuntimeState.nodeState as StoredNodeStateEnvelope)
    : undefined;
  const storedNodeId =
    typeof storedNodeState?.nodeId === "string"
      ? String(storedNodeState.nodeId)
      : "";
  const storedState = storedNodeState?.state;
  const currentNodeState =
    storedNodeId && storedNodeId === nodeId
      ? normalizeNodeState(storedState)
      : { byIndex: [], byKey: {} };

  return {
    ...ctx,
    nodeStateIndex: 0,
    reasonCallIndex: 0,
    currentNodeState,
    workflowState: cloneWorkflowState(hookRuntimeState.workflowState),
    tokenUsage: cloneTokenUsage(ctx.state.runtime?.tokenUsage),
    stateDirty: false,
    runtimeDirty: false,
  };
};

const buildRuntimeStateUpdates = (ctx: HookInternalContext) => {
  const updates: Record<string, unknown> = {};

  if (ctx.stateDirty) {
    updates.__kortyx = {
      nodeState: {
        nodeId: ctx.node.graph.node,
        state: ctx.currentNodeState,
      },
      workflowState: ctx.workflowState,
    };
  }

  if (ctx.runtimeDirty && ctx.tokenUsage) {
    updates.tokenUsage = ctx.tokenUsage;
  }

  return Object.keys(updates).length > 0 ? updates : null;
};

const toTokenUsageDelta = (
  usage: KortyxUsage | undefined,
): TokenUsage | undefined => {
  if (!usage) return undefined;

  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  const total = usage.total ?? input + output + (usage.reasoning ?? 0);

  if (input === 0 && output === 0 && total === 0) {
    return undefined;
  }

  return {
    input,
    output,
    total,
  };
};

export function accumulateTokenUsage(usage: KortyxUsage | undefined): void {
  const delta = toTokenUsageDelta(usage);
  if (!delta) return;

  const ctx = getHookContext();
  const current = ctx.tokenUsage ?? {
    input: 0,
    output: 0,
    total: 0,
  };

  ctx.tokenUsage = {
    input: current.input + delta.input,
    output: current.output + delta.output,
    total: current.total + delta.total,
  };
  ctx.runtimeDirty = true;
}

export function getReasonTraceAdapter(): ReasonTraceAdapter | undefined {
  return getHookContext().reasonTrace;
}

export async function runWithHookContext<T>(
  ctx: HookRuntimeContext,
  fn: () => Promise<T>,
): Promise<{ result: T; runtimeUpdates: Record<string, unknown> | null }> {
  const internal = createInternalContext(ctx);
  try {
    const result = await storage.run(internal, fn);
    return { result, runtimeUpdates: buildRuntimeStateUpdates(internal) };
  } catch (err) {
    const runtimeUpdates = buildRuntimeStateUpdates(internal);
    if (runtimeUpdates) {
      const currentRuntime = isRecord(internal.state.runtime)
        ? (internal.state.runtime as Record<string, unknown>)
        : {};
      internal.state.runtime = {
        ...currentRuntime,
        ...runtimeUpdates,
      } as unknown as GraphState["runtime"];
      if (err && typeof err === "object") {
        (err as HookStatePatchedError).__kortyxHookStatePatch = runtimeUpdates;
      }
    }
    throw err;
  }
}

export function getHookContext(): HookInternalContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("Hooks can only be used while a node is executing.");
  }
  return ctx;
}
