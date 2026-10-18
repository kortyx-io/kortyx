import type { StudioTimeRange } from "@kortyx/telemetry-contracts";
import { PanelLeft, PanelRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpCircle, InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TimeRangeFilter,
  type TimeRangeValue,
} from "@/features/telemetry/components/time-range-filter";
import { studioHelp } from "@/lib/studio-help";
import { cn } from "@/lib/utils";
import {
  type WorkflowMetric,
  type WorkflowViewMode,
  workflowMetrics,
} from "../lib/view-state";
import type { WorkflowSummary } from "../schema";

const modeHelp: Record<WorkflowViewMode, string> = {
  system: "Show workflow steps and the connections between workflows.",
  health:
    "Highlight steps that may need attention based on the selected metric.",
};

const metricHelp: Record<WorkflowMetric, string> = {
  volume: "Highlight steps and connections with more recorded runs.",
  error: "Highlight steps where more than 3% of runs failed.",
  latency:
    "Highlight steps where the p95 time is above 2 seconds. This is the time that 95 out of 100 runs finished within.",
  cost: "Show recorded average cost for each node.",
  interrupt: "Highlight steps where more than 10% of runs paused for input.",
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
    <header
      data-tour-surface="workflow-toolbar"
      className="border-b bg-background px-4 pt-3"
    >
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
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight">
                Workflows
              </h1>
              <HelpCircle help={studioHelp.workflows} />
            </div>
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
          <Select
            value={version || "__all__"}
            onValueChange={(value) =>
              onVersionChange(value === "__all__" ? "" : value)
            }
            disabled={!selectedWorkflow}
          >
            <SelectTrigger
              size="sm"
              aria-label="Workflow version"
              className="hidden text-xs sm:flex"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All versions</SelectItem>
              {selectedWorkflow?.versions.map((version) => (
                <SelectItem key={version} value={version}>
                  {version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border p-0.5">
            {(["system", "health"] as const).map((item) => (
              <InfoTooltip
                key={item}
                label={item === "system" ? "System Map" : "Health view"}
                documentationUrl={studioHelp.workflows.documentationUrl}
                triggerAction="preserve"
                trigger={
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
                }
              >
                {modeHelp[item]}
              </InfoTooltip>
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
            <InfoTooltip
              key={item}
              label={
                item === "error"
                  ? "Error rate"
                  : item === "interrupt"
                    ? "Interrupt rate"
                    : item
              }
              documentationUrl={studioHelp.workflowHealth.documentationUrl}
              triggerAction="preserve"
              trigger={
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
              }
            >
              {metricHelp[item]}
            </InfoTooltip>
          ))}
        </div>
      )}
    </header>
  );
}
