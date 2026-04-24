/**
 * Options for model instantiation
 */
export interface ModelOptions {
  temperature?: number;
  streaming?: boolean;
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

export interface KortyxStreamChunk {
  text?: string | undefined;
  content?: unknown;
  raw?: unknown;
}

export interface KortyxInvokeResult {
  role?: "assistant" | undefined;
  content: string;
  raw?: unknown;
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
    | AsyncIterable<KortyxStreamChunk | string>
    | Promise<AsyncIterable<KortyxStreamChunk | string>>;

  /**
   * Invoke the model synchronously (non-streaming)
   */
  invoke: (messages: KortyxPromptMessage[]) => Promise<KortyxInvokeResult>;

  /**
   * Model temperature (can be modified at runtime)
   */
  temperature: number;

  /**
   * Whether streaming is enabled
   */
  streaming: boolean;
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
