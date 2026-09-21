import { PanelLeftClose, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkflowHealth, WorkflowSystem } from "../schema";
import {
  WorkflowHealthIndicator,
  workflowHealthLabel,
} from "./workflow-status-indicator";

const healthFilterHelp: Record<WorkflowHealth | "all", string> = {
  all: "Show workflows in every health state.",
  unknown: "No runs were recorded in the selected period.",
  healthy: "Error rate is below 5% and interrupt rate is below 25%.",
  degraded: "Error rate is at least 5%, or interrupt rate is at least 25%.",
  failing: "Error rate is at least 20%.",
  idle: "Latest recorded activity is more than 7 days old.",
};

type WorkflowCatalogProps = {
  system: WorkflowSystem;
  workflows: WorkflowSystem["workflows"];
  query: string;
  health: WorkflowHealth | "all";
  selectedWorkflowId?: string;
  onQueryChange: (query: string) => void;
  onHealthChange: (health: WorkflowHealth | "all") => void;
  onSelectWorkflow: (id: string) => void;
  onClear: () => void;
  onCollapse: () => void;
};

export function WorkflowCatalog({
  system,
  workflows,
  query,
  health,
  selectedWorkflowId,
  onQueryChange,
  onHealthChange,
  onSelectWorkflow,
  onClear,
  onCollapse,
}: WorkflowCatalogProps) {
  return (
    <aside
      className="flex h-full min-h-0 w-[260px] flex-col border-r bg-background"
      aria-label="Workflow catalog"
    >
      <div className="border-b p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Workflow catalog</h2>
          <div className="flex items-center gap-1">
            <span className="text-xs tabular-nums text-muted-foreground">
              {workflows.length}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden md:inline-flex"
                  aria-label="Collapse workflow catalog"
                  onClick={onCollapse}
                >
                  <PanelLeftClose />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Collapse workflow catalog</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            aria-label="Search workflows"
            placeholder="Search workflows or tools…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {(
            [
              "all",
              "unknown",
              "healthy",
              "degraded",
              "failing",
              "idle",
            ] as const
          ).map((item) => (
            <Tooltip key={item}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={health === item}
                  onClick={() => onHealthChange(item)}
                  className={cn(
                    "rounded px-1.5 py-1 text-[11px] capitalize",
                    health === item
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                {healthFilterHelp[item]}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {workflows.length ? (
          <div className="py-1">
            {workflows.map((workflow) => {
              const inbound = system.transitions.filter(
                (edge) => edge.targetWorkflowId === workflow.id,
              ).length;
              const outbound = system.transitions.filter(
                (edge) => edge.sourceWorkflowId === workflow.id,
              ).length;
              return (
                <button
                  type="button"
                  key={workflow.id}
                  aria-pressed={selectedWorkflowId === workflow.id}
                  title={workflow.name}
                  onClick={() => onSelectWorkflow(workflow.id)}
                  className={cn(
                    "w-full border-b px-3 py-3 text-left transition-colors hover:bg-accent/60",
                    selectedWorkflowId === workflow.id && "bg-accent",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <WorkflowHealthIndicator
                      health={workflow.health}
                      focusable={false}
                    />
                    <span className="sr-only">
                      {workflowHealthLabel(workflow.health)}.
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
                      {workflow.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {workflow.activeVersion}
                    </span>
                  </div>
                  <p className="mt-1 truncate pl-3.5 text-[11px] text-muted-foreground">
                    {workflow.description}
                  </p>
                  <div className="mt-2 flex items-center justify-between pl-3.5 text-[10px] tabular-nums text-muted-foreground">
                    <span>
                      {formatCount(workflow.metrics.runCount)} runs ·{" "}
                      {
                        new Set(
                          workflow.nodes.flatMap((node) =>
                            (node.tools ?? []).map((tool) => tool.name),
                          ),
                        ).size
                      }{" "}
                      tools
                    </span>
                    <span
                      title={`${inbound} incoming, ${outbound} outgoing connections`}
                    >
                      ←{inbound} · {outbound}→
                    </span>
                    <span>{workflow.lastActivityAt}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No workflows match these filters.
            <button
              type="button"
              className="ml-1 text-primary hover:underline"
              onClick={onClear}
            >
              Clear
            </button>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
