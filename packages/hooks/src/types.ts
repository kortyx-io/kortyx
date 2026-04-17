import type { InterruptInput, InterruptResult } from "@kortyx/core";
import type { ProviderModelRef } from "@kortyx/providers";

export type SchemaLike<T> = {
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

export type StructuredDataKind = "set" | "append" | "text-delta" | "final";

type UseStructuredDataBaseArgs = {
  dataType?: string | undefined;
  schemaId?: string | undefined;
  schemaVersion?: string | undefined;
  id?: string | undefined;
  streamId?: string | undefined;
};

export type UseStructuredDataFinalArgs<TData = unknown> =
  UseStructuredDataBaseArgs & {
    kind?: "final" | undefined;
    data: TData;
    dataSchema?: SchemaLike<TData> | undefined;
  };

export type UseStructuredDataSetArgs<TValue = unknown> =
  UseStructuredDataBaseArgs & {
    kind: "set";
    path: string;
    value: TValue;
    valueSchema?: SchemaLike<TValue> | undefined;
  };

export type UseStructuredDataAppendArgs<TItem = unknown> =
  UseStructuredDataBaseArgs & {
    kind: "append";
    path: string;
    items: TItem[];
    itemSchema?: SchemaLike<TItem> | undefined;
  };

export type UseStructuredDataTextDeltaArgs = UseStructuredDataBaseArgs & {
  kind: "text-delta";
  path: string;
  delta: string;
};

export type UseStructuredDataArgs<
  TData = unknown,
  TValue = unknown,
  TItem = unknown,
> =
  | UseStructuredDataFinalArgs<TData>
  | UseStructuredDataSetArgs<TValue>
  | UseStructuredDataAppendArgs<TItem>
  | UseStructuredDataTextDeltaArgs;

export type UseReasonStructuredConfig = {
  stream?: boolean | undefined;
  optimistic?: boolean | undefined;
  dataType?: string | undefined;
  schemaId?: string | undefined;
  schemaVersion?: string | undefined;
  fields?: Record<string, "append" | "text-delta" | "set"> | undefined;
};

export type UseReasonInterruptConfig<
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
> = {
  requestSchema: SchemaLike<TRequest>;
  responseSchema?: SchemaLike<TResponse> | undefined;
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
  meta?: Record<string, unknown> | undefined;
};
