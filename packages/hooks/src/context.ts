import { AsyncLocalStorage } from "node:async_hooks";
import type { GraphState, NodeContext } from "@kortyx/core";
import type { MemoryAdapter } from "@kortyx/memory";
import type { GetProviderFn } from "@kortyx/providers";

type NodeStateStore = {
  byIndex: unknown[];
  byKey: Record<string, unknown>;
};

type HookMemory = {
  nodeState?: Record<string, unknown>;
  workflowState?: Record<string, unknown>;
};

export type HookRuntimeContext = {
  node: NodeContext;
  state: GraphState;
  getProvider?: GetProviderFn;
  memoryAdapter?: MemoryAdapter;
};

type HookInternalContext = HookRuntimeContext & {
  nodeStateIndex: number;
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

const getHookMemory = (state: GraphState): HookMemory => {
  const memory = (state.memory ?? {}) as Record<string, unknown>;
  const internal = isRecord(memory.__kortyx) ? memory.__kortyx : undefined;
  const result: HookMemory = {};
  if (isRecord(internal?.nodeState)) result.nodeState = internal?.nodeState;
  if (isRecord(internal?.workflowState)) {
    result.workflowState = internal?.workflowState;
  }
  return result;
};

const createInternalContext = (
  ctx: HookRuntimeContext,
): HookInternalContext => {
  const hookMemory = getHookMemory(ctx.state);
  const nodeId = ctx.node.graph.node;
  const storedNodeId =
    typeof (hookMemory.nodeState as any)?.nodeId === "string"
      ? String((hookMemory.nodeState as any)?.nodeId)
      : "";
  const storedState = (hookMemory.nodeState as any)?.state;
  const currentNodeState =
    storedNodeId && storedNodeId === nodeId
      ? normalizeNodeState(storedState)
      : { byIndex: [], byKey: {} };

  return {
    ...ctx,
    nodeStateIndex: 0,
    currentNodeState,
    workflowState: cloneWorkflowState(hookMemory.workflowState),
    dirty: false,
  };
};

const buildMemoryUpdates = (ctx: HookInternalContext) => {
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
): Promise<{ result: T; memoryUpdates: Record<string, unknown> | null }> {
  const internal = createInternalContext(ctx);
  try {
    const result = await storage.run(internal, fn);
    return { result, memoryUpdates: buildMemoryUpdates(internal) };
  } catch (err) {
    const memoryUpdates = buildMemoryUpdates(internal);
    if (memoryUpdates && err && typeof err === "object") {
      (err as any).__kortyxMemoryUpdates = memoryUpdates;
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
