/**
 * Wire format for user messages that carry a canvas quote. The quote rides
 * along inside the message `content` as a markdown blockquote prefix:
 *
 *   > Quoted line 1
 *   > Quoted line 2
 *   ⏎
 *   The user's actual message
 *
 * Using markdown semantics here means the LLM sees the quote in a shape it
 * already understands (so prompts don't need special casing), and the chat
 * UI parses it back out to render as a styled chip above the message bubble.
 */

export function combineQuoteAndMessage(
  quote: string | null,
  message: string,
): string {
  const trimmedMessage = message.trim();
  if (!quote) return trimmedMessage;
  const quoteBlock = quote
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `${quoteBlock}\n\n${trimmedMessage}`;
}

export function extractQuoteFromMessage(content: string): {
  quote: string | null;
  body: string;
} {
  if (!content.startsWith("> ")) return { quote: null, body: content };
  const lines = content.split("\n");
  const quoteLines: string[] = [];
  let i = 0;
  while (i < lines.length && lines[i]?.startsWith("> ")) {
    quoteLines.push(lines[i]?.slice(2) ?? "");
    i += 1;
  }
  // Require a blank-line separator between quote and body so we don't
  // accidentally swallow a user message that legitimately starts with ">".
  if (lines[i] !== "") return { quote: null, body: content };
  while (i < lines.length && lines[i] === "") i += 1;
  const body = lines.slice(i).join("\n");
  return { quote: quoteLines.join("\n"), body };
}
