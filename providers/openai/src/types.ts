export type FetchLike = typeof fetch;

export interface ProviderSettings {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export interface OpenAIClientConfig {
  apiKey: string;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export type OpenAIChatRole = "system" | "developer" | "user" | "assistant";

export interface OpenAIChatMessage {
  role: OpenAIChatRole;
  content: string;
  reasoning?: string | undefined;
}

export interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number | undefined;
  max_tokens?: number | undefined;
  max_completion_tokens?: number | undefined;
  stop?: string[] | undefined;
  response_format?:
    | { type: "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          schema: unknown;
          strict?: boolean | undefined;
        };
      }
    | undefined;
  stream?: boolean | undefined;
  stream_options?: { include_usage: true } | undefined;
  reasoning_effort?:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | undefined;
  service_tier?: "auto" | "flex" | "priority" | "default" | undefined;
  store?: boolean | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface OpenAIUsage {
  prompt_tokens?: number | null | undefined;
  completion_tokens?: number | null | undefined;
  total_tokens?: number | null | undefined;
  prompt_tokens_details?:
    | {
        cached_tokens?: number | null | undefined;
      }
    | null
    | undefined;
  completion_tokens_details?:
    | {
        reasoning_tokens?: number | null | undefined;
        accepted_prediction_tokens?: number | null | undefined;
        rejected_prediction_tokens?: number | null | undefined;
      }
    | null
    | undefined;
}

export interface OpenAIChatCompletionResponse {
  id?: string | undefined;
  model?: string | undefined;
  created?: number | undefined;
  choices?:
    | Array<{
        message?:
          | {
              role?: string | undefined;
              content?: string | null | undefined;
              reasoning?: string | null | undefined;
            }
          | undefined;
        finish_reason?: string | null | undefined;
      }>
    | undefined;
  usage?: OpenAIUsage | null | undefined;
}

export interface OpenAIChatCompletionChunk {
  id?: string | undefined;
  model?: string | undefined;
  created?: number | undefined;
  choices?:
    | Array<{
        delta?:
          | {
              content?: string | null | undefined;
              reasoning?: string | null | undefined;
            }
          | undefined;
        finish_reason?: string | null | undefined;
      }>
    | undefined;
  usage?: OpenAIUsage | null | undefined;
  error?: { message?: string | undefined } | undefined;
}

export interface OpenAIRequestOptions {
  signal?: AbortSignal | undefined;
}

export interface OpenAIClient {
  createChatCompletion: (
    body: OpenAIChatCompletionRequest,
    options?: OpenAIRequestOptions,
  ) => Promise<OpenAIChatCompletionResponse>;
  streamChatCompletion: (
    body: OpenAIChatCompletionRequest,
    options?: OpenAIRequestOptions,
  ) => AsyncIterable<OpenAIChatCompletionChunk>;
}
