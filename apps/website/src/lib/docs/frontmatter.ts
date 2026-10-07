import { parse } from "yaml";

/** Documentation uses YAML frontmatter only; never evaluate JavaScript engines. */
export function parseMarkdownFrontmatter(source: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const text = source.replace(/^\uFEFF/, "");
  if (!/^---[ \t]*\r?\n/.test(text)) return { data: {}, content: text };
  const match =
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error("Unterminated documentation frontmatter.");
  const data: unknown = parse(match[1] ?? "", { maxAliasCount: 100 });
  if (data !== null && (typeof data !== "object" || Array.isArray(data))) {
    throw new Error("Documentation frontmatter must be a YAML mapping.");
  }
  return {
    data: (data ?? {}) as Record<string, unknown>,
    content: text.slice(match[0].length),
  };
}
