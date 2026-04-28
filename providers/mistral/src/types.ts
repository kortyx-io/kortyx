export type FetchLike = typeof fetch;

export interface ProviderSettings {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export interface MistralClientConfig {
  apiKey: string;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export type MistralChatRole = "system" | "user" | "assistant";

export interface MistralChatMessage {
  role: MistralChatRole;
  content: string;
}

export type MistralResponseFormat =
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        schema: unknown;
        strict?: boolean | undefined;
      };
    };

export interface MistralChatCompletionRequest {
  model: string;
  messages: MistralChatMessage[];
  temperature?: number | undefined;
  max_tokens?: number | undefined;
  top_p?: number | undefined;
  random_seed?: number | undefined;
  safe_prompt?: boolean | undefined;
  response_format?: MistralResponseFormat | undefined;
  reasoning_effort?: "high" | "none" | undefined;
  stream?: boolean | undefined;
}

export interface MistralUsage {
  prompt_tokens?: number | null | undefined;
  completion_tokens?: number | null | undefined;
  total_tokens?: number | null | undefined;
}

export type MistralContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "thinking";
          thinking: Array<{ type: "text"; text: string }>;
        }
      | Record<string, unknown>
    >
  | null
  | undefined;

export interface MistralChatCompletionResponse {
  id?: string | null | undefined;
  object?: string | undefined;
  created?: number | null | undefined;
  model?: string | null | undefined;
  choices?:
    | Array<{
        index?: number | undefined;
        message?:
          | {
              role?: string | undefined;
              content?: MistralContent;
            }
          | undefined;
        finish_reason?: string | null | undefined;
      }>
    | undefined;
  usage?: MistralUsage | null | undefined;
}

export interface MistralChatCompletionChunk {
  id?: string | null | undefined;
  object?: string | undefined;
  created?: number | null | undefined;
  model?: string | null | undefined;
  choices?:
    | Array<{
        index?: number | undefined;
        delta?:
          | {
              role?: string | undefined;
              content?: MistralContent;
            }
          | undefined;
        finish_reason?: string | null | undefined;
      }>
    | undefined;
  usage?: MistralUsage | null | undefined;
  error?: { message?: string | undefined } | undefined;
}

export interface MistralRequestOptions {
  signal?: AbortSignal | undefined;
}

export interface MistralClient {
  createChatCompletion: (
    body: MistralChatCompletionRequest,
    options?: MistralRequestOptions,
  ) => Promise<MistralChatCompletionResponse>;
  streamChatCompletion: (
    body: MistralChatCompletionRequest,
    options?: MistralRequestOptions,
  ) => AsyncIterable<MistralChatCompletionChunk>;
}
