import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LiveRefreshStatus } from "@/features/telemetry/lib/live-refresh-controller";
import { cn } from "@/lib/utils";

const statusCopy: Record<LiveRefreshStatus, string> = {
  off: "Live updates are off.",
  connecting: "Connecting to the live update stream…",
  live: "Connected. This view refreshes when matching telemetry changes.",
  reconnecting:
    "Connection interrupted. Reconnecting with periodic refresh as a fallback.",
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
  const description = statusCopy[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={enabled ? "secondary" : "ghost"}
          size="sm"
          aria-label={`Live refresh: ${description}`}
          aria-pressed={enabled}
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
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {description}
      </TooltipContent>
    </Tooltip>
  );
}
