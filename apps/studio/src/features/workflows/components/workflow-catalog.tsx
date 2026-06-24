import { Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatCount } from "../lib/format";
import type { WorkflowHealth, WorkflowSystem } from "../schema";

const healthClasses: Record<WorkflowHealth, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  failing: "bg-red-500",
  idle: "bg-slate-400",
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
}: WorkflowCatalogProps) {
  return (
    <aside
      className="flex h-full min-h-0 w-[260px] flex-col border-r bg-background"
      aria-label="Workflow catalog"
    >
      <div className="border-b p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Workflow catalog</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {workflows.length}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search workflows…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="mt-2 flex items-center gap-1 overflow-x-auto">
          <Filter className="size-3.5 text-muted-foreground" />
          {(["all", "healthy", "degraded", "failing", "idle"] as const).map(
            (item) => (
              <button
                type="button"
                key={item}
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
            ),
          )}
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
                  onClick={() => onSelectWorkflow(workflow.id)}
                  className={cn(
                    "w-full border-b px-3 py-3 text-left transition-colors hover:bg-accent/60",
                    selectedWorkflowId === workflow.id && "bg-accent",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        healthClasses[workflow.health],
                      )}
                    />
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
                    <span>{formatCount(workflow.metrics.runCount)} runs</span>
                    <span>
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
