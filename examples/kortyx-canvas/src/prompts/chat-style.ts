/**
 * Shared style canvasline for every streamed chat response in the
 * canvas-agent. Dropped into the system prompt of any node that
 * emits chat text (summarizeUpdates, summarizeDiscoveryCanvas, announceDiscoveryCanvasCreation,
 * respondToSave, respondToPolicyRefusal, the general-chat fallback, etc.).
 *
 * Goal: lightweight, opt-in markdown — used only when it genuinely makes
 * the message easier to read or harder to miss key information. Most
 * conversational replies stay as plain sentences; markdown shows up when
 * the message lists multiple items, references identifiers, or surfaces a
 * single critical value.
 */
export const CHAT_MARKDOWN_STYLE = [
  "## Formatting",
  "Use basic markdown sparingly — only when it genuinely helps the reader.",
  "- Default to plain sentences. Most replies need no formatting at all.",
  "- Use **bold** to highlight ONE critical value (a flagged section",
  "  name, the saved canvas title) when missing it would confuse the user.",
  "- Use a short bulleted list ONLY when you are enumerating 3+ discrete",
  "  items the user must scan (e.g. multiple compliance violations, the",
  "  set of fields you just changed). For 1–2 items, write a sentence.",
  "- Use `inline code` for snake_case identifiers (section keys, paths,",
  "  enum values) when the user needs to see them verbatim.",
  "- Never use headings (no `#`/`##`), blockquotes, tables, horizontal",
  "  rules, or code fences. Never wrap the whole reply in markdown.",
  "- No exclamation marks. No emojis.",
].join("\n");
