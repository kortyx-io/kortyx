import {
  consumeStream,
  type StreamChunk,
  streamChatFromRoute,
} from "kortyx/browser";

export type OutgoingChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
};

export type ChatTransport = {
  stream(args: {
    sessionId: string;
    workflowId: string;
    messages: OutgoingChatMessage[];
    onChunk: (
      chunk: StreamChunk,
    ) => undefined | boolean | Promise<boolean | undefined>;
  }): Promise<void>;
};

export function createApiRouteChatTransport(): ChatTransport {
  return {
    async stream({ sessionId, workflowId, messages, onChunk }) {
      const stream = streamChatFromRoute({
        endpoint: "/api/chat",
        sessionId,
        workflowId,
        messages,
      });

      await consumeStream(stream, {
        onChunk,
      });
    },
  };
}
