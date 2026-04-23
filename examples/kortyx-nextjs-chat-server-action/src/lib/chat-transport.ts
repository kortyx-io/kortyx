import type { StreamChunk } from "kortyx/browser";
import { runChat } from "@/app/actions/chat";

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

export function createServerActionChatTransport(): ChatTransport {
  return {
    async stream({ sessionId, workflowId, messages, onChunk }) {
      const chunks = await runChat({
        sessionId,
        workflowId,
        messages,
      });

      for (const chunk of chunks) {
        const shouldContinue = await onChunk(chunk);
        if (chunk.type === "done" || shouldContinue === false) {
          break;
        }
      }
    },
  };
}
