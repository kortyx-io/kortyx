import { AsyncLocalStorage } from "node:async_hooks";
import type { GraphState, NodeContext } from "@kortyx/core";

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
};

type HookInternalContext = HookRuntimeContext & {
  nodeStateIndex: number;
  reasonCallIndex: number;
  currentNodeState: NodeStateStore;
  workflowState: Record<string, unknown>;
  dirty: boolean;
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
    dirty: false,
  };
};

const buildRuntimeStateUpdates = (ctx: HookInternalContext) => {
  if (!ctx.dirty) return null;
  return {
    __kortyx: {
      nodeState: {
        nodeId: ctx.node.graph.node,
        state: ctx.currentNodeState,
      },
      workflowState: ctx.workflowState,
    },
  } as Record<string, unknown>;
};

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
