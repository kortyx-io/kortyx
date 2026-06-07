"use client";

import { HelpCircle } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { EditableText } from "./editable-text";

type Props = {
  /** Heading rendered inside the popover (e.g. "Why this matters"). */
  label: string;
  /** Current rationale text. */
  value: string;
  /** Commit handler. */
  onCommit: (next: string) => void;
  /** aria-label for the popover trigger. */
  ariaLabel: string;
  /** Placement of the popover relative to the trigger. */
  side?: "top" | "right" | "bottom" | "left";
};

/**
 * Hover-to-reveal hint: a item-mark icon that opens an editable rationale
 * panel on delayed hover. Uses HoverCard (not Tooltip) so the panel stays
 * open while the cursor is inside it — the rationale is editable inline.
 */
export function RationaleHint({
  label,
  value,
  onCommit,
  ariaLabel,
  side = "top",
}: Props) {
  const isEmpty = value.trim().length === 0;

  return (
    <HoverCard openDelay={250} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={`inline-flex size-7 shrink-0 items-center justify-center rounded transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isEmpty
              ? "text-muted-foreground/60 hover:text-muted-foreground"
              : "text-primary/70 hover:text-primary"
          }`}
        >
          <HelpCircle className="size-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side={side} align="start" className="w-80 p-3">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <EditableText
          value={value}
          onCommit={onCommit}
          variant="small"
          multiline
          placeholder="Add a rationale"
          ariaLabel={ariaLabel}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
