"use client";

import { Lightbulb, Sparkles } from "lucide-react";
import { useDiscoveryCanvasStore } from "@/hooks/use-canvas-store";
import { EditableText } from "./editable-text";

/**
 * Product brief card. Visually mirrors `SectionCard` so the canvas reads
 * as a single uniform flow. The brief cannot be deleted because it anchors
 * the rest of the discovery board.
 */
export function BriefCard() {
  const { draft, updateIntro } = useDiscoveryCanvasStore();
  const label = draft.intro?.label ?? "";
  const summary = draft.intro?.summary ?? "";
  const item = draft.intro?.item_text ?? "";

  return (
    <article
      aria-label={label || "Product brief"}
      className="relative grid min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:border-amber-600/40 md:grid-cols-[132px_minmax(0,1fr)]"
    >
      <aside className="flex items-center gap-3 border-b border-border/60 bg-amber-500/10 px-4 py-3 text-amber-800 md:flex-col md:items-start md:border-b-0 md:border-r md:px-4 md:py-4 dark:text-amber-300">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background shadow-sm ring-1 ring-amber-500/20">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Anchor
          </p>
          <p className="truncate text-xs font-medium text-foreground md:whitespace-normal">
            Product brief
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-start gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <EditableText
              value={label}
              onCommit={(next) => updateIntro({ label: next })}
              variant="title"
              placeholder="Product brief"
              ariaLabel="product brief title"
            />
            <EditableText
              value={summary}
              onCommit={(next) => updateIntro({ summary: next })}
              variant="small"
              multiline
              placeholder="Captures the product idea, target user, and discovery goal."
              ariaLabel="product brief description"
            />
          </div>
        </header>

        <div className="px-4 py-3 sm:px-5">
          <div className="grid min-w-0 gap-2 rounded-md border border-border/70 bg-background px-3 py-2.5 sm:grid-cols-[28px_minmax(0,1fr)] sm:items-start">
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Lightbulb className="size-3.5" />
            </span>
            <EditableText
              value={item}
              onCommit={(next) => updateIntro({ item_text: next })}
              variant="body"
              multiline
              placeholder="Product brief will appear here once the canvas is drafted."
              ariaLabel="product brief text"
            />
          </div>
        </div>
      </div>
    </article>
  );
}
