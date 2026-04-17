import type { InterruptInput, InterruptResult } from "@kortyx/core";
import { getHookContext } from "./context";
import { awaitInterruptInternal } from "./interrupt";
import { useReason as useReasonInternal } from "./reason/use-reason";
import { emitStructuredData } from "./structured";
import type {
  UseInterruptArgs,
  UseReasonArgs,
  UseReasonResult,
  UseStructuredDataArgs,
} from "./types";

export type {
  SchemaLike,
  StructuredDataKind,
  UseInterruptArgs,
  UseReasonArgs,
  UseReasonInterruptConfig,
  UseReasonResult,
  UseReasonStructuredConfig,
  UseStructuredDataAppendArgs,
  UseStructuredDataArgs,
  UseStructuredDataFinalArgs,
  UseStructuredDataSetArgs,
  UseStructuredDataTextDeltaArgs,
} from "./types";

type StateSetter<T> = (next: T | ((prev: T) => T)) => void;

export function useStructuredData<TData = unknown>(
  args: UseStructuredDataArgs<TData>,
): void {
  emitStructuredData(args);
}

export function useReason<
  TOutput = unknown,
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
>(
  args: UseReasonArgs<TOutput, TRequest, TResponse>,
): Promise<UseReasonResult<TOutput, TResponse>> {
  return useReasonInternal(args);
}

export function useInterrupt<
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
>(args: UseInterruptArgs<TRequest, TResponse>): Promise<TResponse> {
  return awaitInterruptInternal(args);
}

export function useNodeState<T>(initialValue: T): [T, StateSetter<T>] {
  const ctx = getHookContext();
  const nodeState = ctx.currentNodeState;

  const index = ctx.nodeStateIndex++;
  if (index >= nodeState.byIndex.length) {
    nodeState.byIndex[index] = initialValue as T;
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
  ...rest: [] | [T]
): [T, StateSetter<T>] {
  const ctx = getHookContext();
  const workflowState = ctx.workflowState;
  const hasInitial = rest.length > 0;
  const initialValue = rest[0];

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
