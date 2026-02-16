import type {
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

/**
 * Options for model instantiation
 */
export interface ModelOptions {
  temperature?: number;
  streaming?: boolean;
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
    messages: Array<HumanMessage | SystemMessage>,
  ) => AsyncIterable<AIMessageChunk> | Promise<AsyncIterable<AIMessageChunk>>;

  /**
   * Invoke the model synchronously (non-streaming)
   */
  invoke: (
    messages: Array<HumanMessage | SystemMessage>,
  ) => Promise<BaseMessage>;

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
 * Factory function that creates a model instance
 */
export type ModelFactory = () => KortyxModel;

/**
 * Configuration for a single provider (e.g., Google, OpenAI)
 */
export interface ProviderConfig {
  id: string;
  models: Record<string, ModelFactory>;
}

/**
 * The function signature that runtime uses to get a provider.
 * This matches the interface expected by @kortyx/runtime's GraphRuntimeConfig.
 */
export type GetProviderFn = (
  providerId: string,
  modelId: string,
  options?: ModelOptions,
) => KortyxModel;

/**
 * Mutable registry used to register provider implementations and resolve models.
 */
export interface ProviderRegistry {
  register: (config: ProviderConfig) => void;
  reset: () => void;
  hasProvider: (providerId: string) => boolean;
  getInitializedProviders: () => string[];
  getAvailableModels: (providerId: string) => string[];
  getProvider: GetProviderFn;
}
