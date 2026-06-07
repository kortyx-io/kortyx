"use client";

import type { ContentPiece } from "@kortyx/react";
import { Sparkles } from "lucide-react";
import { pickBriefPreview } from "@/components/streaming/brief-preview";

/**
 * Read-only product brief card rendered inline in chat after the
 * `describeBrief` summary text streams.
 */
export function BriefPreviewPiece({ piece }: { piece: ContentPiece }) {
  const brief = pickBriefPreview(piece);
  if (!brief) return null;

  return (
    <article
      aria-label={brief.title || "Product brief"}
      className="max-w-[85%] rounded-xl border border-border bg-card transition-colors"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-4 py-3.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-sm font-semibold leading-snug text-foreground">
            {brief.title}
          </h3>
          {brief.companyName ? (
            <p className="text-xs text-muted-foreground">{brief.companyName}</p>
          ) : null}
        </div>
      </header>
      {brief.description ? (
        <p className="px-4 py-3.5 text-sm leading-relaxed text-muted-foreground">
          {brief.description}
        </p>
      ) : null}
    </article>
  );
}
