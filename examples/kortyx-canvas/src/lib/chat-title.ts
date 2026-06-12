export const GENERATED_CHAT_TITLE_MAX_LEN = 48;
export const GENERATED_CHAT_TITLE_MAX_WORDS = 3;

const WRAPPING_QUOTES_RE = /^["'`“”‘’]+|["'`“”‘’]+$/g;
const TITLE_PREFIX_RE = /^(chat|session|title)\s*:\s*/i;
const MARKDOWN_PREFIX_RE = /^(#{1,6}\s*|[-*]\s+)/;
const MARKDOWN_WRAPPER_RE = /^(\*\*|__|\*|_)+|(\*\*|__|\*|_)+$/g;

export function stripChatTitlePresentationNoise(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(MARKDOWN_PREFIX_RE, "")
    .replace(WRAPPING_QUOTES_RE, "")
    .replace(MARKDOWN_WRAPPER_RE, "")
    .replace(TITLE_PREFIX_RE, "")
    .replace(MARKDOWN_WRAPPER_RE, "")
    .trim()
    .replace(/[.!?:;,]+$/g, "")
    .replace(WRAPPING_QUOTES_RE, "")
    .trim();
}

export function sanitizeGeneratedChatTitle(value: string): string {
  const words = stripChatTitlePresentationNoise(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, GENERATED_CHAT_TITLE_MAX_WORDS);

  let title = words
    .join(" ")
    .replace(/[.!?:;,]+$/g, "")
    .trim();

  if (title.length > GENERATED_CHAT_TITLE_MAX_LEN) {
    title = title.slice(0, GENERATED_CHAT_TITLE_MAX_LEN).trim();
    const lastSpace = title.lastIndexOf(" ");
    if (lastSpace > 0) title = title.slice(0, lastSpace).trim();
  }

  return stripChatTitlePresentationNoise(title);
}
