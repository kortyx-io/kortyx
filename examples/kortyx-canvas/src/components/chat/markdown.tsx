"use client";

import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";
import { useMemo } from "react";

/**
 * Minimal allow-list for assistant bubbles. No headings/images/raw HTML — the
 * agent's prose lives in a tight chat column, so we keep formatting compact.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
];
const ALLOWED_ATTR = ["href", "title", "rel", "target"];

const INLINE_BULLET_RE = / - (\*\*[^*\n]+?\*\*)/g;
const FIRST_BULLET_RE = /([^\n])\n- /;

/**
 * Some model turns flatten lists onto a single line, e.g.
 *   "Includes: - **A:** … - **B:** …"
 * Marked treats mid-line " - " as text. Inject newlines for that very specific
 * "space-dash-space-bold" pattern so it parses as a real list.
 */
function normalizeInlineBullets(text: string): string {
  const withBullets = text.replace(INLINE_BULLET_RE, "\n- $1");
  if (withBullets === text) return text;
  return withBullets.replace(FIRST_BULLET_RE, "$1\n\n- ");
}

type Props = {
  content: string;
  /**
   * When true, a small pulsing dot is appended INLINE at the end of the
   * last block (paragraph / list item / blockquote / code block). Sits on
   * the same line as the final character so the streaming indicator
   * reads as part of the message instead of as a separate row below it.
   */
  isStreaming?: boolean;
};

// Inline streaming indicator injected at the end of the last block of a
// live assistant message. Uses Tailwind utilities directly so the styles
// are guaranteed to be scanned and generated at build time (Tailwind
// reads class strings out of .tsx source files). Keeping the markup as
// a top-level const keeps that scan deterministic.
const TRAILING_DOT_HTML =
  '<span class="ml-1.5 inline-block size-2 rounded-full bg-current align-middle opacity-70 animate-pulse"></span>';
const TRAILING_BLOCK_TAGS = ["</p>", "</li>", "</blockquote>", "</pre>"];

function injectTrailingDot(html: string): string {
  if (!html) return TRAILING_DOT_HTML;
  // Find the latest closing block tag and place the dot right before it
  // so it renders inline with the final text inside that block.
  let bestIdx = -1;
  for (const tag of TRAILING_BLOCK_TAGS) {
    const idx = html.lastIndexOf(tag);
    if (idx > bestIdx) bestIdx = idx;
  }
  if (bestIdx === -1) return html + TRAILING_DOT_HTML;
  return html.slice(0, bestIdx) + TRAILING_DOT_HTML + html.slice(bestIdx);
}

export function ChatMarkdown({ content, isStreaming }: Props) {
  const html = useMemo(() => {
    if (!content) return isStreaming ? TRAILING_DOT_HTML : "";
    const normalized = normalizeInlineBullets(content);
    const raw = marked.parse(normalized, {
      async: false,
      breaks: true,
      gfm: true,
    }) as string;
    const sanitized = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ADD_ATTR: ["target"],
      FORBID_ATTR: ["style", "onerror", "onclick"],
    });
    // Injection happens AFTER sanitize so the dot's `<span class="…">`
    // isn't stripped by DOMPurify's tight allow-list. Safe because the
    // injected markup is a hard-coded constant, not user input.
    return isStreaming ? injectTrailingDot(sanitized) : sanitized;
  }, [content, isStreaming]);

  const proseClass = [
    "text-sm leading-relaxed",
    "[&_a]:text-primary [&_a]:underline",
    "[&_p]:my-2 [&_p:first-of-type]:mt-0 [&_p:last-of-type]:mb-0 [&_p]:wrap-break-word",
    "[&_br]:block",
    "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
    "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
    "[&_li]:my-0.5 [&_li]:wrap-break-word",
    "[&_code]:rounded [&_code]:bg-foreground/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:font-mono [&_code]:break-all",
    "[&_pre]:my-2 [&_pre]:rounded [&_pre]:bg-foreground/10 [&_pre]:px-2 [&_pre]:py-1.5 [&_pre]:overflow-x-auto [&_pre_code]:break-normal",
    "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-foreground/20 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
    "[&_strong]:font-semibold",
  ].join(" ");

  return (
    <div className={proseClass} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
