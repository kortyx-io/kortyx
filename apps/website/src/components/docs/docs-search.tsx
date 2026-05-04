"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { SearchIcon } from "lucide-react";
import MiniSearch, { type SearchResult as MiniSearchResult } from "minisearch";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { DocsSearchEntry } from "@/lib/docs";
import { cn } from "@/lib/utils/cn";

type DocsSearchProps = {
  entries: DocsSearchEntry[];
  className?: string;
};

type SearchResult = DocsSearchEntry & {
  score: number;
  excerpt: string;
};

type SearchDocument = Omit<DocsSearchEntry, "keywords"> & {
  id: string;
  keywords: string;
};

type SearchIndex = {
  index: MiniSearch<SearchDocument>;
  documentsById: Map<string, SearchDocument>;
};

const MAX_RESULTS = 8;

function getShortcutModifierLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes("mac os") || userAgent.includes("macintosh")
    ? "⌘"
    : "Ctrl";
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildExcerpt(content: string, query: string): string {
  const plain = stripMarkdown(content);
  if (!plain) return "";

  const normalizedPlain = normalize(plain);
  const normalizedQuery = normalize(query);
  const firstToken = normalizedQuery.split(" ").find(Boolean) ?? "";
  const matchIndex = firstToken ? normalizedPlain.indexOf(firstToken) : -1;
  const start = Math.max(matchIndex - 70, 0);
  const excerpt = plain.slice(start, start + 180).trim();

  return `${start > 0 ? "... " : ""}${excerpt}${plain.length > start + 180 ? " ..." : ""}`;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatches(text: string, query: string) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return text;

  const matcher = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  return text.split(matcher).map((part, index) => {
    const isMatch = tokens.some((token) => normalize(part) === token);
    if (!isMatch) return part;
    return (
      <strong
        // biome-ignore lint/suspicious/noArrayIndexKey: Split fragments are static for each rendered query.
        key={`${part}:${index}`}
        className="font-semibold text-foreground"
      >
        {part}
      </strong>
    );
  });
}

function createSearchIndex(entries: DocsSearchEntry[]): SearchIndex {
  const documents = entries.map((entry, index) => ({
    ...entry,
    id: `${entry.version}:${entry.href}:${index}`,
    keywords: entry.keywords.join(" "),
    content: stripMarkdown(entry.content),
  }));
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const index = new MiniSearch<SearchDocument>({
    fields: ["title", "section", "description", "keywords", "content"],
    storeFields: ["id"],
    searchOptions: {
      boost: {
        title: 6,
        keywords: 5,
        section: 3,
        description: 2,
        content: 1,
      },
      prefix: true,
      fuzzy: (term) => (term.length > 3 ? 0.2 : false),
      maxFuzzy: 1,
      weights: {
        prefix: 0.8,
        fuzzy: 0.25,
      },
    },
  });

  index.addAll(documents);
  return { index, documentsById };
}

function toSearchResult(
  result: MiniSearchResult,
  searchIndex: SearchIndex,
  query: string,
): SearchResult | null {
  const document = searchIndex.documentsById.get(String(result.id));
  if (!document) return null;

  return {
    href: document.href,
    title: document.title,
    description: document.description,
    keywords: document.keywords.split(" ").filter(Boolean),
    version: document.version,
    section: document.section,
    content: document.content,
    score: result.score,
    excerpt: buildExcerpt(document.content, query),
  };
}

function searchDocs(searchIndex: SearchIndex, query: string): SearchResult[] {
  if (!normalize(query)) return [];

  return searchIndex.index
    .search(query)
    .slice(0, MAX_RESULTS)
    .map((result) => toSearchResult(result, searchIndex, query))
    .filter((result): result is SearchResult => result !== null);
}

export function DocsSearch({ entries, className }: DocsSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [shortcutModifierLabel, setShortcutModifierLabel] = useState("Ctrl");
  const searchIndex = useMemo(() => createSearchIndex(entries), [entries]);
  const results = searchDocs(searchIndex, deferredQuery);
  const hasQuery = normalize(query).length > 0;

  useEffect(() => {
    setShortcutModifierLabel(getShortcutModifierLabel());
  }, []);

  useEffect(() => {
    if (!pathname) return;
    setIsOpen(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-lg border border-border bg-background pl-3 pr-1 text-left text-sm text-muted-foreground transition-[border-color,box-shadow,color] hover:border-ring/60 hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none",
            className,
          )}
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search...</span>
          <kbd className="hidden items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground md:flex">
            <span
              className={cn(
                "leading-none",
                shortcutModifierLabel === "⌘" && "translate-y-px scale-160",
              )}
            >
              {shortcutModifierLabel}
            </span>
            <span>K</span>
          </kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-60 bg-black/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="-translate-x-1/2 fixed top-[12vh] left-1/2 z-61 w-[calc(100vw-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Title className="sr-only">Search docs</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search through Kortyx documentation pages.
          </Dialog.Description>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              placeholder="Search docs..."
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground md:flex">
              Esc
            </kbd>
          </div>

          {!hasQuery ? (
            <div className="p-5 text-sm text-muted-foreground">
              Search titles, descriptions, keywords, and docs content.
            </div>
          ) : results.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">
              No docs found for "{query}".
            </div>
          ) : (
            <ul className="docs-sidebar-scroll max-h-[min(32rem,calc(88vh-8rem))] overflow-y-auto p-2">
              {results.map((result) => (
                <li key={`${result.version}:${result.href}`}>
                  <Link
                    href={result.href}
                    className="block rounded-xl px-3 py-3 outline-none transition-colors hover:bg-accent focus:bg-accent"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {highlightMatches(result.title, query)}
                      </span>
                      {result.section && (
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                          {result.section}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {highlightMatches(
                        result.excerpt || result.description,
                        query,
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
