import { RefreshCw } from "lucide-react";
import { TablePageHeader } from "@/components/data-table/table-page-header";
import { Button } from "@/components/ui/button";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import type { LiveRefreshStatus } from "@/features/telemetry/lib/live-refresh-controller";
import { studioHelp } from "@/lib/studio-help";
import { cn } from "@/lib/utils";

type ListToolbarProps = {
  title: string;
  subtitle: string;
  refreshing: boolean;
  live?: boolean;
  liveStatus?: LiveRefreshStatus;
  onRefresh: () => void;
  onToggleLive?: () => void;
};

/** Shared header treatment for the operational table routes. */
export function ListToolbar({
  title,
  subtitle,
  refreshing,
  live,
  liveStatus = live ? "connecting" : "off",
  onRefresh,
  onToggleLive,
}: ListToolbarProps) {
  return (
    <TablePageHeader
      title={title}
      help={
        title === "Runs"
          ? studioHelp.runs
          : title === "Sessions"
            ? studioHelp.sessions
            : studioHelp.interrupts
      }
      description={subtitle}
      actions={
        <>
          {onToggleLive && (
            <LiveRefreshButton
              enabled={Boolean(live)}
              status={liveStatus}
              onToggle={onToggleLive}
            />
          )}
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label={`Refresh ${title.toLowerCase()}`}
            onClick={onRefresh}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        </>
      }
    />
  );
}
