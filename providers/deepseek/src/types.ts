export type FetchLike = typeof fetch;

export interface ProviderSettings {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export interface DeepSeekClientConfig {
  apiKey: string;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export type DeepSeekChatRole = "system" | "user" | "assistant";

export interface DeepSeekChatMessage {
  role: DeepSeekChatRole;
  content: string;
  reasoning_content?: string | undefined;
}

export interface DeepSeekChatCompletionRequest {
  model: string;
  messages: DeepSeekChatMessage[];
  temperature?: number | undefined;
  max_tokens?: number | undefined;
  stop?: string[] | undefined;
  response_format?: { type: "json_object" } | undefined;
  stream?: boolean | undefined;
  stream_options?: { include_usage: true } | undefined;
  thinking?: { type: "enabled" | "disabled" } | undefined;
}

export interface DeepSeekUsage {
  prompt_tokens?: number | null | undefined;
  completion_tokens?: number | null | undefined;
  total_tokens?: number | null | undefined;
  prompt_cache_hit_tokens?: number | null | undefined;
  prompt_cache_miss_tokens?: number | null | undefined;
  completion_tokens_details?:
    | {
        reasoning_tokens?: number | null | undefined;
      }
    | null
    | undefined;
}

export interface DeepSeekChatCompletionResponse {
  id?: string | undefined;
  model?: string | undefined;
  created?: number | undefined;
  choices?:
    | Array<{
        message?:
          | {
              role?: string | undefined;
              content?: string | null | undefined;
              reasoning_content?: string | null | undefined;
            }
          | undefined;
        finish_reason?: string | null | undefined;
      }>
    | undefined;
  usage?: DeepSeekUsage | null | undefined;
}

export interface DeepSeekChatCompletionChunk {
  id?: string | undefined;
  model?: string | undefined;
  created?: number | undefined;
  choices?:
    | Array<{
        delta?:
          | {
              content?: string | null | undefined;
              reasoning_content?: string | null | undefined;
            }
          | undefined;
        finish_reason?: string | null | undefined;
      }>
    | undefined;
  usage?: DeepSeekUsage | null | undefined;
  error?: { message?: string | undefined } | undefined;
}

export interface DeepSeekRequestOptions {
  signal?: AbortSignal | undefined;
}

export interface DeepSeekClient {
  createChatCompletion: (
    body: DeepSeekChatCompletionRequest,
    options?: DeepSeekRequestOptions,
  ) => Promise<DeepSeekChatCompletionResponse>;
  streamChatCompletion: (
    body: DeepSeekChatCompletionRequest,
    options?: DeepSeekRequestOptions,
  ) => AsyncIterable<DeepSeekChatCompletionChunk>;
}
