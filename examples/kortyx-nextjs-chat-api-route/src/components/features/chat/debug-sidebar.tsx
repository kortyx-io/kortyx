"use client";

import type { StreamChunk } from "kortyx";
import { CopyIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";

function HighlightedJSON({ data }: { data: StreamChunk }) {
  const [highlightedCode, setHighlightedCode] = useState<string>("");

  // Strip internal metadata fields
  const cleanData = useMemo(() => {
    const clean = { ...data };
    delete (clean as Record<string, unknown>)._ts;
    delete (clean as Record<string, unknown>)._dt;
    delete (clean as Record<string, unknown>)._seq;
    return clean;
  }, [data]);

  useEffect(() => {
    const highlightCode = async () => {
      try {
        const html = await codeToHtml(JSON.stringify(cleanData, null, 2), {
          lang: "json",
          theme: "one-dark-pro",
        });
        setHighlightedCode(html);
      } catch (error) {
        console.error("Failed to highlight code:", error);
        setHighlightedCode(`<pre>${JSON.stringify(cleanData, null, 2)}</pre>`);
      }
    };

    highlightCode();
  }, [cleanData]);

  if (!highlightedCode) {
    return (
      <pre className="text-xs leading-relaxed text-slate-100 whitespace-pre-wrap break-words overflow-wrap-anywhere p-4 m-0">
        {JSON.stringify(cleanData, null, 2)}
      </pre>
    );
  }

  return (
    <div
      className="text-xs [&_pre]:!m-0 [&_pre]:!p-4 [&_pre]:!bg-transparent [&_pre]:!whitespace-pre-wrap [&_pre]:!break-words [&_pre]:!overflow-wrap-anywhere"
      dangerouslySetInnerHTML={{ __html: highlightedCode }}
    />
  );
}

export function DebugSidebar({
  chunks,
  isStreaming,
  onClose,
}: {
  chunks: StreamChunk[];
  isStreaming?: boolean;
  onClose: () => void;
}) {
  const chunkKey = (c: StreamChunk) => {
    const rec = c as Record<string, unknown>;
    const seq = rec._seq;
    if (typeof seq === "number") return `seq:${seq}`;
    const ts = rec._ts;
    if (typeof ts === "number") return `ts:${ts}:${String(rec.type)}`;
    try {
      return `json:${JSON.stringify(c)}`;
    } catch {
      return `type:${String(rec.type)}`;
    }
  };

  const firstTs =
    ((
      chunks.find((c) => c && (c as Record<string, unknown>)._ts) as
        | Record<string, unknown>
        | undefined
    )?._ts as number | undefined) ?? null;
  const lastTs =
    ((
      chunks
        .slice()
        .reverse()
        .find((c) => c && (c as Record<string, unknown>)._ts) as
        | Record<string, unknown>
        | undefined
    )?._ts as number | undefined) ?? null;
  const totalMs = firstTs && lastTs ? Math.max(0, lastTs - firstTs) : 0;
  const totalSec = totalMs / 1000;

  const copyAll = async () => {
    try {
      const cleanChunks = chunks.map((c) => {
        const clean = { ...c };
        delete (clean as Record<string, unknown>)._ts;
        delete (clean as Record<string, unknown>)._dt;
        delete (clean as Record<string, unknown>)._seq;
        return clean;
      });
      await navigator.clipboard.writeText(JSON.stringify(cleanChunks, null, 2));
    } catch (e) {
      console.error("copy all failed", e);
    }
  };

  const copyOne = async (c: StreamChunk) => {
    try {
      const cleanChunk = { ...c };
      delete (cleanChunk as Record<string, unknown>)._ts;
      delete (cleanChunk as Record<string, unknown>)._dt;
      delete (cleanChunk as Record<string, unknown>)._seq;
      await navigator.clipboard.writeText(JSON.stringify(cleanChunk, null, 2));
    } catch (e) {
      console.error("copy chunk failed", e);
    }
  };

  return (
    <Sidebar
      side="right"
      className="border-l border-slate-200 dark:border-slate-800"
    >
      <SidebarHeader className="border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="font-semibold text-sidebar-foreground">Debug</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            title="Close debug panel"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <div className="p-3 space-y-2">
          {chunks.length === 0 ? (
            <div className="text-sm text-slate-500">No debug data.</div>
          ) : (
            chunks.map((c, idx) => {
              const ts = (c as Record<string, unknown>)._ts as
                | number
                | undefined;
              const dt = (c as Record<string, unknown>)._dt as
                | number
                | undefined;
              const date = ts ? new Date(ts) : null;
              const ms = ts ? String(ts % 1000).padStart(3, "0") : "";
              const clock = date
                ? `${date.toLocaleTimeString([], {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}.${ms}`
                : "";
              return (
                <div
                  key={`${chunkKey(c)}:${idx}`}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-900"
                >
                  <div className="flex items-center justify-between px-3 py-1 text-[11px] text-slate-300 bg-slate-800/80 border-b border-slate-700">
                    <div className="flex items-center gap-4">
                      <div className="uppercase tracking-wide text-slate-400">
                        {(c as Record<string, unknown>).type as string}
                      </div>
                      <div className="font-mono">{clock}</div>
                      <div className="font-mono text-slate-400">
                        +{dt ?? 0}ms
                      </div>
                    </div>
                    <Button
                      className="p-0"
                      title="Copy this event"
                      onClick={() => copyOne(c)}
                      variant="ghost"
                    >
                      <CopyIcon className="size-3.5" />
                    </Button>
                  </div>
                  <HighlightedJSON data={c} />
                </div>
              );
            })
          )}
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t border-slate-200 dark:border-slate-800">
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="text-xs text-sidebar-foreground/70 flex items-center gap-2">
            {isStreaming && (
              <div className="animate-spin size-3 border-2 border-sidebar-foreground/30 border-t-sidebar-foreground/70 rounded-full" />
            )}
            <span>
              {chunks.length} events • total {totalSec.toFixed(2)}s
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copyAll}
            title="Copy all events JSON"
          >
            <CopyIcon className="size-4" />
            <span className="ml-1">Copy all</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
