import type { ModelOptions } from "@kortyx/providers";
import type { Fetcher } from "@openrouter/sdk";
import type { ChatRequest } from "@openrouter/sdk/models";

export interface ProviderSettings {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  httpReferer?: string | undefined;
  appTitle?: string | undefined;
  appCategories?: string | undefined;
  fetch?: Fetcher | undefined;
}

export type OpenRouterCallOptions = Omit<
  ChatRequest,
  | "messages"
  | "model"
  | "stream"
  | "temperature"
  | "maxCompletionTokens"
  | "maxTokens"
  | "stop"
  | "reasoningEffort"
  | "responseFormat"
  | "tools"
>;

export type OpenRouterModelOptions = ModelOptions & {
  providerOptions?:
    | ({ openrouter?: OpenRouterCallOptions } & Record<string, unknown>)
    | undefined;
};
