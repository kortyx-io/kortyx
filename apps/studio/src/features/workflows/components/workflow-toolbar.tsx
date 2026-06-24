import { PanelLeft, PanelRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  type WorkflowMetric,
  type WorkflowViewMode,
  workflowMetrics,
} from "../lib/view-state";
import type { WorkflowSummary } from "../schema";

type WorkflowToolbarProps = {
  mode: WorkflowViewMode;
  metric: WorkflowMetric;
  selectedWorkflow?: WorkflowSummary;
  refreshing: boolean;
  inspectorPanelOpen: boolean;
  onModeChange: (mode: WorkflowViewMode) => void;
  onMetricChange: (metric: WorkflowMetric) => void;
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
  onModeChange,
  onMetricChange,
  onRefresh,
  onOpenCatalog,
  onOpenInspector,
  onOpenInspectorPanel,
}: WorkflowToolbarProps) {
  return (
    <header className="border-b bg-background px-4 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Open workflow catalog"
            onClick={onOpenCatalog}
          >
            <PanelLeft />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
            <p className="text-xs text-muted-foreground">
              System topology and operational health
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Time range"
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option>24h</option>
            <option>1h</option>
            <option>7d</option>
            <option>30d</option>
            <option>Custom</option>
          </select>
          <select
            aria-label="Workflow version"
            className="hidden h-8 rounded-md border bg-background px-2 text-xs sm:block"
            value={selectedWorkflow?.activeVersion ?? ""}
            onChange={() => undefined}
          >
            {selectedWorkflow?.versions.map((version) => (
              <option key={version}>{version}</option>
            ))}
          </select>
          <div className="flex rounded-md border p-0.5">
            {(["system", "health"] as const).map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => onModeChange(item)}
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  mode === item && "bg-accent font-medium",
                )}
              >
                {item === "system" ? "System Map" : "Health"}
              </button>
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
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden lg:inline-flex"
              aria-label="Open selected item panel"
              onClick={onOpenInspectorPanel}
            >
              <PanelRight />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label="Open selected item panel"
            onClick={onOpenInspector}
          >
            <PanelRight />
          </Button>
        </div>
      </div>
      {mode === "health" && (
        <div className="flex items-center gap-1 border-t py-2">
          <span className="mr-1 text-[11px] text-muted-foreground">
            Emphasis
          </span>
          {workflowMetrics.map((item) => (
            <button
              type="button"
              key={item}
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
          ))}
        </div>
      )}
    </header>
  );
}
