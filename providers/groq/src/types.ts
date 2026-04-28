export type FetchLike = typeof fetch;

export interface ProviderSettings {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export interface GroqClientConfig {
  apiKey: string;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export type GroqChatRole = "system" | "user" | "assistant";

export interface GroqChatMessage {
  role: GroqChatRole;
  content: string;
  reasoning?: string | undefined;
}

export interface GroqChatCompletionRequest {
  model: string;
  messages: GroqChatMessage[];
  temperature?: number | undefined;
  max_tokens?: number | undefined;
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
  reasoning_format?: "parsed" | "raw" | "hidden" | undefined;
  reasoning_effort?: "none" | "default" | "low" | "medium" | "high" | undefined;
  service_tier?: "on_demand" | "performance" | "flex" | "auto" | undefined;
}

export interface GroqUsage {
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
      }
    | null
    | undefined;
}

export interface GroqChatCompletionResponse {
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
  usage?: GroqUsage | null | undefined;
}

export interface GroqChatCompletionChunk {
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
  usage?: GroqUsage | null | undefined;
  x_groq?: { usage?: GroqUsage | null | undefined } | null | undefined;
  error?: { message?: string | undefined } | undefined;
}

export interface GroqRequestOptions {
  signal?: AbortSignal | undefined;
}

export interface GroqClient {
  createChatCompletion: (
    body: GroqChatCompletionRequest,
    options?: GroqRequestOptions,
  ) => Promise<GroqChatCompletionResponse>;
  streamChatCompletion: (
    body: GroqChatCompletionRequest,
    options?: GroqRequestOptions,
  ) => AsyncIterable<GroqChatCompletionChunk>;
}
