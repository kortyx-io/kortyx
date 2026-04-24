export type KortyxReasoningEffort =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | (string & {});

export interface KortyxReasoningOptions {
  effort?: KortyxReasoningEffort;
  maxTokens?: number;
  includeThoughts?: boolean;
}

export type KortyxResponseFormat =
  | {
      type: "text";
    }
  | {
      type: "json";
      schema?: unknown;
      name?: string;
    };

export interface KortyxUsage {
  input?: number;
  output?: number;
  total?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
  raw?: Record<string, unknown>;
}

export type KortyxFinishReason = {
  unified:
    | "stop"
    | "length"
    | "content-filter"
    | "tool-calls"
    | "error"
    | "other";
  raw?: string;
};

export type KortyxWarning =
  | {
      type: "unsupported";
      feature: string;
      details?: string;
    }
  | {
      type: "compatibility";
      feature: string;
      details?: string;
    }
  | {
      type: "deprecated";
      setting: string;
      message: string;
    }
  | {
      type: "other";
      message: string;
    };

export type KortyxProviderMetadata = Record<string, unknown>;

/**
 * Options for model instantiation.
 * These are provider-normalized call options applied when a concrete model
 * instance is resolved from a provider selector.
 */
export interface ModelOptions {
  temperature?: number;
  streaming?: boolean;
  maxOutputTokens?: number;
  stopSequences?: string[];
  abortSignal?: AbortSignal;
  reasoning?: KortyxReasoningOptions;
  responseFormat?: KortyxResponseFormat;
  providerOptions?: Record<string, unknown>;
}

export interface ProviderInstance<
  ProviderId extends string = string,
  ModelId extends string = string,
> {
  id: ProviderId;
  models: readonly ModelId[];
  getModel: (modelId: string, options?: ModelOptions) => KortyxModel;
}

export interface ProviderModelRef<
  ProviderId extends string = string,
  ModelId extends string = string,
> {
  provider: ProviderInstance<ProviderId, ModelId>;
  modelId: ModelId;
  options?: ModelOptions | undefined;
}

export interface ProviderSelector<
  ProviderId extends string = string,
  ModelId extends string = string,
> extends ProviderInstance<ProviderId, ModelId> {
  (
    modelId: ModelId,
    options?: ModelOptions,
  ): ProviderModelRef<ProviderId, ModelId>;
}

export type KortyxPromptRole = "system" | "user" | "assistant";

export interface KortyxPromptMessage {
  role: KortyxPromptRole;
  content: string;
}

export type KortyxStreamPart =
  | {
      type: "text-delta";
      delta: string;
      raw?: unknown;
      providerMetadata?: KortyxProviderMetadata;
    }
  | {
      type: "finish";
      finishReason?: KortyxFinishReason;
      usage?: KortyxUsage;
      warnings?: KortyxWarning[];
      providerMetadata?: KortyxProviderMetadata;
      raw?: unknown;
    }
  | {
      type: "error";
      error: unknown;
      warnings?: KortyxWarning[];
      providerMetadata?: KortyxProviderMetadata;
      raw?: unknown;
    }
  | {
      type: "raw";
      raw: unknown;
      providerMetadata?: KortyxProviderMetadata;
    };

export type KortyxStreamChunk = KortyxStreamPart;

export interface KortyxInvokeResult {
  role?: "assistant" | undefined;
  content: string;
  raw?: unknown;
  usage?: KortyxUsage;
  finishReason?: KortyxFinishReason;
  warnings?: KortyxWarning[];
  providerMetadata?: KortyxProviderMetadata;
}

/**
 * Normalized model interface that all providers must implement.
 * This abstracts away the underlying LLM provider (Google, OpenAI, etc.)
 */
export interface KortyxModel {
  /**
   * Stream responses from the model
   */
  stream: (
    messages: KortyxPromptMessage[],
  ) =>
    | AsyncIterable<KortyxStreamPart>
    | Promise<AsyncIterable<KortyxStreamPart>>;

  /**
   * Invoke the model synchronously (non-streaming)
   */
  invoke: (messages: KortyxPromptMessage[]) => Promise<KortyxInvokeResult>;
}

/**
 * The function signature that runtime uses to get a provider.
 */
export type GetProviderFn = (providerId: string) => ProviderInstance;

/**
 * Mutable registry used to register provider implementations and resolve models.
 */
export interface ProviderRegistry {
  register: (provider: ProviderInstance) => void;
  reset: () => void;
  hasProvider: (providerId: string) => boolean;
  getInitializedProviders: () => string[];
  getAvailableModels: (providerId: string) => string[];
  getProvider: GetProviderFn;
}
