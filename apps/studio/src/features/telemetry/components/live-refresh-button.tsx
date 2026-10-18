"use client";

import { useStudioRouteScope } from "@/components/studio-route-provider";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { LiveRefreshStatus } from "@/features/telemetry/lib/live-refresh-controller";
import { studioHelp } from "@/lib/studio-help";
import { cn } from "@/lib/utils";

const statusCopy: Record<LiveRefreshStatus, string> = {
  off: "Live updates are off.",
  connecting: "Connecting so new activity can appear here…",
  live: "Connected. New matching activity appears here automatically.",
  reconnecting:
    "The connection dropped. Studio will keep checking for updates while it reconnects.",
  paused: "Live updates are paused while this tab is hidden or offline.",
};

export function LiveRefreshButton({
  enabled,
  status,
  onToggle,
}: {
  enabled: boolean;
  status: LiveRefreshStatus;
  onToggle: () => void;
}) {
  const sample = useStudioRouteScope()?.sampleProject === true;
  const description = sample
    ? "Sample data is historical and does not receive live updates."
    : statusCopy[status];
  return (
    <InfoTooltip
      label="Live updates"
      documentationUrl={studioHelp.live.documentationUrl}
      side="bottom"
      triggerAction="preserve"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Live refresh: ${description}`}
          aria-pressed={!sample && enabled}
          disabled={sample}
          onClick={onToggle}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              status === "live" && "bg-emerald-500",
              (status === "connecting" || status === "reconnecting") &&
                "animate-pulse bg-amber-500",
              status === "paused" && "bg-amber-500/70",
              status === "off" && "bg-muted-foreground/50",
            )}
          />
          Live
        </Button>
      }
    >
      {description}
    </InfoTooltip>
  );
}
