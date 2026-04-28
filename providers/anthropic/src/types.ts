export type FetchLike = typeof fetch;

export interface ProviderSettings {
  apiKey?: string | undefined;
  authToken?: string | undefined;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export interface AnthropicClientConfig {
  apiKey?: string | undefined;
  authToken?: string | undefined;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicThinkingBlock {
  type: "thinking";
  thinking?: string | undefined;
  signature?: string | undefined;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id?: string | undefined;
  name?: string | undefined;
  input?: unknown;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicThinkingBlock
  | AnthropicToolUseBlock
  | (Record<string, unknown> & { type: string });

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicTextBlock[];
}

export type AnthropicThinkingRequest =
  | {
      type: "enabled";
      budget_tokens: number;
    }
  | {
      type: "disabled";
    };

export interface AnthropicMessagesRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string | undefined;
  temperature?: number | undefined;
  top_p?: number | undefined;
  top_k?: number | undefined;
  stop_sequences?: string[] | undefined;
  stream?: boolean | undefined;
  thinking?: AnthropicThinkingRequest | undefined;
}

export interface AnthropicUsage {
  input_tokens?: number | null | undefined;
  output_tokens?: number | null | undefined;
  cache_creation_input_tokens?: number | null | undefined;
  cache_read_input_tokens?: number | null | undefined;
  server_tool_use?: Record<string, unknown> | null | undefined;
}

export interface AnthropicMessagesResponse {
  id?: string | undefined;
  type?: "message" | string | undefined;
  role?: "assistant" | string | undefined;
  model?: string | undefined;
  content?: AnthropicContentBlock[] | undefined;
  stop_reason?: string | null | undefined;
  stop_sequence?: string | null | undefined;
  usage?: AnthropicUsage | null | undefined;
}

export type AnthropicStreamEvent =
  | {
      type: "message_start";
      message?: AnthropicMessagesResponse | undefined;
    }
  | {
      type: "content_block_start";
      index?: number | undefined;
      content_block?: AnthropicContentBlock | undefined;
    }
  | {
      type: "content_block_delta";
      index?: number | undefined;
      delta?:
        | { type: "text_delta"; text?: string | undefined }
        | { type: "thinking_delta"; thinking?: string | undefined }
        | Record<string, unknown>
        | undefined;
    }
  | {
      type: "content_block_stop";
      index?: number | undefined;
    }
  | {
      type: "message_delta";
      delta?:
        | {
            stop_reason?: string | null | undefined;
            stop_sequence?: string | null | undefined;
          }
        | undefined;
      usage?: AnthropicUsage | null | undefined;
    }
  | {
      type: "message_stop";
    }
  | {
      type: "ping";
    }
  | {
      type: "error";
      error?: { type?: string | undefined; message?: string | undefined };
    }
  | (Record<string, unknown> & { type: "unknown" });

export interface AnthropicRequestOptions {
  signal?: AbortSignal | undefined;
}

export interface AnthropicClient {
  createMessage: (
    body: AnthropicMessagesRequest,
    options?: AnthropicRequestOptions,
  ) => Promise<AnthropicMessagesResponse>;
  streamMessage: (
    body: AnthropicMessagesRequest,
    options?: AnthropicRequestOptions,
  ) => AsyncIterable<AnthropicStreamEvent>;
}
