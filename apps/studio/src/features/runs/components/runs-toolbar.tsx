import { ChevronDown, Filter, RefreshCw, Search, X } from "lucide-react";
import { DataTableColumnsMenu } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { useRunsQuery } from "@/features/runs/hooks/use-runs-query";
import {
  providers,
  statuses,
  statusMeta,
  timeRanges,
} from "@/features/runs/lib/constants";
import { cn } from "@/lib/utils";

type RunsToolbarProps = {
  query: ReturnType<typeof useRunsQuery>;
  live: boolean;
  refreshing: boolean;
  onToggleLive: () => void;
  onRefresh: () => void;
};

export function RunsToolbar({
  query,
  live,
  refreshing,
  onToggleLive,
  onRefresh,
}: RunsToolbarProps) {
  const {
    environment,
    timeRange,
    query: search,
    selectedStatuses,
    provider,
    toolOnly,
    minCost,
    minDuration,
    activeFilterCount,
    hasActiveFilters,
    filteredRuns,
    setParams,
    toggleStatus,
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
          <span className="rounded-full border bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {filteredRuns.length.toLocaleString()} matching
          </span>
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
        <select
          aria-label="Environment"
          value={environment}
          onChange={(event) =>
            setParams({
              env:
                event.target.value === "All environments"
                  ? null
                  : event.target.value,
            })
          }
          className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option>Development</option>
          <option>Staging</option>
          <option>Production</option>
          <option>All environments</option>
        </select>
        <select
          aria-label="Time range"
          value={timeRange}
          onChange={(event) =>
            setParams({
              range:
                event.target.value === "24 hours" ? null : event.target.value,
            })
          }
          className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
        >
          {timeRanges.map((range) => (
            <option key={range}>{range}</option>
          ))}
        </select>
        <div className="relative min-w-[230px] flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setParams({ q: event.target.value || null })}
            placeholder="Search runs, sessions, workflows, errors…"
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="default"
              className={cn(
                activeFilterCount > 0 && "border-foreground/30 bg-accent",
              )}
            >
              <Filter /> Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-foreground px-1.5 text-[10px] leading-4 text-background">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-2">
            <DropdownMenuLabel>Run status</DropdownMenuLabel>
            {statuses.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={selectedStatuses.includes(status)}
                onCheckedChange={() => toggleStatus(status)}
              >
                {statusMeta[status].label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Provider</DropdownMenuLabel>
            {providers.map((item) => (
              <DropdownMenuCheckboxItem
                key={item}
                checked={provider === item}
                onCheckedChange={() =>
                  setParams({ provider: provider === item ? null : item })
                }
              >
                {item}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={toolOnly}
              onCheckedChange={() =>
                setParams({ tool: toolOnly ? null : true })
              }
            >
              Has tool call
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Thresholds</DropdownMenuLabel>
            <div
              className="grid grid-cols-2 gap-2 px-2 py-1.5"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <label
                htmlFor="minimum-cost"
                className="text-xs text-muted-foreground"
              >
                Cost ≥
                <Input
                  id="minimum-cost"
                  type="number"
                  min="0"
                  step="0.001"
                  value={minCost || ""}
                  onChange={(event) =>
                    setParams({
                      minCost: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                  placeholder="$0.00"
                  className="mt-1 h-8 px-2 text-xs"
                />
              </label>
              <label
                htmlFor="minimum-duration"
                className="text-xs text-muted-foreground"
              >
                Duration ≥
                <Input
                  id="minimum-duration"
                  type="number"
                  min="0"
                  step="1"
                  value={minDuration || ""}
                  onChange={(event) =>
                    setParams({
                      minDuration: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                  placeholder="seconds"
                  className="mt-1 h-8 px-2 text-xs"
                />
              </label>
            </div>
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Search also covers workflow, node, session, user, tenant, model,
              and error text.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
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
