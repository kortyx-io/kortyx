import { randomUUID } from "node:crypto";
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

type SchemaLike<T> = {
  safeParse: (value: unknown) =>
    | {
        success: true;
        data: T;
      }
    | {
        success: false;
        error: {
          message?: string;
        };
      };
};

export type StructuredDataMode = "final" | "patch" | "snapshot";

export type UseStructuredDataArgs<TData = unknown> = {
  data: TData;
  dataType?: string | undefined;
  dataSchema?: SchemaLike<TData> | undefined;
  mode?: StructuredDataMode | undefined;
  schemaId?: string | undefined;
  schemaVersion?: string | undefined;
  id?: string | undefined;
  opId?: string | undefined;
};

export type UseReasonStructuredStreamMode = "off" | "patch" | "snapshot";

export type UseReasonStructuredConfig = {
  stream?: UseReasonStructuredStreamMode | undefined;
  optimistic?: boolean | undefined;
  dataType?: string | undefined;
  schemaId?: string | undefined;
  schemaVersion?: string | undefined;
};

export type UseReasonInterruptConfig<
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
> = {
  request:
    | TRequest
    | ((draft: {
        text: string;
        raw?: unknown;
        output?: unknown;
      }) => TRequest | null | undefined);
  requestSchema?: SchemaLike<TRequest> | undefined;
  responseSchema?: SchemaLike<TResponse> | undefined;
  continueInput?:
    | string
    | ((args: {
        input: string;
        draftText: string;
        draftOutput?: unknown;
        response: TResponse;
      }) => string)
    | undefined;
  schemaId?: string | undefined;
  schemaVersion?: string | undefined;
};

export type UseReasonArgs<
  TOutput = unknown,
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
> = {
  model: ProviderModelRef;
  input: string;
  system?: string | undefined;
  temperature?: number | undefined;
  emit?: boolean | undefined;
  stream?: boolean | undefined;
  id?: string | undefined;
  outputSchema?: SchemaLike<TOutput> | undefined;
  structured?: UseReasonStructuredConfig | undefined;
  interrupt?: UseReasonInterruptConfig<TRequest, TResponse> | undefined;
};

export type UseReasonResult<TOutput = unknown, TResponse = InterruptResult> = {
  id?: string;
  opId: string;
  text: string;
  raw?: unknown;
  output?: TOutput;
  interruptResponse?: TResponse;
};

export type UseInterruptArgs<
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
> = {
  request: TRequest;
  requestSchema?: SchemaLike<TRequest> | undefined;
  responseSchema?: SchemaLike<TResponse> | undefined;
  schemaId?: string | undefined;
  schemaVersion?: string | undefined;
  id?: string | undefined;
};

const createRuntimeId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

const tryJsonParse = (
  value: string,
): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
};

const extractJsonCodeBlock = (value: string): string | null => {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!match || typeof match[1] !== "string") return null;
  const inner = match[1].trim();
  return inner.length > 0 ? inner : null;
};

const resolveOutputCandidate = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const direct = tryJsonParse(trimmed);
  if (direct.ok) return direct.value;

  const block = extractJsonCodeBlock(trimmed);
  if (block) {
    const parsedBlock = tryJsonParse(block);
    if (parsedBlock.ok) return parsedBlock.value;
  }

  return text;
};

const parseWithSchema = <T>(
  schema: SchemaLike<T> | undefined,
  value: unknown,
  label: string,
): T => {
  if (!schema) return value as T;

  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  const parsedError =
    "error" in parsed && parsed.error ? parsed.error : undefined;
  const reason =
    typeof parsedError?.message === "string" && parsedError.message.length > 0
      ? parsedError.message
      : "invalid payload";
  throw new Error(`${label} validation failed: ${reason}`);
};

export function useEmit(): NodeContext["emit"] {
  const ctx = getHookContext();
  return ctx.node.emit;
}

const emitStructuredData = <TData = unknown>(
  args: UseStructuredDataArgs<TData>,
): void => {
  const ctx = getHookContext();
  const validated = parseWithSchema(
    args.dataSchema,
    args.data,
    "useStructuredData data",
  );

  ctx.node.emit("structured_data", {
    node: ctx.node.graph.node,
    ...(typeof args.dataType === "string" && args.dataType.length > 0
      ? { dataType: args.dataType }
      : {}),
    ...(typeof args.mode === "string" ? { mode: args.mode } : {}),
    ...(typeof args.schemaId === "string" && args.schemaId.length > 0
      ? { schemaId: args.schemaId }
      : {}),
    ...(typeof args.schemaVersion === "string" && args.schemaVersion.length > 0
      ? { schemaVersion: args.schemaVersion }
      : {}),
    ...(typeof args.id === "string" && args.id.length > 0
      ? { id: args.id }
      : {}),
    ...(typeof args.opId === "string" && args.opId.length > 0
      ? { opId: args.opId }
      : {}),
    data: validated,
  });
};

export function useStructuredData<TData = unknown>(
  args: UseStructuredDataArgs<TData>,
): void {
  emitStructuredData(args);
}

type ReasonEngineInput = {
  model: ProviderModelRef;
  input: string;
  system?: string | undefined;
  temperature?: number | undefined;
  emit?: boolean | undefined;
  stream?: boolean | undefined;
};

async function reasonEngine(
  args: ReasonEngineInput,
  meta: { id?: string; opId: string },
  inputOverride?: string,
): Promise<RunReasonEngineResult> {
  const ctx = getHookContext();
  const getProvider = ctx.getProvider;
  if (!getProvider) {
    throw new Error("useReason requires a provider factory in runtime config.");
  }

  return runReasonEngine({
    getProvider,
    model: args.model,
    input: inputOverride ?? args.input,
    system: args.system,
    temperature: args.temperature,
    defaultTemperature: ctx.node.config?.model?.temperature,
    stream: args.stream,
    emit: args.emit,
    nodeId: ctx.node.graph.node,
    emitEvent: ctx.node.emit,
    id: meta.id,
    opId: meta.opId,
  });
}

const defaultContinuationInput = (args: {
  input: string;
  draftText: string;
  response: unknown;
}): string => {
  const responseText =
    typeof args.response === "string"
      ? args.response
      : JSON.stringify(args.response, null, 2);

  return [
    `Original request:\n${args.input}`,
    `Current draft:\n${args.draftText}`,
    `User decision:\n${responseText}`,
    "Update and return the final answer only.",
  ].join("\n\n");
};

const shouldEmitStructured = (
  cfg: UseReasonStructuredConfig | undefined,
): boolean => (cfg?.stream ?? "patch") !== "off";

const resolveStructuredMode = (
  cfg: UseReasonStructuredConfig | undefined,
): StructuredDataMode => {
  const mode = cfg?.stream ?? "patch";
  if (mode === "snapshot") return "snapshot";
  if (mode === "patch") return "patch";
  return "final";
};

export async function useReason<
  TOutput = unknown,
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
>(
  args: UseReasonArgs<TOutput, TRequest, TResponse>,
): Promise<UseReasonResult<TOutput, TResponse>> {
  const id =
    typeof args.id === "string" && args.id.length > 0 ? args.id : undefined;
  const opId = createRuntimeId();

  const reasonMeta =
    typeof id === "string" ? ({ id, opId } as const) : ({ opId } as const);

  const first = await reasonEngine(args, reasonMeta);

  let finalText = first.text;
  let finalRaw = first.raw;
  let finalOutput: TOutput | undefined;

  if (args.outputSchema) {
    finalOutput = parseWithSchema(
      args.outputSchema,
      resolveOutputCandidate(finalText),
      "useReason output",
    );

    if (shouldEmitStructured(args.structured)) {
      emitStructuredData<TOutput>({
        dataType: args.structured?.dataType ?? "reason-output",
        data: finalOutput,
        mode: resolveStructuredMode(args.structured),
        ...(args.structured?.schemaId
          ? { schemaId: args.structured.schemaId }
          : {}),
        ...(args.structured?.schemaVersion
          ? { schemaVersion: args.structured.schemaVersion }
          : {}),
        ...(id ? { id } : {}),
        opId,
      });
    }
  }

  let interruptResponse: TResponse | undefined;

  if (args.interrupt) {
    const draft = {
      text: first.text,
      ...(first.raw !== undefined ? { raw: first.raw } : {}),
      ...(finalOutput !== undefined ? { output: finalOutput } : {}),
    };

    const request =
      typeof args.interrupt.request === "function"
        ? args.interrupt.request(draft)
        : args.interrupt.request;

    if (request) {
      interruptResponse = await awaitInterrupt<TRequest, TResponse>({
        request,
        requestSchema: args.interrupt.requestSchema,
        responseSchema: args.interrupt.responseSchema,
        ...(args.interrupt.schemaId
          ? { schemaId: args.interrupt.schemaId }
          : {}),
        ...(args.interrupt.schemaVersion
          ? { schemaVersion: args.interrupt.schemaVersion }
          : {}),
        ...(id ? { id } : {}),
      });

      const continuationInput =
        typeof args.interrupt.continueInput === "function"
          ? args.interrupt.continueInput({
              input: args.input,
              draftText: first.text,
              ...(finalOutput !== undefined
                ? { draftOutput: finalOutput }
                : {}),
              response: interruptResponse,
            })
          : typeof args.interrupt.continueInput === "string"
            ? args.interrupt.continueInput
            : defaultContinuationInput({
                input: args.input,
                draftText: first.text,
                response: interruptResponse,
              });

      const second = await reasonEngine(args, reasonMeta, continuationInput);
      finalText = second.text;
      finalRaw = second.raw;

      if (args.outputSchema) {
        finalOutput = parseWithSchema(
          args.outputSchema,
          resolveOutputCandidate(finalText),
          "useReason output",
        );

        if (shouldEmitStructured(args.structured)) {
          emitStructuredData<TOutput>({
            dataType: args.structured?.dataType ?? "reason-output",
            data: finalOutput,
            mode: resolveStructuredMode(args.structured),
            ...(args.structured?.schemaId
              ? { schemaId: args.structured.schemaId }
              : {}),
            ...(args.structured?.schemaVersion
              ? { schemaVersion: args.structured.schemaVersion }
              : {}),
            ...(id ? { id } : {}),
            opId,
          });
        }
      }
    }
  }

  return {
    ...(id ? { id } : {}),
    opId,
    text: finalText,
    ...(finalRaw !== undefined ? { raw: finalRaw } : {}),
    ...(finalOutput !== undefined ? { output: finalOutput } : {}),
    ...(interruptResponse !== undefined ? { interruptResponse } : {}),
  };
}

export function useAiMemory(): MemoryAdapter {
  const ctx = getHookContext();
  if (!ctx.memoryAdapter) {
    throw new Error("useAiMemory requires a memory adapter in runtime config.");
  }
  return ctx.memoryAdapter;
}

const awaitInterrupt = <
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
>(
  args: UseInterruptArgs<TRequest, TResponse>,
): Promise<TResponse> => {
  const ctx = getHookContext();

  const request = parseWithSchema(
    args.requestSchema,
    args.request,
    "useInterrupt request",
  );

  const enrichedRequest = {
    ...request,
    ...(typeof args.schemaId === "string" && args.schemaId.length > 0
      ? { schemaId: args.schemaId }
      : {}),
    ...(typeof args.schemaVersion === "string" && args.schemaVersion.length > 0
      ? { schemaVersion: args.schemaVersion }
      : {}),
    ...(typeof args.id === "string" && args.id.length > 0
      ? { id: args.id }
      : {}),
  } as InterruptInput;

  const raw = ctx.node.awaitInterrupt(enrichedRequest);
  const response = parseWithSchema(
    args.responseSchema,
    raw,
    "useInterrupt response",
  );

  return Promise.resolve(response);
};

export function useInterrupt<
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
>(args: UseInterruptArgs<TRequest, TResponse>): Promise<TResponse> {
  return awaitInterrupt(args);
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
