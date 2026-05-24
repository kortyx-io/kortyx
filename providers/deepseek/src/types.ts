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

export type DeepSeekChatRole = "system" | "user" | "assistant" | "tool";

export interface DeepSeekToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface DeepSeekChatMessage {
  role: DeepSeekChatRole;
  content: string | null;
  reasoning_content?: string | undefined;
  tool_calls?: DeepSeekToolCall[] | undefined;
  tool_call_id?: string | undefined;
  name?: string | undefined;
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
  tools?:
    | Array<{
        type: "function";
        function: {
          name: string;
          description?: string | undefined;
          parameters: unknown;
        };
      }>
    | undefined;
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
              tool_calls?: DeepSeekToolCall[] | undefined;
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
              tool_calls?: DeepSeekToolCall[] | undefined;
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
