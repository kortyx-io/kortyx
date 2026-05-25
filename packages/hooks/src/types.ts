import type { InterruptInput, InterruptResult } from "@kortyx/core";
import type {
  KortyxExecutableTool,
  KortyxFinishReason,
  KortyxProviderMetadata,
  KortyxReasoningOptions,
  KortyxResponseFormat,
  KortyxToolCall,
  KortyxToolResult,
  KortyxUsage,
  KortyxWarning,
  ProviderModelRef,
} from "@kortyx/providers";
import type { KortyxTraceMetadata } from "./tracing";

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
export type StructuredPath = string;
export type UseReasonStructuredFieldMode = "append" | "text-delta" | "set";
export type UseReasonStructuredFieldKey = string;
export type UseReasonStructuredFields = Record<
  UseReasonStructuredFieldKey,
  UseReasonStructuredFieldMode
>;

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
    path: StructuredPath;
    value: TValue;
    valueSchema?: SchemaLike<TValue> | undefined;
  };

export type UseStructuredDataAppendArgs<TItem = unknown> =
  UseStructuredDataBaseArgs & {
    kind: "append";
    path: StructuredPath;
    items: TItem[];
    itemSchema?: SchemaLike<TItem> | undefined;
  };

export type UseStructuredDataTextDeltaArgs = UseStructuredDataBaseArgs & {
  kind: "text-delta";
  path: StructuredPath;
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
  /**
   * Controls incremental field streaming. Set to false to emit only the final
   * structured output chunk after output validation.
   */
  stream?: boolean | undefined;
  optimistic?: boolean | undefined;
  dataType?: string | undefined;
  schemaId?: string | undefined;
  schemaVersion?: string | undefined;
  /**
   * Incremental extraction paths for useReason. Dotted paths target nested
   * object fields, numeric segments target array indexes, and `*` matches one
   * object key or array index segment.
   */
  fields?: UseReasonStructuredFields | undefined;
};

export type UseReasonInterruptConfig<
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
> = {
  mode?: "required" | "optional" | undefined;
  requestSchema: SchemaLike<TRequest>;
  responseSchema?: SchemaLike<TResponse> | undefined;
  schemaId?: string | undefined;
  schemaVersion?: string | undefined;
};

export type UseReasonToolExecution = {
  maxSteps?: number | undefined;
  approval?: boolean | Record<string, boolean> | undefined;
  emit?: boolean | Record<string, boolean> | undefined;
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
  maxOutputTokens?: number | undefined;
  stopSequences?: string[] | undefined;
  abortSignal?: AbortSignal | undefined;
  reasoning?: KortyxReasoningOptions | undefined;
  responseFormat?: KortyxResponseFormat | undefined;
  providerOptions?: Record<string, unknown> | undefined;
  emit?: boolean | undefined;
  stream?: boolean | undefined;
  id?: string | undefined;
  telemetry?: KortyxTraceMetadata | undefined;
  outputSchema?: SchemaLike<TOutput> | undefined;
  structured?: UseReasonStructuredConfig | undefined;
  interrupt?: UseReasonInterruptConfig<TRequest, TResponse> | undefined;
  tools?: KortyxExecutableTool[] | undefined;
  toolExecution?: UseReasonToolExecution | undefined;
};

export type UseReasonStep = {
  stepIndex: number;
  text: string;
  toolCalls: KortyxToolCall[];
  toolResults: KortyxToolResult[];
  usage?: KortyxUsage | undefined;
  finishReason?: KortyxFinishReason | undefined;
  providerMetadata?: KortyxProviderMetadata | undefined;
  warnings?: KortyxWarning[] | undefined;
};

export type UseReasonResult<TOutput = unknown, TResponse = InterruptResult> = {
  id?: string;
  opId: string;
  text: string;
  raw?: unknown;
  usage?: KortyxUsage;
  finishReason?: KortyxFinishReason;
  providerMetadata?: KortyxProviderMetadata;
  warnings?: KortyxWarning[];
  output?: TOutput;
  interruptResponse?: TResponse;
  toolCalls?: KortyxToolCall[];
  toolResults?: KortyxToolResult[];
  steps?: UseReasonStep[];
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
