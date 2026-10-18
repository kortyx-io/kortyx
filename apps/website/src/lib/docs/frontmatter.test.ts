import { expect, it } from "vitest";
import { parseMarkdownFrontmatter } from "./frontmatter";

it("parses YAML metadata and leaves Markdown content unchanged", () => {
  const content = "# Example\n\n```ts\nconst name = 'Studio';\n```\n";
  expect(
    parseMarkdownFrontmatter(
      `---\ntitle: Example\nkeywords: [sdk, studio]\ndescription: |\n  Two lines\n  of text\n---\n${content}`,
    ),
  ).toEqual({
    data: {
      title: "Example",
      keywords: ["sdk", "studio"],
      description: "Two lines\nof text\n",
    },
    content,
  });
});
it("accepts BOM, Windows newlines, empty metadata and files without metadata", () => {
  expect(
    parseMarkdownFrontmatter("\uFEFF---\r\ntitle: Test\r\n---\r\n# Test\r\n"),
  ).toEqual({ data: { title: "Test" }, content: "# Test\r\n" });
  expect(parseMarkdownFrontmatter("---\n\n---\n# Test")).toEqual({
    data: {},
    content: "# Test",
  });
  expect(parseMarkdownFrontmatter("# Test\n---\nBody")).toEqual({
    data: {},
    content: "# Test\n---\nBody",
  });
});
it("rejects malformed frontmatter and non-mapping metadata", () => {
  expect(() => parseMarkdownFrontmatter("---\ntitle: Test")).toThrow(
    "Unterminated",
  );
  expect(() => parseMarkdownFrontmatter("---\n[one, two]\n---\nBody")).toThrow(
    "mapping",
  );
  expect(() =>
    parseMarkdownFrontmatter("---\ntitle: [broken\n---\nBody"),
  ).toThrow();
});
