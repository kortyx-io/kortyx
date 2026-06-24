import { X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatCost, formatCount, formatDuration } from "../lib/format";
import type { WorkflowSelection } from "../lib/view-state";
import type { WorkflowHealth, WorkflowSystem } from "../schema";

const healthClasses: Record<WorkflowHealth, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  failing: "bg-red-500",
  idle: "bg-slate-400",
};

type WorkflowInspectorProps = {
  system: WorkflowSystem;
  selection: WorkflowSelection;
  onClose: () => void;
  onSelect: (selection: WorkflowSelection) => void;
};

export function WorkflowInspector({
  system,
  selection,
  onClose,
  onSelect,
}: WorkflowInspectorProps) {
  const selectedWorkflowId =
    selection.type === "workflow"
      ? selection.id
      : selection.type === "node"
        ? selection.workflowId
        : undefined;
  const selectedWorkflow = selectedWorkflowId
    ? system.workflows.find((item) => item.id === selectedWorkflowId)
    : undefined;
  const selectedNode =
    selection.type === "node"
      ? selectedWorkflow?.nodes.find((node) => node.id === selection.id)
      : undefined;
  const selectedTransition =
    selection.type === "transition"
      ? system.transitions.find((item) => item.id === selection.id)
      : undefined;
  const runHref =
    selection.type === "transition" && selectedTransition
      ? `/runs?workflow=${selectedTransition.sourceWorkflowId}&transition=${selectedTransition.id}`
      : selection.type === "node" && selectedNode
        ? `/runs?workflow=${selection.workflowId}&path=${selectedNode.id}`
        : selectedWorkflow
          ? `/runs?workflow=${selectedWorkflow.id}&version=${selectedWorkflow.activeVersion}`
          : "/runs";
  const title =
    selection.type === "transition"
      ? "Transition"
      : selection.type === "node"
        ? selectedNode?.label
        : selectedWorkflow?.name;

  return (
    <aside
      className="flex h-full min-h-0 w-[320px] flex-col border-l bg-background"
      aria-label="Selection inspector"
    >
      <div className="flex h-12 items-center justify-between border-b px-4">
        <h2 className="text-sm font-semibold">Selected item</h2>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close selected item panel"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          {title ? (
            <>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-mono text-sm font-semibold">{title}</h3>
                  {selectedWorkflow && (
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        healthClasses[selectedWorkflow.health],
                      )}
                    />
                  )}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {selection.type === "transition"
                    ? selectedTransition?.intent
                    : selection.type === "node"
                      ? `${selectedWorkflow?.name} · ${selectedNode?.type ?? "node"}`
                      : selectedWorkflow?.description}
                </p>
              </div>
              {selection.type === "transition" && selectedTransition ? (
                <MetricList
                  items={[
                    [
                      "Source",
                      `${selectedTransition.sourceWorkflowId}${selectedTransition.sourceNodeId ? ` / ${selectedTransition.sourceNodeId}` : ""}`,
                    ],
                    ["Target", selectedTransition.targetWorkflowId],
                    ["Condition", selectedTransition.condition ?? "—"],
                    ["Handoffs", formatCount(selectedTransition.volume)],
                    [
                      "Success after handoff",
                      `${selectedTransition.successRate ?? "—"}%`,
                    ],
                    [
                      "Median transition",
                      formatDuration(selectedTransition.medianDurationMs),
                    ],
                  ]}
                />
              ) : selection.type === "node" && selectedNode ? (
                <MetricList
                  items={[
                    [
                      "Provider",
                      `${selectedNode.provider ?? "Internal"}${selectedNode.model ? ` / ${selectedNode.model}` : ""}`,
                    ],
                    ["Runs", formatCount(selectedNode.metrics.runCount)],
                    [
                      "Success / error",
                      `${selectedNode.metrics.successRate ?? "—"}% / ${selectedNode.metrics.errorRate ?? "—"}%`,
                    ],
                    [
                      "p50 / p95",
                      `${formatDuration(selectedNode.metrics.p50DurationMs)} / ${formatDuration(selectedNode.metrics.p95DurationMs)}`,
                    ],
                    [
                      "Retries / interrupts",
                      `${selectedNode.metrics.retryCount ?? 0} / ${selectedNode.metrics.interruptRate ?? 0}%`,
                    ],
                    [
                      "Cost / run",
                      formatCost(selectedNode.metrics.averageCost),
                    ],
                  ]}
                />
              ) : selectedWorkflow ? (
                <>
                  <MetricList
                    items={[
                      ["Version", selectedWorkflow.activeVersion],
                      ["Runs", formatCount(selectedWorkflow.metrics.runCount)],
                      [
                        "Completion / error",
                        `${selectedWorkflow.metrics.successRate ?? "—"}% / ${selectedWorkflow.metrics.errorRate ?? "—"}%`,
                      ],
                      [
                        "p50 / p95",
                        `${formatDuration(selectedWorkflow.metrics.p50DurationMs)} / ${formatDuration(selectedWorkflow.metrics.p95DurationMs)}`,
                      ],
                      [
                        "Tokens / run",
                        formatCount(
                          selectedWorkflow.metrics.averageTokens ?? 0,
                        ),
                      ],
                      [
                        "Cost / run",
                        formatCost(selectedWorkflow.metrics.averageCost),
                      ],
                      [
                        "Interrupt rate",
                        `${selectedWorkflow.metrics.interruptRate ?? 0}%`,
                      ],
                    ]}
                  />
                  <div>
                    <h4 className="mb-2 text-xs font-medium">Transitions</h4>
                    {system.transitions
                      .filter(
                        (edge) =>
                          edge.sourceWorkflowId === selectedWorkflow.id ||
                          edge.targetWorkflowId === selectedWorkflow.id,
                      )
                      .map((edge) => (
                        <button
                          type="button"
                          key={edge.id}
                          onClick={() =>
                            onSelect({ type: "transition", id: edge.id })
                          }
                          className="flex w-full items-center justify-between border-t py-2 text-left text-xs hover:text-foreground"
                        >
                          <span className="truncate text-muted-foreground">
                            {edge.sourceWorkflowId} → {edge.targetWorkflowId}
                          </span>
                          <span className="ml-2 font-mono text-[10px]">
                            {formatCount(edge.volume)}
                          </span>
                        </button>
                      ))}
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a workflow, node, or transition to inspect it.
            </p>
          )}
          <Button asChild className="w-full" size="sm">
            <Link href={runHref}>View runs</Link>
          </Button>
        </div>
      </ScrollArea>
    </aside>
  );
}

function MetricList({ items }: { items: [string, string][] }) {
  return (
    <dl className="divide-y rounded-md border text-xs">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-4 px-3 py-2"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="truncate text-right font-mono tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
