import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { useRunsQuery } from "@/features/runs/hooks/use-runs-query";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import type { LiveRefreshStatus } from "@/features/telemetry/lib/live-refresh-controller";
import { cn } from "@/lib/utils";

type RunsToolbarProps = {
  query: ReturnType<typeof useRunsQuery>;
  live: boolean;
  liveStatus: LiveRefreshStatus;
  refreshing: boolean;
  onToggleLive: () => void;
  onRefresh: () => void;
};

const _feedbackLabels = {
  "": "All feedback",
  positive: "Positive feedback",
  negative: "Negative feedback",
  unrated: "Unrated",
};

export function RunsToolbar({
  query,
  live,
  liveStatus,
  refreshing,
  onToggleLive,
  onRefresh,
}: RunsToolbarProps) {
  const { query: search, setParams } = query;

  return (
    <div className="z-20 shrink-0 border-b bg-background/95 px-5 pt-4 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Runs</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Operational inbox for every execution
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <LiveRefreshButton
            enabled={live}
            status={liveStatus}
            onToggle={onToggleLive}
          />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Refresh runs"
            onClick={onRefresh}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pb-3">
        <div className="relative min-w-0 basis-full flex-1 sm:basis-48">
          <Search className="pointer-events-none absolute top-2 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setParams({ q: event.target.value || null })}
            placeholder="Search runs, sessions, workflows, errors…"
            className="h-8 pl-9"
          />
        </div>
      </div>
    </div>
  );
}
