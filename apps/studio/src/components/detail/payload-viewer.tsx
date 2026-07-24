"use client";

import {
  AlignLeft,
  Braces,
  Check,
  ChevronDown,
  Clipboard,
  CodeXml,
  FileText,
  Sparkles,
  TextWrap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { chromeLight, ObjectInspector } from "react-inspector";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { stringify as stringifyYaml } from "yaml";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ViewMode = "pretty" | "json" | "yaml" | "markdown" | "text";

const VIEW_MODES: Array<{
  id: ViewMode;
  label: string;
  icon: typeof Sparkles;
}> = [
  { id: "pretty", label: "Pretty", icon: Sparkles },
  { id: "json", label: "JSON", icon: Braces },
  { id: "yaml", label: "YAML", icon: CodeXml },
  { id: "markdown", label: "MD", icon: FileText },
  { id: "text", label: "Text", icon: AlignLeft },
];

export function PayloadViewer({
  value,
  defaultMode = "pretty",
  className,
}: {
  value: unknown;
  defaultMode?: ViewMode;
  className?: string;
}) {
  const [mode, setMode] = useState<ViewMode>(defaultMode);
  const [clean, setClean] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const activeMode =
    VIEW_MODES.find((item) => item.id === mode) ?? VIEW_MODES[0];
  const ActiveModeIcon = activeMode.icon;
  const cleaned = useMemo(() => cleanPayload(value), [value]);
  const displayedValue = clean ? cleaned.value : value;
  const serialized = useMemo(
    () => serializePayload(displayedValue),
    [displayedValue],
  );
  const copyValue =
    mode === "yaml"
      ? serialized.yaml
      : mode === "markdown"
        ? serialized.markdown
        : mode === "text"
          ? serialized.text
          : serialized.json;

  function copy() {
    navigator.clipboard
      .writeText(copyValue)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_500);
      })
      .catch(() => undefined);
  }

  return (
    <section
      aria-label="Payload viewer"
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border bg-muted/10 shadow-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-1.5 border-b bg-muted/25 p-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label={`Payload representation: ${activeMode.label}`}
              className="min-w-24 justify-start bg-background text-foreground shadow-xs hover:bg-background"
            >
              <ActiveModeIcon />
              {activeMode.label}
              <ChevronDown className="ml-auto text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              View as
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(value) => {
                if (isViewMode(value)) setMode(value);
              }}
            >
              {VIEW_MODES.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuRadioItem key={item.id} value={item.id}>
                    <Icon />
                    {item.label}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-pressed={clean}
            title="Hide or show empty values"
            onClick={() => setClean((current) => !current)}
            className={cn(clean && "bg-background shadow-xs")}
          >
            <Sparkles />
            {clean ? "Clean" : "Raw"}
            {clean && cleaned.removed > 0 && (
              <span className="rounded bg-muted px-1 font-mono text-[9px] text-muted-foreground">
                −{cleaned.removed}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={wrap ? "Disable text wrapping" : "Enable text wrapping"}
            aria-pressed={wrap}
            title={wrap ? "Disable text wrapping" : "Enable text wrapping"}
            onClick={() => setWrap((current) => !current)}
            className={cn(wrap && "bg-background shadow-xs")}
          >
            <TextWrap />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={copied ? "Copied" : `Copy ${mode}`}
            title={copied ? "Copied" : `Copy ${mode}`}
            onClick={copy}
          >
            {copied ? <Check /> : <Clipboard />}
          </Button>
        </div>
      </div>

      <div
        role="tabpanel"
        className="data-table-body-scroll max-h-[28rem] min-h-28 overflow-auto"
      >
        {mode === "pretty" && (
          <div
            className={cn(
              "min-w-max p-3 [&_*]:max-w-full",
              wrap &&
                "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
            )}
          >
            <ObjectInspector
              data={displayedValue}
              expandLevel={2}
              theme={inspectorTheme as never}
            />
          </div>
        )}
        {mode === "json" && (
          <CodeView code={serialized.json} language="json" wrap={wrap} />
        )}
        {mode === "yaml" && (
          <CodeView code={serialized.yaml} language="yaml" wrap={wrap} />
        )}
        {mode === "text" && (
          <CodeView code={serialized.text} language="plain" wrap={wrap} />
        )}
        {mode === "markdown" && (
          <div
            className={cn(
              "min-w-max p-4",
              wrap && "min-w-0 [overflow-wrap:anywhere]",
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              components={markdownComponents}
            >
              {serialized.markdown}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}

function CodeView({
  code,
  wrap,
}: {
  code: string;
  language: "json" | "yaml" | "plain";
  wrap: boolean;
}) {
  return (
    <pre
      className={cn(
        "min-h-28 min-w-max p-3 font-mono text-[11px] leading-relaxed text-foreground",
        wrap &&
          "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
      )}
    >
      {code}
    </pre>
  );
}

function cleanPayload(value: unknown): { value: unknown; removed: number } {
  let removed = 0;

  function visit(current: unknown, root = false): unknown | typeof OMIT {
    if (
      current === null ||
      current === undefined ||
      (typeof current === "string" && current.trim() === "")
    ) {
      if (!root) {
        removed += 1;
        return OMIT;
      }
      return current;
    }
    if (Array.isArray(current)) {
      const entries = current
        .map((item) => visit(item))
        .filter((item) => item !== OMIT);
      if (!root && entries.length === 0) {
        removed += 1;
        return OMIT;
      }
      return entries;
    }
    if (isRecord(current)) {
      const entries = Object.entries(current).flatMap(([key, item]) => {
        const cleaned = visit(item);
        return cleaned === OMIT ? [] : [[key, cleaned] as const];
      });
      if (!root && entries.length === 0) {
        removed += 1;
        return OMIT;
      }
      return Object.fromEntries(entries);
    }
    return current;
  }

  const cleaned = visit(value, true);
  return { value: cleaned === OMIT ? value : cleaned, removed };
}

function serializePayload(value: unknown) {
  const json = safeJson(value);
  const yaml = stringifyYaml(value, { lineWidth: 0 });
  const primaryText = findPrimaryText(value);
  return {
    json,
    yaml,
    markdown: primaryText ?? `\`\`\`yaml\n${yaml}\`\`\``,
    text: primaryText ?? flattenText(value) ?? json,
  };
}

function findPrimaryText(value: unknown, depth = 0): string | undefined {
  if (typeof value === "string") return depth === 0 ? value : undefined;
  if (depth > 7) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") continue;
      const result = findPrimaryText(item, depth + 1);
      if (result) return result;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const key of PRIMARY_TEXT_KEYS) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (candidate && typeof candidate === "object") {
      const result = findPrimaryText(candidate, depth + 1);
      if (result) return result;
    }
  }
  for (const item of Object.values(value)) {
    if (!item || typeof item !== "object") continue;
    const result = findPrimaryText(item, depth + 1);
    if (result) return result;
  }
  return undefined;
}

function flattenText(value: unknown): string | undefined {
  if (!isRecord(value) && !Array.isArray(value)) return String(value ?? "");
  const lines: string[] = [];

  function visit(current: unknown, path: string, depth: number) {
    if (depth > 7 || lines.length >= 100) return;
    if (current === null || current === undefined) return;
    if (typeof current !== "object") {
      lines.push(path ? `${path}: ${String(current)}` : String(current));
      return;
    }
    for (const [key, item] of Object.entries(current)) {
      visit(item, path ? `${path}.${key}` : key, depth + 1);
    }
  }

  visit(value, "", 0);
  return lines.length ? lines.join("\n") : undefined;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isViewMode(value: string): value is ViewMode {
  return VIEW_MODES.some((mode) => mode.id === value);
}

const OMIT = Symbol("omit-empty-payload-value");
const PRIMARY_TEXT_KEYS = [
  "content",
  "message",
  "text",
  "output",
  "response",
  "result",
  "prompt",
] as const;

const inspectorTheme = {
  ...chromeLight,
  BASE_FONT_FAMILY: "var(--font-geist-mono)",
  BASE_FONT_SIZE: "11px",
  BASE_LINE_HEIGHT: 1.65,
  BASE_BACKGROUND_COLOR: "transparent",
  BASE_COLOR: "var(--foreground)",
  OBJECT_NAME_COLOR: "var(--chart-3)",
  OBJECT_VALUE_NULL_COLOR: "var(--muted-foreground)",
  OBJECT_VALUE_UNDEFINED_COLOR: "var(--muted-foreground)",
  OBJECT_VALUE_REGEXP_COLOR: "var(--chart-5)",
  OBJECT_VALUE_STRING_COLOR: "var(--chart-2)",
  OBJECT_VALUE_SYMBOL_COLOR: "var(--chart-5)",
  OBJECT_VALUE_NUMBER_COLOR: "var(--chart-4)",
  OBJECT_VALUE_BOOLEAN_COLOR: "var(--chart-1)",
  OBJECT_VALUE_FUNCTION_PREFIX_COLOR: "var(--chart-5)",
  ARROW_COLOR: "var(--muted-foreground)",
  TREENODE_FONT_FAMILY: "var(--font-geist-mono)",
  TREENODE_FONT_SIZE: "11px",
  TREENODE_LINE_HEIGHT: 1.65,
  TREENODE_PADDING_LEFT: 14,
};

const markdownComponents: Components = {
  h1: ({ node: _node, ...props }) => (
    <h1 className="mb-3 text-lg font-semibold" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2 className="mt-4 mb-2 text-base font-semibold" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="mt-3 mb-1.5 text-sm font-semibold" {...props} />
  ),
  p: ({ node: _node, ...props }) => (
    <p className="my-2 text-xs leading-6" {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 text-xs" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 text-xs" {...props} />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="my-3 border-l-2 pl-3 text-xs text-muted-foreground"
      {...props}
    />
  ),
  code: ({ node: _node, ...props }) => (
    <code
      className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]"
      {...props}
    />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="my-3 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-[11px]"
      {...props}
    />
  ),
  a: ({ node: _node, ...props }) => (
    <a
      className="text-blue-600 underline underline-offset-2 dark:text-blue-400"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th className="border bg-muted/40 px-2 py-1 text-left" {...props} />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border px-2 py-1 align-top" {...props} />
  ),
  img: ({ alt }) => (
    <span className="text-xs text-muted-foreground">
      [Image: {alt ?? "image"}]
    </span>
  ),
};
