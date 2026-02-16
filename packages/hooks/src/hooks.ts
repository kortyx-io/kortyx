import type {
  InterruptInput,
  InterruptResult,
  NodeContext,
} from "@kortyx/core";
import type { MemoryAdapter } from "@kortyx/memory";
import type { ProviderModelRef } from "@kortyx/providers";
import { getHookContext } from "./context";
import type { RunReasonEngineResult } from "./reason-engine";
import { runReasonEngine } from "./reason-engine";

type StateSetter<T> = (next: T | ((prev: T) => T)) => void;

export type UseReasonArgs = {
  model: ProviderModelRef;
  input: string;
  system?: string | undefined;
  temperature?: number | undefined;
  emit?: boolean | undefined;
  stream?: boolean | undefined;
};

export type UseReasonResult = {
  text: string;
  raw?: unknown;
};

export function useEmit(): NodeContext["emit"] {
  const ctx = getHookContext();
  return ctx.node.emit;
}

export function useStructuredData(args: {
  data: unknown;
  dataType?: string | undefined;
}): void {
  const ctx = getHookContext();
  ctx.node.emit("structured_data", {
    node: ctx.node.graph.node,
    ...(typeof args.dataType === "string" && args.dataType.length > 0
      ? { dataType: args.dataType }
      : {}),
    data: args.data,
  });
}

async function reasonEngine(
  args: UseReasonArgs,
): Promise<RunReasonEngineResult> {
  const ctx = getHookContext();
  const getProvider = ctx.getProvider;
  if (!getProvider) {
    throw new Error("useReason requires a provider factory in runtime config.");
  }

  return runReasonEngine({
    getProvider,
    model: args.model,
    input: args.input,
    system: args.system,
    temperature: args.temperature,
    defaultTemperature: ctx.node.config?.model?.temperature,
    stream: args.stream,
    emit: args.emit,
    nodeId: ctx.node.graph.node,
    emitEvent: ctx.node.emit,
  });
}

export function useReason(args: UseReasonArgs): Promise<UseReasonResult> {
  return reasonEngine(args);
}

export function useAiMemory(): MemoryAdapter {
  const ctx = getHookContext();
  if (!ctx.memoryAdapter) {
    throw new Error("useAiMemory requires a memory adapter in runtime config.");
  }
  return ctx.memoryAdapter;
}

export function useAiInterrupt(
  input: InterruptInput,
): Promise<InterruptResult> {
  const ctx = getHookContext();
  return Promise.resolve(ctx.node.awaitInterrupt(input));
}

export function useNodeState<T>(initialValue: T): [T, StateSetter<T>];
export function useNodeState<T>(
  key: string,
  initialValue?: T,
): [T, StateSetter<T>];
export function useNodeState<T>(
  keyOrInitial: string | T,
  initialValue?: T,
): [T, StateSetter<T>] {
  const ctx = getHookContext();
  const nodeState = ctx.currentNodeState;

  if (typeof keyOrInitial === "string") {
    const key = keyOrInitial;
    const hasInitial = arguments.length > 1;

    if (!Object.hasOwn(nodeState.byKey, key) && hasInitial) {
      nodeState.byKey[key] = initialValue as T;
      ctx.dirty = true;
    }

    const getValue = () => nodeState.byKey[key] as T;
    const setValue: StateSetter<T> = (next) => {
      const prev = getValue();
      const resolved =
        typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      nodeState.byKey[key] = resolved;
      ctx.dirty = true;
    };

    return [getValue(), setValue];
  }

  const index = ctx.nodeStateIndex++;
  if (index >= nodeState.byIndex.length) {
    nodeState.byIndex[index] = keyOrInitial as T;
    ctx.dirty = true;
  }

  const getValue = () => nodeState.byIndex[index] as T;
  const setValue: StateSetter<T> = (next) => {
    const prev = getValue();
    const resolved =
      typeof next === "function" ? (next as (p: T) => T)(prev) : next;
    nodeState.byIndex[index] = resolved;
    ctx.dirty = true;
  };

  return [getValue(), setValue];
}

export function useWorkflowState<T>(
  key: string,
  initialValue?: T,
): [T, StateSetter<T>] {
  const ctx = getHookContext();
  const workflowState = ctx.workflowState;
  const hasInitial = arguments.length > 1;

  if (!Object.hasOwn(workflowState, key) && hasInitial) {
    workflowState[key] = initialValue as T;
    ctx.dirty = true;
  }

  const getValue = () => workflowState[key] as T;
  const setValue: StateSetter<T> = (next) => {
    const prev = getValue();
    const resolved =
      typeof next === "function" ? (next as (p: T) => T)(prev) : next;
    workflowState[key] = resolved;
    ctx.dirty = true;
  };

  return [getValue(), setValue];
}
