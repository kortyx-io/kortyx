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
  /** Provider helpers can opt out of prompt-appended output instructions. */
  readonly "~kortyx"?:
    | {
        readonly nativeOutput?: boolean | undefined;
      }
    | undefined;
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

export type InterruptContract<TRequest = unknown, TResponse = unknown> = {
  /** Human-readable guidance included in the model-visible control tool. */
  description: string;
  requestSchema: SchemaLike<TRequest>;
  responseSchema: SchemaLike<TResponse>;
  /** Stable UI contract identifier. */
  schemaId: string;
  /** Version of the UI contract payload. */
  schemaVersion: string;
};

export type InterruptContractMap = Record<
  string,
  InterruptContract<unknown, unknown>
>;

export type OutputContract<TData = unknown> = {
  description: string;
  schema: SchemaLike<TData>;
  schemaId: string;
  schemaVersion: string;
  /** Paths the model may update before emitting the validated final value. */
  stream?: { fields: UseReasonStructuredFields } | undefined;
};

export type OutputContractMap = Record<string, OutputContract<unknown>>;

export type UseReasonOutputsConfig<
  TEmit extends OutputContractMap = OutputContractMap,
  TReturn extends OutputContractMap = OutputContractMap,
> = {
  emit?: TEmit | undefined;
  return?: TReturn | undefined;
  maxEmissions?: number | undefined;
};

export type OutputContractEntry<TContracts extends OutputContractMap> = {
  [TName in Extract<
    keyof TContracts,
    string
  >]: TContracts[TName] extends OutputContract<infer TData>
    ? { contract: TName; data: TData }
    : never;
}[Extract<keyof TContracts, string>];

export type UseReasonInterruptsConfig<
  TContracts extends InterruptContractMap = InterruptContractMap,
> = {
  mode?: "required" | "optional" | undefined;
  /** Maximum number of model-requested human interactions for this operation. */
  maxRequests?: number | undefined;
  contracts: TContracts;
};

export type InterruptHistoryEntry<
  TContracts extends InterruptContractMap = InterruptContractMap,
> = {
  [TName in Extract<
    keyof TContracts,
    string
  >]: TContracts[TName] extends InterruptContract<
    infer TRequest,
    infer TResponse
  >
    ? {
        contract: TName;
        request: TRequest;
        response: TResponse;
      }
    : never;
}[Extract<keyof TContracts, string>];

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

export type UseContractStructuredDataArgs<TData> = {
  contract: OutputContract<TData>;
  id?: string | undefined;
} & (
  | { kind?: "final" | undefined; data: TData; streamId?: string | undefined }
  | {
      kind: "set";
      path: string;
      value: unknown;
      valueSchema?: SchemaLike<unknown> | undefined;
      streamId: string;
    }
  | {
      kind: "append";
      path: string;
      items: unknown[];
      itemSchema?: SchemaLike<unknown> | undefined;
      streamId: string;
    }
  | { kind: "text-delta"; path: string; delta: string; streamId: string }
);

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

/**
 * @deprecated Use `UseReasonInterruptsConfig` and `defineInterruptContract`.
 * Removed in the next major release.
 */
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
  /** Model-pass budget, including output generation and correction across resume. */
  maxSteps?: number | undefined;
  approval?: boolean | Record<string, boolean> | undefined;
  emit?: boolean | Record<string, boolean> | undefined;
};

export type UseReasonArgs<
  TOutput = unknown,
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
  TContracts extends InterruptContractMap = InterruptContractMap,
  TEmit extends OutputContractMap = OutputContractMap,
  TReturn extends OutputContractMap = OutputContractMap,
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
  /** @deprecated Removed in the next major. Use `outputs.return` with `defineOutputContract`. */
  outputSchema?: SchemaLike<TOutput> | undefined;
  /** @deprecated Removed in the next major. Use output contracts for model-selected structured emissions. */
  structured?: UseReasonStructuredConfig | undefined;
  outputs?: UseReasonOutputsConfig<TEmit, TReturn> | undefined;
  /** @deprecated Use `interrupts`. Removed in the next major release. */
  interrupt?: UseReasonInterruptConfig<TRequest, TResponse> | undefined;
  interrupts?: UseReasonInterruptsConfig<TContracts> | undefined;
  tools?: KortyxExecutableTool[] | undefined;
  toolExecution?: UseReasonToolExecution | undefined;
};

export type UseReasonStep = {
  kind?: "output" | undefined;
  toolObservations?: import("@kortyx/providers").ToolObservation[];
  stepIndex: number;
  text: string;
  toolCalls: KortyxToolCall[];
  toolResults: KortyxToolResult[];
  usage?: KortyxUsage | undefined;
  finishReason?: KortyxFinishReason | undefined;
  providerMetadata?: KortyxProviderMetadata | undefined;
  warnings?: KortyxWarning[] | undefined;
};

export type UseReasonResult<
  TOutput = unknown,
  TResponse = InterruptResult,
  TContracts extends InterruptContractMap = InterruptContractMap,
  TEmit extends OutputContractMap = OutputContractMap,
  TReturn extends OutputContractMap = OutputContractMap,
> = {
  id?: string;
  opId: string;
  text: string;
  raw?: unknown;
  usage?: KortyxUsage;
  finishReason?: KortyxFinishReason;
  providerMetadata?: KortyxProviderMetadata;
  warnings?: KortyxWarning[];
  /** @deprecated Removed in the next major. Use `returned` from an output contract. */
  output?: TOutput;
  emissions?: OutputContractEntry<TEmit>[];
  returned?: OutputContractEntry<TReturn>;
  /** @deprecated Use `interruptHistory`. Removed in the next major release. */
  interruptResponse?: TResponse;
  interruptHistory?: InterruptHistoryEntry<TContracts>[];
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

export type UseContractInterruptArgs<TRequest, TResponse> = {
  contract: InterruptContract<TRequest, TResponse>;
  request: TRequest;
  id?: string | undefined;
  meta?: Record<string, unknown> | undefined;
};
