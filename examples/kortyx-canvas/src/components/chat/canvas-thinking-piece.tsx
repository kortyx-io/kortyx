"use client";

import type { ContentPiece } from "@kortyx/react";
import { Brain, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { listPatchPayloadEntries } from "@/lib/patch-record-key";
import { CANVAS_THINKING_DATA_TYPE } from "@/lib/protocol";
import type { DiscoveryCanvasResponse } from "@/schemas/discovery-canvas";

/**
 * Inline "thinking" tag that replaces the otherwise-invisible structured
 * `canvas.draft` / `canvas.patches` pieces in chat. While the structured
 * stream is in progress it shows a shimmering label; once `status:"done"`
 * lands it freezes into `"Thought for Xs"` and the chevron expands a
 * collapsible summary of what just happened on the canvas.
 *
 * Stays on a single visual line by design so it can be dropped between
 * normal text bubbles without breaking the flow of the conversation.
 */
export function DiscoveryCanvasThinkingPiece({
  piece,
}: {
  piece: ContentPiece;
}) {
  const meta = extractMeta(piece);
  const [isOpen, setIsOpen] = useState(false);
  // Tick every 500ms while streaming so the live counter updates. Using
  // wall-clock timestamps from the server (`startedAt`/`finishedAt`) means
  // elapsed time survives a re-mount when the piece moves from streaming
  // state into finalized message history.
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!meta || meta.status === "done") return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [meta]);

  if (!meta) return null;

  const isStreaming = meta.status !== "done";
  const elapsedMs = computeElapsedMs(meta);
  const elapsedSeconds = Math.max(0, Math.round(elapsedMs / 1000));

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="group inline-flex cursor-pointer items-center gap-2 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
        aria-expanded={isOpen}
      >
        <Brain className="size-4 shrink-0" strokeWidth={1.5} />
        {isStreaming ? (
          <span className="canvas-thinking-shimmer">
            {meta.label.streaming}
            {elapsedSeconds > 0
              ? ` · ${elapsedSeconds} ${elapsedSeconds === 1 ? "second" : "seconds"}`
              : ""}
          </span>
        ) : (
          <span>{meta.label.done(Math.max(1, elapsedSeconds))}</span>
        )}
        <ChevronDown
          className={`size-3.5 shrink-0 opacity-60 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          strokeWidth={1.5}
        />
      </button>

      {/*
       * Animated collapse using the grid-rows trick: the outer grid
       * transitions from `0fr` → `1fr`, and the inner `overflow-hidden`
       * div takes the resolved height. No magic numbers, no JS measuring.
       * `aria-hidden` keeps it out of AT focus when collapsed.
       */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!isOpen}
      >
        <div className="overflow-hidden">
          {/*
           * The brain icon is `size-4` (16px) so its center sits at 8px
           * from the parent's left edge. Padding the body by 7px and
           * drawing the 1px left border there lines the rule up directly
           * under the icon's vertical axis.
           */}
          <div className="mt-1.5 border-l border-border/60 pl-4 text-sm leading-relaxed text-muted-foreground ml-[7px]">
            <CollapsibleBody meta={meta} />
          </div>
        </div>
      </div>
    </div>
  );
}

type ThinkingKind = "create" | "update";

type ThinkingMeta = {
  kind: ThinkingKind;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
  label: {
    streaming: string;
    done: (seconds: number) => string;
  };
  data: unknown;
};

function computeElapsedMs(meta: ThinkingMeta): number {
  if (meta.startedAt === null) return 0;
  const end = meta.finishedAt ?? Date.now();
  return Math.max(0, end - meta.startedAt);
}

function extractMeta(piece: ContentPiece): ThinkingMeta | null {
  if (piece.type !== "structured") return null;
  if (piece.data.dataType !== CANVAS_THINKING_DATA_TYPE) return null;
  // The thinking marker stream is shaped as
  // `{ phase: "create" | "update", status: "streaming" | "done",
  //    startedAt: number, finishedAt?: number,
  //    patches?: DiscoveryCanvasPatch[], canvas?: DiscoveryCanvasResponse }`.
  // Timestamps live in the payload (set via `useStructuredData`) so elapsed
  // time is stable across re-mounts.
  const data = (piece.data.data ?? {}) as {
    phase?: string;
    status?: string;
    startedAt?: number;
    finishedAt?: number;
  };
  const phase = data.phase === "create" ? "create" : "update";
  const status = data.status === "done" ? "done" : "streaming";
  const startedAt = typeof data.startedAt === "number" ? data.startedAt : null;
  const finishedAt =
    typeof data.finishedAt === "number" ? data.finishedAt : null;
  const formatSeconds = (s: number) =>
    `Worked for ${s} ${s === 1 ? "second" : "seconds"}`;
  const label = {
    streaming: "Working",
    done: formatSeconds,
  };
  return {
    kind: phase,
    status,
    startedAt,
    finishedAt,
    label,
    data: piece.data.data,
  };
}

function CollapsibleBody({ meta }: { meta: ThinkingMeta }) {
  if (meta.kind === "create") {
    return <CreateDiscoveryCanvasSummary data={meta.data} />;
  }
  return <UpdatePatchesSummary data={meta.data} />;
}

function CreateDiscoveryCanvasSummary({ data }: { data: unknown }) {
  // The thinking-marker payload nests the final canvas under `data.canvas`
  // (see `emitDiscoveryCanvasThinkingFinish` in the server). Until the LLM call
  // resolves we just show a placeholder.
  const root = (data ?? {}) as { canvas?: Partial<DiscoveryCanvasResponse> };
  const canvas = root.canvas;
  const points = canvas?.sections ?? {};
  const entries = Object.entries(points);

  if (entries.length === 0 && !canvas?.intro?.item_text) {
    return <p className="opacity-70">Reasoning will appear once ready.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([key, section]) => (
        <li key={key}>
          <span className="text-foreground">
            {section?.section_label || key}
          </span>
          {section?.section_rationale ? (
            <span className="opacity-80"> — {section.section_rationale}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function UpdatePatchesSummary({ data }: { data: unknown }) {
  const reasons = extractPatchReasons(data);
  if (reasons.length === 0) {
    return (
      <p className="opacity-70">Reasoning will appear once the edits land.</p>
    );
  }
  if (reasons.length === 1) {
    return <p>{reasons[0]}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {reasons.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  );
}

function extractPatchReasons(raw: unknown): string[] {
  const entries = listPatchPayloadEntries(raw);
  const seen = new Set<string>();
  for (const { entry } of entries) {
    const reason = entry.reason;
    if (typeof reason === "string" && reason.trim().length > 0) {
      seen.add(reason);
    }
  }
  return Array.from(seen);
}
