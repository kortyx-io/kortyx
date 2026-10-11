export const GENERATED_CHAT_TITLE_MAX_LEN = 48;
export const GENERATED_CHAT_TITLE_MAX_WORDS = 3;

const WRAPPING_QUOTES_RE = /^["'`“”‘’]+|["'`“”‘’]+$/g;
const TITLE_PREFIX_RE = /^(chat|session|title)\s*:\s*/i;
const MARKDOWN_PREFIX_RE = /^(#{1,6}\s*|[-*]\s+)/;

function stripMarkdownWrappers(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && (value[start] === "*" || value[start] === "_")) {
    start += 1;
  }
  while (end > start && (value[end - 1] === "*" || value[end - 1] === "_")) {
    end -= 1;
  }
  return value.slice(start, end);
}

export function stripChatTitlePresentationNoise(value: string): string {
  let title = value
    .replace(/\s+/g, " ")
    .replace(MARKDOWN_PREFIX_RE, "")
    .replace(WRAPPING_QUOTES_RE, "");
  title = stripMarkdownWrappers(title).replace(TITLE_PREFIX_RE, "");
  return stripMarkdownWrappers(title)
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
