import type { StudioTimeRange } from "@kortyx/telemetry-contracts";
import { PanelLeft, PanelRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TimeRangeFilter,
  type TimeRangeValue,
} from "@/features/telemetry/components/time-range-filter";
import { cn } from "@/lib/utils";
import {
  type WorkflowMetric,
  type WorkflowViewMode,
  workflowMetrics,
} from "../lib/view-state";
import type { WorkflowSummary } from "../schema";

const modeHelp: Record<WorkflowViewMode, string> = {
  system:
    "Show workflow structure, node activity, and connections between workflows.",
  health:
    "Highlight nodes using the selected operational metric and its attention threshold.",
};

const metricHelp: Record<WorkflowMetric, string> = {
  volume: "Emphasize nodes and connections with more recorded runs.",
  error: "Emphasize nodes whose error rate is above 3%.",
  latency: "Emphasize nodes whose p95 duration is above 2 seconds.",
  cost: "Show recorded average cost for each node.",
  interrupt: "Emphasize nodes whose interrupt rate is above 10%.",
};

type WorkflowToolbarProps = {
  mode: WorkflowViewMode;
  metric: WorkflowMetric;
  selectedWorkflow?: WorkflowSummary;
  refreshing: boolean;
  inspectorPanelOpen: boolean;
  catalogPanelOpen: boolean;
  onOpenCatalogPanel: () => void;
  range: StudioTimeRange;
  startedAfter: string;
  startedBefore: string;
  version: string;
  onModeChange: (mode: WorkflowViewMode) => void;
  onMetricChange: (metric: WorkflowMetric) => void;
  onTimeRangeChange: (value: TimeRangeValue) => void;
  onVersionChange: (version: string) => void;
  onRefresh: () => void;
  onOpenCatalog: () => void;
  onOpenInspector: () => void;
  onOpenInspectorPanel: () => void;
};

export function WorkflowToolbar({
  mode,
  metric,
  selectedWorkflow,
  refreshing,
  inspectorPanelOpen,
  catalogPanelOpen,
  onOpenCatalogPanel,
  range,
  startedAfter,
  startedBefore,
  version,
  onModeChange,
  onMetricChange,
  onTimeRangeChange,
  onVersionChange,
  onRefresh,
  onOpenCatalog,
  onOpenInspector,
  onOpenInspectorPanel,
}: WorkflowToolbarProps) {
  return (
    <header className="border-b bg-background px-4 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="md:hidden"
                aria-label="Open workflow catalog"
                onClick={onOpenCatalog}
              >
                <PanelLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open workflow catalog</TooltipContent>
          </Tooltip>
          {!catalogPanelOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden md:inline-flex"
                  aria-label="Expand workflow catalog"
                  onClick={onOpenCatalogPanel}
                >
                  <PanelLeft />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Expand workflow catalog</TooltipContent>
            </Tooltip>
          )}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
            <p className="text-xs text-muted-foreground">
              System topology and operational health
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <TimeRangeFilter
            compact
            range={range}
            startedAfter={startedAfter}
            startedBefore={startedBefore}
            onChange={onTimeRangeChange}
          />
          <select
            aria-label="Workflow version"
            className="hidden h-8 rounded-md border bg-background px-2 text-xs sm:block"
            value={version}
            onChange={(event) => onVersionChange(event.target.value)}
            disabled={!selectedWorkflow}
          >
            <option value="">All versions</option>
            {selectedWorkflow?.versions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
          <div className="flex rounded-md border p-0.5">
            {(["system", "health"] as const).map((item) => (
              <Tooltip key={item}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={mode === item}
                    onClick={() => onModeChange(item)}
                    className={cn(
                      "whitespace-nowrap rounded px-2 py-1 text-xs",
                      mode === item && "bg-accent font-medium",
                    )}
                  >
                    {item === "system" ? "System Map" : "Health"}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  {modeHelp[item]}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Refresh workflow metrics"
                onClick={onRefresh}
              >
                <RefreshCw className={cn(refreshing && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh metrics</TooltipContent>
          </Tooltip>
          {!inspectorPanelOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden lg:inline-flex"
                  aria-label="Open selected item panel"
                  onClick={onOpenInspectorPanel}
                >
                  <PanelRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open selected item panel</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="lg:hidden"
                aria-label="Open selected item panel"
                onClick={onOpenInspector}
              >
                <PanelRight />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open selected item panel</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {mode === "health" && (
        <div className="flex items-center gap-1 border-t py-2">
          <span className="mr-1 text-[11px] text-muted-foreground">
            Emphasis
          </span>
          {workflowMetrics.map((item) => (
            <Tooltip key={item}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={metric === item}
                  onClick={() => onMetricChange(item)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] capitalize",
                    metric === item
                      ? "bg-accent font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item === "error"
                    ? "Error rate"
                    : item === "interrupt"
                      ? "Interrupt rate"
                      : item}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                {metricHelp[item]}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </header>
  );
}
