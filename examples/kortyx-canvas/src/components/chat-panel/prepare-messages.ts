import type {
  ChatMsg,
  OutgoingChatMessage,
  PrepareContextMessages,
} from "@kortyx/react";
import type { ChatContext } from "@/types/chat-panel";

/** Hard cap on the rolling chat history shipped to the server. */
export const HISTORY_TURN_LIMIT = 15;

/**
 * Trim noise (interrupt-only assistant turns + their UUID-style user
 * replies) and cap to the last N messages before sending. Kortyx's default
 * behavior is to ship the full message list; we override to avoid wasting
 * context window on picker plumbing.
 */
export const prepareChatContextMessages: PrepareContextMessages<
  ChatContext
> = ({ messages }) => {
  const cleaned: OutgoingChatMessage[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (!msg) continue;
    const content = msg.content?.trim() ?? "";

    if (msg.role === "assistant") {
      // Interrupt-only assistant turns have no text content; drop them.
      if (content === "") continue;
      cleaned.push({ role: "assistant", content });
      continue;
    }

    if (msg.role === "user") {
      if (content === "") continue;
      // If the previous turn was an interrupt-only assistant message, this
      // user message is the picker response (a UUID or brief number), not
      // something the LLM needs to see.
      const prev = messages[i - 1];
      if (prev && isInterruptOnlyAssistant(prev)) continue;
      cleaned.push({ role: "user", content });
    }
  }
  return cleaned.slice(-HISTORY_TURN_LIMIT);
};

function isInterruptOnlyAssistant(msg: ChatMsg): boolean {
  if (msg.role !== "assistant") return false;
  if ((msg.content?.trim() ?? "") !== "") return false;
  return Boolean(
    msg.contentPieces?.some((piece) => piece.type === "interrupt"),
  );
}
