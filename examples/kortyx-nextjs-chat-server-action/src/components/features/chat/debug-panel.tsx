"use client";

import type { StreamChunk } from "kortyx";
import { CopyIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import { Button } from "@/components/ui/button";

function HighlightedJSON({ data }: { data: StreamChunk }) {
  const [highlightedCode, setHighlightedCode] = useState<string>("");

  useEffect(() => {
    const highlightCode = async () => {
      try {
        const html = await codeToHtml(JSON.stringify(data, null, 2), {
          lang: "json",
          theme: "one-dark-pro",
        });
        setHighlightedCode(html);
      } catch (error) {
        console.error("Failed to highlight code:", error);
        setHighlightedCode(`<pre>${JSON.stringify(data, null, 2)}</pre>`);
      }
    };

    highlightCode();
  }, [data]);

  if (!highlightedCode) {
    return (
      <pre className="text-xs leading-relaxed text-slate-100 whitespace-pre-wrap break-words overflow-wrap-anywhere p-4 m-0">
        {JSON.stringify(data, null, 2)}
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

type DebugChunk = StreamChunk & { _ts?: number; _dt?: number };

export function DebugPanel({
  chunks,
  onClose,
}: {
  chunks: DebugChunk[];
  onClose?: () => void;
}) {
  const firstTs = (chunks.find((c) => c._ts !== undefined)?._ts ?? null) as
    | number
    | null;
  const lastTs = (chunks
    .slice()
    .reverse()
    .find((c) => c._ts !== undefined)?._ts ?? null) as number | null;
  const totalMs = firstTs && lastTs ? Math.max(0, lastTs - firstTs) : 0;
  const totalSec = totalMs / 1000;

  const chunkKey = (c: DebugChunk) => {
    if (typeof (c as DebugChunk & { _seq?: number })._seq === "number") {
      return `seq:${(c as DebugChunk & { _seq?: number })._seq}`;
    }
    if (typeof c._ts === "number") return `ts:${c._ts}:${c.type}`;
    try {
      return `json:${JSON.stringify(c)}`;
    } catch {
      return `type:${c.type}`;
    }
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(chunks, null, 2));
    } catch (e) {
      console.error("copy all failed", e);
    }
  };

  const copyOne = async (c: StreamChunk) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(c, null, 2));
    } catch (e) {
      console.error("copy chunk failed", e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="font-semibold text-slate-800 dark:text-slate-100">
          Debug
        </div>
        <button
          type="button"
          className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          onClick={onClose}
          title="Close"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {chunks.length === 0 ? (
          <div className="text-sm text-slate-500">No debug data.</div>
        ) : (
          chunks.map((c) => {
            const ts = c._ts as number | undefined;
            const dt = c._dt as number | undefined;
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
                key={chunkKey(c)}
                className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-900"
              >
                <div className="flex items-center justify-between px-3 py-1 text-[11px] text-slate-300 bg-slate-800/80 border-b border-slate-700">
                  <div className="font-mono">{clock}</div>
                  <div className="uppercase tracking-wide text-slate-400">
                    {c.type}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-slate-400">+{dt ?? 0}ms</div>
                    <button
                      type="button"
                      className="text-slate-300 hover:text-white"
                      title="Copy this event"
                      onClick={() => copyOne(c)}
                    >
                      <CopyIcon className="size-3.5" />
                    </button>
                  </div>
                </div>
                <HighlightedJSON data={c} />
              </div>
            );
          })
        )}
      </div>

      {/* Summary + Copy all */}
      <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
        <div className="text-xs text-slate-600 dark:text-slate-300">
          {chunks.length} events • total {totalSec.toFixed(2)}s
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
    </div>
  );
}
