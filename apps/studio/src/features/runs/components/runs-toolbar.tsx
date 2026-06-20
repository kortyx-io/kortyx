import { Filter, RefreshCw, Search, X } from "lucide-react";
import { DataTableColumnsMenu } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { useRunsQuery } from "@/features/runs/hooks/use-runs-query";
import { cn } from "@/lib/utils";

type RunsToolbarProps = {
  query: ReturnType<typeof useRunsQuery>;
  live: boolean;
  refreshing: boolean;
  filtersOpen: boolean;
  onToggleLive: () => void;
  onToggleFilters: () => void;
  onRefresh: () => void;
};

export function RunsToolbar({
  query,
  live,
  refreshing,
  filtersOpen,
  onToggleLive,
  onToggleFilters,
  onRefresh,
}: RunsToolbarProps) {
  const {
    query: search,
    activeFilterCount,
    hasActiveFilters,
    setParams,
    clearFilters,
  } = query;

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
          <Button
            variant={live ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleLive}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                live
                  ? "animate-pulse bg-emerald-500"
                  : "bg-muted-foreground/50",
              )}
            />
            Live
          </Button>
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
        <div className="relative min-w-[230px] flex-1">
          <Search className="pointer-events-none absolute top-2 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setParams({ q: event.target.value || null })}
            placeholder="Search runs, sessions, workflows, errors…"
            className="h-8 pl-9"
          />
        </div>
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
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X /> Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
