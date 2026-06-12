"use client";

import {
  ChevronDownIcon,
  CopyIcon,
  CopyMinusIcon,
  CopyPlusIcon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { JSON_COLORS, JsonNode, JsonTreeContext } from "./json-tree";

export type DebugChunk = {
  type?: unknown;
  _ts?: number;
  _dt?: number;
  _seq?: number;
} & Record<string, unknown>;

export function cleanChunk(data: DebugChunk): Record<string, unknown> {
  const clean = { ...data };
  delete (clean as Record<string, unknown>)._ts;
  delete (clean as Record<string, unknown>)._dt;
  delete (clean as Record<string, unknown>)._seq;
  return clean;
}

export function chunkType(chunk: DebugChunk): string {
  return String(chunk.type ?? "unknown");
}

export function chunkKey(chunk: DebugChunk): string {
  if (typeof chunk._seq === "number") return `seq:${chunk._seq}`;
  if (typeof chunk._ts === "number") {
    return `ts:${chunk._ts}:${String(chunk.type ?? "event")}`;
  }
  try {
    return `json:${JSON.stringify(chunk)}`;
  } catch {
    return `type:${String(chunk.type ?? "event")}`;
  }
}

export function debugArticleId(chunk: DebugChunk, index: number): string {
  return `${chunkKey(chunk)}:${index}`;
}

/** Returns the dataType/schemaId label the canvas client uses for routing. */
export function getEventRoutingLabel(chunk: DebugChunk): string | null {
  const type = chunkType(chunk);
  if (type === "structured-data") {
    if (typeof chunk.dataType === "string" && chunk.dataType.length > 0) {
      return chunk.dataType;
    }
    if (typeof chunk.schemaId === "string" && chunk.schemaId.length > 0) {
      return chunk.schemaId;
    }
    return null;
  }
  if (type === "interrupt") {
    if (typeof chunk.schemaId === "string" && chunk.schemaId.length > 0) {
      return chunk.schemaId;
    }
  }
  return null;
}

export type DebugArticlesControl = {
  generation: number;
  targetOpen: boolean;
  reportArticleOpen: (id: string, open: boolean) => void;
  unregisterArticle: (id: string) => void;
};

export const DebugArticlesContext = createContext<DebugArticlesControl>({
  generation: 0,
  targetOpen: true,
  reportArticleOpen: () => {},
  unregisterArticle: () => {},
});

export function RadioOffIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      role="presentation"
    >
      <path d="M13.414 13.414a2 2 0 1 1-2.828-2.828" />
      <path d="M16.247 7.761a6 6 0 0 1 1.744 4.572" />
      <path d="M19.075 4.933a10 10 0 0 1 2.234 10.72" />
      <path d="m2 2 20 20" />
      <path d="M4.925 19.067a10 10 0 0 1 0-14.134" />
      <path d="M7.753 16.239a6 6 0 0 1 0-8.478" />
    </svg>
  );
}

export function DebugEventArticle({
  articleId,
  chunk,
  onCopy,
  isSlow = false,
  showRoutingLabel = true,
}: {
  articleId: string;
  chunk: DebugChunk;
  onCopy: (chunk: DebugChunk) => Promise<void>;
  isSlow?: boolean;
  showRoutingLabel?: boolean;
}) {
  const {
    generation: articlesGeneration,
    targetOpen,
    reportArticleOpen,
    unregisterArticle,
  } = useContext(DebugArticlesContext);

  const data = cleanChunk(chunk);
  const [generation, setGeneration] = useState(0);
  const [targetExpanded, setTargetExpanded] = useState(true);
  const [allExpanded, setAllExpanded] = useState(true);
  const [isOpen, setIsOpen] = useState(targetOpen);

  useEffect(() => {
    void articlesGeneration;
    setIsOpen(targetOpen);
  }, [articlesGeneration, targetOpen]);

  useEffect(() => {
    reportArticleOpen(articleId, isOpen);
  }, [articleId, isOpen, reportArticleOpen]);

  useEffect(
    () => () => {
      unregisterArticle(articleId);
    },
    [articleId, unregisterArticle],
  );

  const date = chunk._ts ? new Date(chunk._ts) : null;
  const ms = chunk._ts ? String(chunk._ts % 1000).padStart(3, "0") : "";
  const clock = date
    ? `${date.toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}.${ms}`
    : "";

  const toggleAll = useCallback(() => {
    setAllExpanded((prev) => {
      const next = !prev;
      setTargetExpanded(next);
      setGeneration((g) => g + 1);
      return next;
    });
  }, []);

  const toggleArticle = useCallback(() => setIsOpen((open) => !open), []);

  const eventType = String(chunk.type ?? "event");
  const routingLabel = getEventRoutingLabel(chunk);
  const showLabel = showRoutingLabel && routingLabel !== null;
  const headerTitle = routingLabel
    ? `${eventType} · ${routingLabel}`
    : eventType;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-md border bg-slate-900",
        isSlow
          ? "border-amber-500/50 ring-1 ring-amber-500/20"
          : "border-slate-700",
      )}
    >
      <div
        className={`flex items-center justify-between gap-3 bg-slate-800/80 px-3 py-1 text-[11px] text-slate-300 ${
          isOpen ? "border-b border-slate-700" : ""
        }`}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left uppercase tracking-wide text-slate-400 transition hover:text-slate-200"
          title={headerTitle}
          aria-label={isOpen ? "Collapse event" : "Expand event"}
          aria-expanded={isOpen}
          onClick={toggleArticle}
        >
          <span className="truncate">{eventType}</span>
          {showLabel ? (
            <span className="shrink-0 font-mono text-[10px] normal-case tracking-normal text-slate-500">
              {routingLabel}
            </span>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono">{clock}</span>
          <span
            className={cn(
              "font-mono",
              isSlow ? "font-semibold text-amber-400" : "text-slate-400",
            )}
          >
            +{chunk._dt ?? 0}ms
          </span>
          <button
            type="button"
            className="cursor-pointer text-slate-300 transition hover:text-white"
            title={allExpanded ? "Collapse all" : "Expand all"}
            aria-label={allExpanded ? "Collapse all" : "Expand all"}
            onClick={toggleAll}
          >
            {allExpanded ? (
              <CopyMinusIcon className="size-3.5" />
            ) : (
              <CopyPlusIcon className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            className="cursor-pointer text-slate-300 transition hover:text-white"
            title="Copy this event"
            aria-label="Copy this event"
            onClick={() => void onCopy(chunk)}
          >
            <CopyIcon className="size-3.5" />
          </button>
          <button
            type="button"
            className="cursor-pointer text-slate-300 transition hover:text-white"
            title={isOpen ? "Collapse event" : "Expand event"}
            aria-label={isOpen ? "Collapse event" : "Expand event"}
            aria-expanded={isOpen}
            onClick={toggleArticle}
          >
            <ChevronDownIcon
              className={`size-3.5 transition-transform ${
                isOpen ? "" : "-rotate-90"
              }`}
            />
          </button>
        </div>
      </div>
      {isOpen ? (
        <JsonTreeContext.Provider value={{ generation, targetExpanded }}>
          <div
            className="p-4 font-mono text-xs leading-relaxed"
            style={{ color: JSON_COLORS.text }}
          >
            <JsonNode value={data} depth={0} />
          </div>
        </JsonTreeContext.Provider>
      ) : null}
    </article>
  );
}
