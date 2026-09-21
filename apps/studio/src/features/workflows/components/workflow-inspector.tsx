import { ArrowLeft, CircleHelp, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCount, formatCurrency, formatDurationMs } from "@/lib/format";
import { formatRate } from "../lib/format";
import type { WorkflowSelection } from "../lib/view-state";
import type { WorkflowSystem } from "../schema";
import {
  NodeStatusIndicator,
  WorkflowHealthIndicator,
} from "./workflow-status-indicator";
import { WorkflowTools } from "./workflow-tools";

const metricDescriptions: Record<string, string> = {
  Source: "The workflow and node where this connection starts.",
  Target: "The workflow this connection enters.",
  Condition: "The routing condition recorded for this connection.",
  "Observed calls": "Child-workflow calls recorded in the selected period.",
  Handoffs: "Workflow handoffs recorded in the selected period.",
  "Child success": "Share of child-workflow calls that completed successfully.",
  "Success after handoff":
    "Share of runs that completed successfully after this handoff.",
  "Median call duration": "Median time spent in the child workflow (p50).",
  "Median transition": "Median time measured for this transition (p50).",
  Provider:
    "The provider and model used by this node. Internal means no external model provider was recorded.",
  Runs: "Runs in the selected time range, environment, and version filters.",
  "Success / error":
    "Share of runs that completed successfully versus the share that failed.",
  "p50 / p95":
    "Median duration versus the duration that 95% of runs finished within.",
  "Retries / interrupts":
    "Number of runs that included a retry versus the share that paused for input.",
  "Cost / run": "Average recorded model cost per run.",
  Version: "The active published workflow version.",
  "Completion / error":
    "Share of runs that completed versus the share that failed.",
  "Tokens / run": "Average recorded model tokens per run.",
  "Interrupt rate": "Share of runs that paused for human or external input.",
};

const runsHref = (params: Record<string, string | null | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const queryString = query.toString();
  return queryString ? `/runs?${queryString}` : "/runs";
};

type WorkflowInspectorProps = {
  system: WorkflowSystem;
  selection: WorkflowSelection;
  onClose: () => void;
  onNavigate?: () => void;
  onSelect: (selection: WorkflowSelection) => void;
};

export function WorkflowInspector({
  system,
  selection,
  onClose,
  onNavigate,
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
  const cohortParams =
    system.cohort.range === "All time"
      ? { range: "All time" }
      : {
          range: "Custom range",
          startedAfter: system.cohort.startedAfter,
          startedBefore: system.cohort.startedBefore,
        };
  const selectedVersion =
    selectedWorkflowId === system.cohort.workflowId
      ? system.cohort.version
      : null;
  const runHref =
    selection.type === "transition" && selectedTransition
      ? runsHref({
          workflow:
            selectedTransition.kind === "call"
              ? selectedTransition.targetWorkflowId
              : selectedTransition.sourceWorkflowId,
          includeChildren: selectedTransition.kind === "call" ? "true" : null,
          transition:
            selectedTransition.kind === "call" ? null : selectedTransition.id,
          version:
            selectedTransition.kind !== "call" &&
            selectedTransition.sourceWorkflowId === system.cohort.workflowId
              ? system.cohort.version
              : null,
          ...cohortParams,
        })
      : selection.type === "node" && selectedNode
        ? runsHref({
            workflow: selection.workflowId,
            path: selectedNode.id,
            version: selectedVersion,
            ...cohortParams,
          })
        : selectedWorkflow
          ? runsHref({
              workflow: selectedWorkflow.id,
              version: selectedVersion,
              ...cohortParams,
            })
          : "/runs";
  const title =
    selection.type === "transition"
      ? selectedTransition?.kind === "call"
        ? "Child workflow call"
        : "Transition"
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Close selected item panel"
              onClick={onClose}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close selected item panel</TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          {title ? (
            <>
              <div>
                <div className="flex items-center gap-2">
                  {selection.type === "transition" && selectedTransition ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="shrink-0"
                          aria-label={`Back to ${selectedTransition.sourceWorkflowId}`}
                          onClick={() =>
                            onSelect(
                              selectedTransition.sourceNodeId
                                ? {
                                    type: "node",
                                    workflowId:
                                      selectedTransition.sourceWorkflowId,
                                    id: selectedTransition.sourceNodeId,
                                  }
                                : {
                                    type: "workflow",
                                    id: selectedTransition.sourceWorkflowId,
                                  },
                            )
                          }
                        >
                          <ArrowLeft />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Back to {selectedTransition.sourceWorkflowId}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  <h3 className="min-w-0 flex-1 break-words font-mono text-sm font-semibold">
                    {title}
                  </h3>
                  {selectedNode ? (
                    <NodeStatusIndicator state={selectedNode.state} />
                  ) : selectedWorkflow ? (
                    <WorkflowHealthIndicator health={selectedWorkflow.health} />
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {selection.type === "transition"
                    ? selectedTransition?.intent
                    : selection.type === "node"
                      ? `${selectedWorkflow?.name} · ${selectedNode?.type ?? "node"}`
                      : selectedWorkflow?.description}
                </p>
              </div>
              {selectedWorkflow && (
                <WorkflowTools
                  workflow={selectedWorkflow}
                  nodeId={selectedNode?.id}
                  cohort={system.cohort}
                  environment={system.cohort.environment}
                  onSelect={onSelect}
                  onNavigate={onNavigate}
                />
              )}
              {selection.type === "transition" && selectedTransition ? (
                <MetricList
                  items={[
                    [
                      "Source",
                      `${selectedTransition.sourceWorkflowId}${selectedTransition.sourceNodeId ? ` / ${selectedTransition.sourceNodeId}` : ""}`,
                    ],
                    ["Target", selectedTransition.targetWorkflowId],
                    ["Condition", selectedTransition.condition ?? "—"],
                    [
                      selectedTransition.kind === "call"
                        ? "Observed calls"
                        : "Handoffs",
                      formatCount(selectedTransition.volume),
                    ],
                    [
                      selectedTransition.kind === "call"
                        ? "Child success"
                        : "Success after handoff",
                      formatRate(selectedTransition.successRate),
                    ],
                    [
                      selectedTransition.kind === "call"
                        ? "Median call duration"
                        : "Median transition",
                      formatDurationMs(selectedTransition.medianDurationMs),
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
                      `${formatRate(selectedNode.metrics.successRate)} / ${formatRate(selectedNode.metrics.errorRate)}`,
                    ],
                    [
                      "p50 / p95",
                      `${formatDurationMs(selectedNode.metrics.p50DurationMs)} / ${formatDurationMs(selectedNode.metrics.p95DurationMs)}`,
                    ],
                    [
                      "Retries / interrupts",
                      `${selectedNode.metrics.retryCount ?? "—"} / ${formatRate(selectedNode.metrics.interruptRate)}`,
                    ],
                    [
                      "Cost / run",
                      formatCurrency(selectedNode.metrics.averageCost),
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
                        `${formatRate(selectedWorkflow.metrics.successRate)} / ${formatRate(selectedWorkflow.metrics.errorRate)}`,
                      ],
                      [
                        "p50 / p95",
                        `${formatDurationMs(selectedWorkflow.metrics.p50DurationMs)} / ${formatDurationMs(selectedWorkflow.metrics.p95DurationMs)}`,
                      ],
                      [
                        "Tokens / run",
                        selectedWorkflow.metrics.averageTokens === undefined
                          ? "—"
                          : formatCount(selectedWorkflow.metrics.averageTokens),
                      ],
                      [
                        "Cost / run",
                        formatCurrency(selectedWorkflow.metrics.averageCost),
                      ],
                      [
                        "Interrupt rate",
                        `${formatRate(selectedWorkflow.metrics.interruptRate)}`,
                      ],
                    ]}
                  />
                  <div>
                    <h4 className="mb-2 text-xs font-medium">
                      Workflow connections
                    </h4>
                    {!system.transitions.some(
                      (edge) =>
                        edge.sourceWorkflowId === selectedWorkflow.id ||
                        edge.targetWorkflowId === selectedWorkflow.id,
                    ) && (
                      <p className="text-xs text-muted-foreground">
                        No workflow connections.
                      </p>
                    )}
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
            <Link href={runHref} onNavigate={onNavigate}>
              View runs
            </Link>
          </Button>
        </div>
      </ScrollArea>
    </aside>
  );
}

function MetricList({ items }: { items: [string, string][] }) {
  return (
    <dl className="divide-y rounded-md border text-xs">
      {items.map(([label, value]) => {
        const description = metricDescriptions[label];
        return (
          <div
            key={label}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-3 py-2"
          >
            <dt className="flex min-w-0 items-center gap-1 text-muted-foreground">
              <span>{label}</span>
              {description ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Explain ${label}`}
                      className="shrink-0 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <CircleHelp className="size-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72">
                    {description}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </dt>
            <dd
              title={value}
              className="min-w-0 break-words text-right font-mono tabular-nums"
            >
              {value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
