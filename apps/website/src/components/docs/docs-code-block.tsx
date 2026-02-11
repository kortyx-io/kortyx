"use client";

import { useEffect, useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { CheckIcon } from "@/components/icons/check-icon";
import { CopyIcon } from "@/components/icons/copy-icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DocsCodeBlockEntry = {
  language: string;
  code: string;
  fileLabel?: string;
};

type DocsCodeBlockProps = {
  entries: DocsCodeBlockEntry[];
};

function tabLabel(language: string): string {
  const lower = language.toLowerCase();
  if (lower === "ts" || lower === "tsx") return "TS";
  if (lower === "js" || lower === "jsx") return "JS";
  return lower.toUpperCase();
}

export function DocsCodeBlock(props: DocsCodeBlockProps) {
  const { entries } = props;
  const tabValues = useMemo(
    () => entries.map((_, index) => `tab-${index}`),
    [entries],
  );
  const [activeTab, setActiveTab] = useState(tabValues[0] ?? "tab-0");
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const activeIndex = tabValues.indexOf(activeTab);
  const activeEntry = entries[activeIndex] ?? entries[0];
  if (!activeEntry) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeEntry.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="my-4 overflow-x-auto rounded-md border border-border bg-muted dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 dark:border-zinc-800">
        {entries.length > 1 ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8 border bg-accent dark:border-zinc-600 dark:bg-zinc-800/60">
              {entries.map((entry, index) => (
                <TabsTrigger
                  key={`${entry.language}-${tabValues[index]}`}
                  value={tabValues[index] ?? `tab-${index}`}
                  className="h-7 cursor-pointer px-3 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:bg-zinc-900 dark:data-[state=active]:text-white"
                >
                  {tabLabel(entry.language)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-foreground dark:bg-zinc-200 dark:text-zinc-900">
            {tabLabel(activeEntry.language)}
          </span>
        )}

        <div className="flex min-w-0 items-center gap-2">
          {activeEntry.fileLabel ? (
            <span className="truncate font-mono text-sm text-muted-foreground dark:text-zinc-200">
              {activeEntry.fileLabel}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Copy code"
            title={copied ? "Copied" : "Copy code"}
            onClick={onCopy}
            className="inline-flex cursor-pointer items-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            {copied ? (
              <CheckIcon className="h-4 w-4 text-green-500" />
            ) : (
              <CopyIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={activeEntry.language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          padding: "24px",
          background: "transparent",
          border: "none",
          fontSize: "0.85rem",
          overflowX: "auto",
        }}
        codeTagProps={{
          style: {
            fontFamily: "var(--font-geist-mono)",
            fontStyle: "normal",
          },
        }}
      >
        {activeEntry.code}
      </SyntaxHighlighter>
    </div>
  );
}
