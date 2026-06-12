import type { ChatHistoryMessage } from "@/lib/runtime-context";

/**
 * Renders the trailing slice of chat history (oldest → newest) for an LLM
 * prompt. Caps at the last `limit` turns to keep token usage predictable;
 * the default 8 is plenty to bridge multi-turn clarifications without
 * blowing up context size.
 *
 * Pure function — safe to import from tests.
 */
export function serializeHistoryForPrompt(
  history: ChatHistoryMessage[],
  limit = 8,
): string {
  if (history.length === 0) return "(no prior turns)";
  return history
    .slice(-limit)
    .map((msg) => `${msg.role}: ${msg.content.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

/**
 * Untrimmed serializer used by `chat-node` where the full available
 * history is already capped upstream. Keeps line breaks inside each
 * message instead of collapsing them.
 */
export function formatHistoryVerbatim(history: ChatHistoryMessage[]): string {
  return history.map((msg) => `${msg.role}: ${msg.content}`).join("\n");
}
