import { type StreamChunk, streamFromRoute } from "@kortyx/stream/browser";
import type { ChatMessage } from "../types/chat-message";

export interface StreamChatFromRouteArgs {
  endpoint: string;
  sessionId: string;
  workflowId?: string | undefined;
  messages: ChatMessage[];
  fetchImpl?: typeof fetch;
  headers?: Record<string, string> | undefined;
}

export async function* streamChatFromRoute(
  args: StreamChatFromRouteArgs,
): AsyncGenerator<StreamChunk, void, void> {
  yield* streamFromRoute({
    endpoint: args.endpoint,
    ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
    ...(args.headers ? { headers: args.headers } : {}),
    body: {
      sessionId: args.sessionId,
      ...(args.workflowId ? { workflowId: args.workflowId } : {}),
      messages: args.messages,
    },
  });
}
