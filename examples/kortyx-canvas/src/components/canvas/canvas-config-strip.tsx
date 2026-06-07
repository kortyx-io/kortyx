"use client";

import { Presentation, UsersRound } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useDiscoveryCanvasStore } from "@/hooks/use-canvas-store";
import { useFacilitatorStyles } from "@/hooks/use-facilitator-styles";
import type { CanvasMode } from "@/schemas/discovery-canvas";
import FacilitatorStylePicker from "./facilitator-style-picker";

/**
 * Configuration controls shown beneath the canvas title.
 */
export function DiscoveryCanvasConfigStrip() {
  const facilitatorStyles = useFacilitatorStyles();
  const { draft, updateFacilitatorStyleId, updateCanvasMode } =
    useDiscoveryCanvasStore();
  const facilitatorStyleId = draft.facilitator_style_id ?? undefined;
  const mode: CanvasMode = draft.canvas_mode ?? "DISCOVERY_WORKSHOP";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/80 px-5 py-4 backdrop-blur transition-colors hover:border-primary/40 sm:flex-row sm:items-end">
      <div className="flex-1 min-w-0">
        {facilitatorStyles.length === 0 ? (
          <FacilitatorStylesEmptyState />
        ) : (
          <FacilitatorStylePicker
            value={facilitatorStyleId}
            onValueChange={(next) => updateFacilitatorStyleId(next ?? null)}
            facilitatorStyles={facilitatorStyles}
          />
        )}
      </div>
      <div className="sm:max-w-[260px] flex-1">
        <CanvasModeToggle
          value={mode}
          onChange={(next) => updateCanvasMode(next)}
        />
      </div>
    </div>
  );
}

function FacilitatorStylesEmptyState() {
  return (
    <div className="flex flex-col">
      <Label className="text-xs text-muted-foreground mb-2">
        Facilitator style
      </Label>
      <div className="flex h-10 items-center rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground">
        No facilitator styles available
      </div>
    </div>
  );
}

function CanvasModeToggle({
  value,
  onChange,
}: {
  value: CanvasMode;
  onChange: (next: CanvasMode) => void;
}) {
  return (
    <div className="flex flex-col">
      <Label className="text-xs text-muted-foreground mb-2">Canvas mode</Label>
      <div className="grid grid-cols-2 rounded-md border border-input p-0.5">
        <ModeButton
          active={value === "DISCOVERY_WORKSHOP"}
          onClick={() => onChange("DISCOVERY_WORKSHOP")}
          icon={<UsersRound className="size-4" />}
          label="Workshop"
        />
        <ModeButton
          active={value === "EXECUTIVE_BRIEF"}
          onClick={() => onChange("EXECUTIVE_BRIEF")}
          icon={<Presentation className="size-4" />}
          label="Brief"
        />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-sm px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
