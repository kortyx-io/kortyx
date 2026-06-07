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
      className="relative rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </div>
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

      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Lightbulb className="size-3.5" />
          Brief
        </div>
        <ul className="flex flex-col gap-3">
          <li className="relative rounded-lg border border-border/70 bg-background px-3 py-2.5 transition-colors hover:border-primary/40">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="inline-flex size-4 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                1
              </span>
              Brief
            </div>
            <EditableText
              value={item}
              onCommit={(next) => updateIntro({ item_text: next })}
              variant="body"
              multiline
              placeholder="Product brief will appear here once the canvas is drafted."
              ariaLabel="product brief text"
            />
          </li>
        </ul>
      </div>
    </article>
  );
}
