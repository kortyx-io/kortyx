import type { InterruptInput, InterruptResult } from "@kortyx/core";
import { getHookContext } from "./context";
import { awaitInterruptInternal } from "./interrupt";
import { defineInterruptContract } from "./interrupt-contract";
import { defineOutputContract } from "./output-contract";
import { useReason as useReasonInternal } from "./reason/use-reason";
import { emitStructuredData } from "./structured";
import type {
  InterruptContractMap,
  OutputContractMap,
  UseContractInterruptArgs,
  UseContractStructuredDataArgs,
  UseInterruptArgs,
  UseReasonArgs,
  UseReasonResult,
  UseStructuredDataArgs,
} from "./types";
import { parseWithSchema } from "./validation";

export { defineInterruptContract, defineOutputContract };

export type {
  InterruptContract,
  InterruptContractMap,
  InterruptHistoryEntry,
  OutputContract,
  OutputContractEntry,
  OutputContractMap,
  SchemaLike,
  StructuredDataKind,
  UseContractInterruptArgs,
  UseContractStructuredDataArgs,
  UseInterruptArgs,
  UseReasonArgs,
  UseReasonInterruptConfig,
  UseReasonInterruptsConfig,
  UseReasonOutputsConfig,
  UseReasonResult,
  UseReasonStep,
  UseReasonStructuredConfig,
  UseReasonToolExecution,
  UseStructuredDataAppendArgs,
  UseStructuredDataArgs,
  UseStructuredDataFinalArgs,
  UseStructuredDataSetArgs,
  UseStructuredDataTextDeltaArgs,
} from "./types";

type StateSetter<T> = (next: T | ((prev: T) => T)) => void;

export function useStructuredData<TData>(
  args: UseContractStructuredDataArgs<TData>,
): void;
export function useStructuredData<TData = unknown>(
  args: UseStructuredDataArgs<TData>,
): void;
export function useStructuredData<TData>(
  args: UseStructuredDataArgs<TData> | UseContractStructuredDataArgs<TData>,
): void {
  if ("contract" in args) {
    const contract = defineOutputContract(args.contract);
    const base = {
      dataType: contract.schemaId,
      schemaId: contract.schemaId,
      schemaVersion: contract.schemaVersion,
      ...(args.id ? { id: args.id } : {}),
      ...(args.streamId ? { streamId: args.streamId } : {}),
    };
    if (
      args.kind === "set" ||
      args.kind === "append" ||
      args.kind === "text-delta"
    ) {
      if (contract.stream?.fields[args.path] !== args.kind)
        throw new Error(
          `Output contract does not allow ${args.kind} at "${args.path}".`,
        );
      if (args.kind === "set")
        emitStructuredData({
          ...base,
          kind: "set",
          path: args.path,
          value: args.value,
          ...(args.valueSchema ? { valueSchema: args.valueSchema } : {}),
        });
      else if (args.kind === "append")
        emitStructuredData({
          ...base,
          kind: "append",
          path: args.path,
          items: args.items,
          ...(args.itemSchema ? { itemSchema: args.itemSchema } : {}),
        });
      else
        emitStructuredData({
          ...base,
          kind: "text-delta",
          path: args.path,
          delta: args.delta,
        });
      return;
    }
    emitStructuredData({
      ...base,
      kind: "final",
      data: args.data,
      dataSchema: contract.schema,
    });
    return;
  }
  emitStructuredData(args);
}

export function useReason<
  TOutput = unknown,
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
  TContracts extends InterruptContractMap = InterruptContractMap,
  TEmit extends OutputContractMap = OutputContractMap,
  TReturn extends OutputContractMap = OutputContractMap,
>(
  args: UseReasonArgs<TOutput, TRequest, TResponse, TContracts, TEmit, TReturn>,
): Promise<UseReasonResult<TOutput, TResponse, TContracts, TEmit, TReturn>> {
  return useReasonInternal(args);
}

export function useInterrupt<TRequest, TResponse>(
  args: UseContractInterruptArgs<TRequest, TResponse>,
): Promise<TResponse>;
export function useInterrupt<
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
>(args: UseInterruptArgs<TRequest, TResponse>): Promise<TResponse>;
export function useInterrupt(
  args:
    | UseContractInterruptArgs<unknown, unknown>
    | UseInterruptArgs<InterruptInput, InterruptResult>,
): Promise<unknown> {
  if ("contract" in args) {
    const contract = defineInterruptContract(args.contract);
    return awaitInterruptInternal({
      request: {
        kind: "custom",
        request: parseWithSchema(
          contract.requestSchema,
          args.request,
          "useInterrupt contract request",
        ),
        schemaId: contract.schemaId,
        schemaVersion: contract.schemaVersion,
        ...(args.id ? { id: args.id } : {}),
        ...(args.meta ? { meta: args.meta } : {}),
      },
      responseSchema: contract.responseSchema,
    });
  }
  return awaitInterruptInternal(args);
}

/** Live execution signal for cooperative I/O. Never store it in workflow state. */
export function useAbortSignal(): AbortSignal | undefined {
  return getHookContext().node.abortSignal;
}

export function useRuntimeContext<
  TContext extends Record<string, unknown> = Record<string, unknown>,
>(): TContext {
  const ctx = getHookContext();
  const config = ctx.state.config;
  const context =
    config && typeof config === "object" && "context" in config
      ? (config as { context?: unknown }).context
      : undefined;

  return context && typeof context === "object" && !Array.isArray(context)
    ? (context as TContext)
    : ({} as TContext);
}

export function useNodeState<T>(initialValue: T): [T, StateSetter<T>] {
  const ctx = getHookContext();
  const nodeState = ctx.currentNodeState;

  const index = ctx.nodeStateIndex++;
  if (index >= nodeState.byIndex.length) {
    nodeState.byIndex[index] = initialValue as T;
    ctx.stateDirty = true;
  }

  const getValue = () => nodeState.byIndex[index] as T;
  const setValue: StateSetter<T> = (next) => {
    const prev = getValue();
    const resolved =
      typeof next === "function" ? (next as (p: T) => T)(prev) : next;
    nodeState.byIndex[index] = resolved;
    ctx.stateDirty = true;
  };

  return [getValue(), setValue];
}

export function useWorkflowState<T>(
  key: string,
  ...rest: [] | [T]
): [T, StateSetter<T>] {
  const ctx = getHookContext();
  const workflowState = ctx.workflowState;
  const hasInitial = rest.length > 0;
  const initialValue = rest[0];

  if (!Object.hasOwn(workflowState, key) && hasInitial) {
    workflowState[key] = initialValue as T;
    ctx.stateDirty = true;
  }

  const getValue = () => workflowState[key] as T;
  const setValue: StateSetter<T> = (next) => {
    const prev = getValue();
    const resolved =
      typeof next === "function" ? (next as (p: T) => T)(prev) : next;
    workflowState[key] = resolved;
    ctx.stateDirty = true;
  };

  return [getValue(), setValue];
}
