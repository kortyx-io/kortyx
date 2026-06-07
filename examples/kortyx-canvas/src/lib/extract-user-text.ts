/**
 * Kortyx forwards either the raw user message (when a node is the workflow
 * entry point) or a state object set by an upstream node (e.g.
 * `screenUpdateIntentNode` forwards `{ userText, screen }`). This helper
 * normalises both shapes into the trimmed user text so every node
 * downstream sees the same input.
 */
export type ForwardableInput =
  | string
  | { userText?: string }
  | undefined
  | null;

export function extractUserText(input: ForwardableInput): string {
  if (typeof input === "string") return input.trim();
  if (
    input &&
    typeof input === "object" &&
    typeof input.userText === "string"
  ) {
    return input.userText.trim();
  }
  return "";
}
