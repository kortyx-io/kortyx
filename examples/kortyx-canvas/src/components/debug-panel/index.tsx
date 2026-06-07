"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FilterIcon,
  RadioIcon,
  TurtleIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  chunkType,
  cleanChunk,
  DebugArticlesContext,
  type DebugArticlesControl,
  type DebugChunk,
  DebugEventArticle,
  debugArticleId,
  RadioOffIcon,
} from "./event-article";

export type { DebugChunk } from "./event-article";

const SLOW_THRESHOLD_STORAGE_KEY = "canvas-agent:debugSlowThresholdMs";
const DEFAULT_SLOW_THRESHOLD_MS = 500;
const SCROLL_STICKY_PX = 48;
const EVENT_ROUTING_LABEL_MIN_WIDTH_PX = 360;

function readStoredSlowThreshold(): number {
  if (typeof window === "undefined") return DEFAULT_SLOW_THRESHOLD_MS;
  try {
    const raw = window.localStorage.getItem(SLOW_THRESHOLD_STORAGE_KEY);
    if (!raw) return DEFAULT_SLOW_THRESHOLD_MS;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return DEFAULT_SLOW_THRESHOLD_MS;
    return parsed;
  } catch {
    return DEFAULT_SLOW_THRESHOLD_MS;
  }
}

function writeStoredSlowThreshold(value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SLOW_THRESHOLD_STORAGE_KEY, String(value));
  } catch {
    // best-effort persistence
  }
}

export function DebugPanel({
  chunks,
  viewKey,
  isStreaming = false,
  isLive = true,
  onToggleLive,
  hasSnapshot = false,
  onClose,
}: {
  chunks: unknown[];
  viewKey: string;
  isStreaming?: boolean;
  isLive?: boolean;
  onToggleLive?: () => void;
  hasSnapshot?: boolean;
  onClose: () => void;
}) {
  const debugChunks = chunks as DebugChunk[];
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleOpenRef = useRef(new Map<string, boolean>());
  const filteredChunksRef = useRef<DebugChunk[]>([]);

  const [showRoutingLabel, setShowRoutingLabel] = useState(true);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(() => new Set());
  const [slowThresholdMs, setSlowThresholdMs] = useState(
    DEFAULT_SLOW_THRESHOLD_MS,
  );
  const [allArticlesOpen, setAllArticlesOpen] = useState(true);
  const [articlesTargetOpen, setArticlesTargetOpen] = useState(true);
  const [articlesGeneration, setArticlesGeneration] = useState(0);

  // ── persistent slow threshold ──────────────────────────────────────────────
  useEffect(() => {
    setSlowThresholdMs(readStoredSlowThreshold());
  }, []);

  useEffect(() => {
    writeStoredSlowThreshold(slowThresholdMs);
  }, [slowThresholdMs]);

  // ── routing-label visibility via ResizeObserver ────────────────────────────
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const update = (width: number) => {
      setShowRoutingLabel(width >= EVENT_ROUTING_LABEL_MIN_WIDTH_PX);
    };

    update(panel.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      update(entry.contentRect.width);
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  // ── article open-state tracking ────────────────────────────────────────────
  const syncHeaderFromArticles = useCallback((chunks: DebugChunk[]) => {
    if (chunks.length === 0) {
      setAllArticlesOpen(true);
      return;
    }
    const allOpen = chunks.every((chunk, index) => {
      const id = debugArticleId(chunk, index);
      return articleOpenRef.current.get(id) !== false;
    });
    setAllArticlesOpen(allOpen);
  }, []);

  const reportArticleOpen = useCallback<
    DebugArticlesControl["reportArticleOpen"]
  >(
    (id, open) => {
      articleOpenRef.current.set(id, open);
      syncHeaderFromArticles(filteredChunksRef.current);
    },
    [syncHeaderFromArticles],
  );

  const unregisterArticle = useCallback<
    DebugArticlesControl["unregisterArticle"]
  >(
    (id) => {
      articleOpenRef.current.delete(id);
      syncHeaderFromArticles(filteredChunksRef.current);
    },
    [syncHeaderFromArticles],
  );

  // Reset open state whenever the view switches (live ↔ snapshot)
  useEffect(() => {
    void viewKey;
    articleOpenRef.current.clear();
    setAllArticlesOpen(true);
    setArticlesTargetOpen(true);
    setArticlesGeneration((g) => g + 1);
  }, [viewKey]);

  // ── derived data ───────────────────────────────────────────────────────────
  const typeSummaries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const chunk of debugChunks) {
      const type = chunkType(chunk);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [debugChunks]);

  const filteredChunks = useMemo(
    () => debugChunks.filter((chunk) => !hiddenTypes.has(chunkType(chunk))),
    [debugChunks, hiddenTypes],
  );

  // Keep ref in sync so callbacks always see the latest list
  filteredChunksRef.current = filteredChunks;

  const firstTs = filteredChunks.find((c) => c._ts !== undefined)?._ts ?? null;
  const lastTs =
    filteredChunks
      .slice()
      .reverse()
      .find((c) => c._ts !== undefined)?._ts ?? null;
  const totalSec =
    (firstTs && lastTs ? Math.max(0, lastTs - firstTs) : 0) / 1000;
  const slowCount = filteredChunks.filter(
    (c) => (c._dt ?? 0) >= slowThresholdMs,
  ).length;
  const visibleTypeCount = typeSummaries.filter(
    ([type]) => !hiddenTypes.has(type),
  ).length;

  // ── actions ────────────────────────────────────────────────────────────────
  const showAllTypes = useCallback(() => setHiddenTypes(new Set()), []);

  const hideAllTypes = useCallback(() => {
    setHiddenTypes(new Set(typeSummaries.map(([type]) => type)));
  }, [typeSummaries]);

  const toggleTypeFilter = useCallback((type: string) => {
    setHiddenTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleAllArticles = useCallback(() => {
    setAllArticlesOpen((prev) => {
      const next = !prev;
      setArticlesTargetOpen(next);
      setArticlesGeneration((g) => g + 1);
      return next;
    });
  }, []);

  const copyAll = useCallback(async () => {
    const cleanChunks = filteredChunks.map(cleanChunk);
    await navigator.clipboard.writeText(JSON.stringify(cleanChunks, null, 2));
  }, [filteredChunks]);

  const copyOne = useCallback(async (chunk: DebugChunk) => {
    await navigator.clipboard.writeText(
      JSON.stringify(cleanChunk(chunk), null, 2),
    );
  }, []);

  // ── auto-scroll ────────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setStickToBottom(
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_STICKY_PX,
    );
  }, []);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setStickToBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    void filteredChunks.length;
    void isStreaming;
    if (!stickToBottom) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filteredChunks.length, isStreaming, stickToBottom]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <DebugArticlesContext.Provider
      value={{
        generation: articlesGeneration,
        targetOpen: articlesTargetOpen,
        reportArticleOpen,
        unregisterArticle,
      }}
    >
      <section
        ref={panelRef}
        className="flex h-full min-h-0 flex-col border-l border-border bg-background"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="shrink-0 text-sm font-semibold text-foreground">
            Debug
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* Slow-step threshold */}
            <label
              className="text-muted-foreground"
              title="Slow step threshold"
            >
              <div
                className={cn(
                  "flex h-7 w-32 items-center rounded-md border border-input bg-transparent shadow-xs dark:bg-input/30",
                  "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
                )}
              >
                <TurtleIcon
                  className="ml-2 size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={slowThresholdMs}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    setSlowThresholdMs(
                      Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
                    );
                  }}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-xs tabular-nums outline-none"
                  aria-label="Slow step threshold in milliseconds"
                />
                <span className="shrink-0 pr-2 text-[10px] text-muted-foreground">
                  ms
                </span>
              </div>
            </label>

            {/* Event type filter */}
            {typeSummaries.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={`Filter event types (${visibleTypeCount}/${typeSummaries.length} visible)`}
                    aria-label={`Filter event types (${visibleTypeCount}/${typeSummaries.length} visible)`}
                  >
                    <FilterIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="scrollbar-subtle max-h-64 w-56 overflow-y-auto border-slate-700 bg-slate-900 text-slate-100"
                >
                  <DropdownMenuItem
                    className="focus:bg-slate-800 focus:text-slate-100"
                    onSelect={(e) => {
                      e.preventDefault();
                      showAllTypes();
                    }}
                  >
                    Select all
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="focus:bg-slate-800 focus:text-slate-100"
                    onSelect={(e) => {
                      e.preventDefault();
                      hideAllTypes();
                    }}
                  >
                    Clear all
                  </DropdownMenuItem>
                  {typeSummaries.map(([type, count]) => {
                    const isVisible = !hiddenTypes.has(type);
                    return (
                      <DropdownMenuItem
                        key={type}
                        className="gap-2 focus:bg-slate-800 focus:text-slate-100"
                        onSelect={(e) => {
                          e.preventDefault();
                          toggleTypeFilter(type);
                        }}
                      >
                        <CheckIcon
                          className={cn(
                            "size-3.5 shrink-0",
                            isVisible ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="truncate uppercase">{type}</span>
                        <span className="ml-auto text-slate-400">{count}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {/* Live / snapshot toggle */}
            {onToggleLive ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onToggleLive}
                disabled={isLive && !hasSnapshot}
                title={
                  isLive
                    ? "Switch to message snapshot"
                    : "Switch to live stream"
                }
                aria-label={
                  isLive
                    ? "Switch to message snapshot"
                    : "Switch to live stream"
                }
                aria-pressed={isLive}
              >
                {isLive ? (
                  <RadioIcon className="size-4" />
                ) : (
                  <RadioOffIcon className="size-4" />
                )}
              </Button>
            ) : null}

            {/* Collapse / expand all articles */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleAllArticles}
              title={
                allArticlesOpen ? "Collapse all events" : "Expand all events"
              }
              aria-label={
                allArticlesOpen ? "Collapse all events" : "Expand all events"
              }
            >
              <ChevronDownIcon
                className={`size-4 transition-transform ${
                  allArticlesOpen ? "" : "-rotate-90"
                }`}
              />
            </Button>

            {/* Close */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              title="Close debug panel"
              aria-label="Close debug panel"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="scrollbar-subtle absolute inset-0 space-y-2 overflow-y-auto p-3"
          >
            {debugChunks.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No debug data.
              </div>
            ) : filteredChunks.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No events match the current filters.
              </div>
            ) : (
              filteredChunks.map((chunk, index) => {
                const articleId = debugArticleId(chunk, index);
                return (
                  <DebugEventArticle
                    key={`${viewKey}:${articleId}`}
                    articleId={articleId}
                    chunk={chunk}
                    onCopy={copyOne}
                    isSlow={(chunk._dt ?? 0) >= slowThresholdMs}
                    showRoutingLabel={showRoutingLabel}
                  />
                );
              })
            )}
          </div>
          {!stickToBottom && filteredChunks.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 border-slate-600 bg-slate-800 text-slate-100 shadow-md hover:bg-slate-700"
              onClick={jumpToLatest}
            >
              Jump to latest
            </Button>
          ) : null}
        </div>

        <footer className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isStreaming ? (
              <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            ) : null}
            <span>
              {filteredChunks.length === debugChunks.length
                ? `${debugChunks.length} events`
                : `${filteredChunks.length} of ${debugChunks.length} events`}
              {" · "}
              total {totalSec.toFixed(2)}s
              {slowCount > 0 ? (
                <span className="text-amber-500"> · {slowCount} slow</span>
              ) : null}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyAll()}
            title="Copy visible events JSON"
            disabled={filteredChunks.length === 0}
          >
            <CopyIcon className="size-4" />
            Copy all
          </Button>
        </footer>
      </section>
    </DebugArticlesContext.Provider>
  );
}
