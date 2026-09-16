import { Filter, RefreshCw, Search } from "lucide-react";
import { DataTableColumnsMenu } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RunsViewsMenu } from "@/features/runs/components/runs-views-menu";
import type { useRunsQuery } from "@/features/runs/hooks/use-runs-query";
import type { RunsSavedView } from "@/features/runs/lib/saved-views";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import type { LiveRefreshStatus } from "@/features/telemetry/lib/live-refresh-controller";
import { cn } from "@/lib/utils";

type RunsToolbarProps = {
  query: ReturnType<typeof useRunsQuery>;
  live: boolean;
  liveStatus: LiveRefreshStatus;
  refreshing: boolean;
  filtersOpen: boolean;
  views: RunsSavedView[];
  onToggleLive: () => void;
  onToggleFilters: () => void;
  onRefresh: () => void;
  onViewsChange: (views: RunsSavedView[]) => void;
};

export function RunsToolbar({
  query,
  live,
  liveStatus,
  refreshing,
  filtersOpen,
  views,
  onToggleLive,
  onToggleFilters,
  onRefresh,
  onViewsChange,
}: RunsToolbarProps) {
  const { query: search, activeFilterCount, setParams } = query;

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
        <label className="sr-only" htmlFor="runs-feedback-filter">
          User feedback
        </label>
        <select
          id="runs-feedback-filter"
          aria-label="User feedback"
          className="h-8 max-w-full rounded-md border bg-background px-2 text-xs"
          value={query.feedback}
          onChange={(event) =>
            setParams({
              feedback: (event.target.value as typeof query.feedback) || null,
            })
          }
        >
          <option value="">All feedback</option>
          <option value="positive">Positive feedback</option>
          <option value="negative">Negative feedback</option>
          <option value="unrated">Unrated</option>
        </select>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Filters"
              aria-expanded={filtersOpen}
              onClick={onToggleFilters}
              className={cn(
                "relative",
                (filtersOpen || activeFilterCount > 0) &&
                  "border-foreground/30 bg-accent",
              )}
            >
              <Filter />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 rounded-full bg-foreground px-1.5 text-[10px] leading-4 text-background">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>
            Filters
          </TooltipContent>
        </Tooltip>
        <DataTableColumnsMenu />
        <RunsViewsMenu
          query={query}
          views={views}
          onViewsChange={onViewsChange}
        />
      </div>
    </div>
  );
}
