import { Pause, RotateCcw } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { studioHelp } from "@/lib/studio-help";
import { cn } from "@/lib/utils";
import type { WorkflowHealth, WorkflowNode } from "../schema";

type NodeState = NonNullable<WorkflowNode["state"]>;

const workflowHealth = {
  unknown: {
    label: "Unknown health",
    description: "No runs were recorded in the selected period.",
    className: "bg-slate-300",
  },
  healthy: {
    label: "Healthy",
    description:
      "Error rate is below 5% and interrupt rate is below 25% for the selected period.",
    className: "bg-emerald-500",
  },
  degraded: {
    label: "Degraded",
    description:
      "Error rate is at least 5%, or interrupt rate is at least 25%, for the selected period.",
    className: "bg-amber-500",
  },
  failing: {
    label: "Failing",
    description: "Error rate is at least 20% for the selected period.",
    className: "bg-red-500",
  },
  idle: {
    label: "Idle",
    description: "The latest recorded activity is more than 7 days old.",
    className: "bg-slate-400",
  },
} satisfies Record<
  WorkflowHealth,
  { label: string; description: string; className: string }
>;

const nodeStates = {
  healthy: {
    label: "Healthy node",
    description:
      "No failure, pause at this step, or retry was recorded for matching runs.",
    className: "bg-emerald-500",
  },
  warning: {
    label: "Node needs attention",
    description: "This node reported a warning in the selected period.",
    className: "bg-amber-500",
  },
  failed: {
    label: "Failed node",
    description:
      "At least one run that reached this step failed. Open the run to find where the error happened.",
    className: "bg-red-500",
  },
  interrupted: {
    label: "Interrupted node",
    description:
      "At least one run paused for input at this node in the selected time range.",
    className: "bg-blue-500",
  },
  retried: {
    label: "Retried node",
    description:
      "At least one run that reached this step tried again. The orange dot and circular arrow mark this state.",
    className: "bg-amber-500",
  },
} satisfies Record<
  NodeState,
  { label: string; description: string; className: string }
>;

const noNodeState = {
  label: "No node activity",
  description: "This node did not run in the selected period.",
  className: "bg-slate-400",
};

export function workflowHealthLabel(health: WorkflowHealth) {
  return workflowHealth[health].label;
}

export function WorkflowHealthIndicator({
  health,
  className,
}: {
  health: WorkflowHealth;
  className?: string;
}) {
  const status = workflowHealth[health];
  return (
    <StatusTooltip
      label={status.label}
      description={status.description}
      className={className}
      documentationUrl={studioHelp.workflowHealth.documentationUrl}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", status.className)}
      />
    </StatusTooltip>
  );
}

export function NodeStatusIndicator({
  state,
}: {
  state: WorkflowNode["state"];
}) {
  const status = state ? nodeStates[state] : noNodeState;
  return (
    <StatusTooltip
      label={status.label}
      description={status.description}
      documentationUrl={studioHelp.workflowNodes.documentationUrl}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", status.className)}
      />
      {state === "interrupted" ? (
        <Pause aria-hidden="true" className="size-2.5 text-blue-500" />
      ) : null}
      {state === "retried" ? (
        <RotateCcw aria-hidden="true" className="size-2.5 text-amber-500" />
      ) : null}
    </StatusTooltip>
  );
}

function StatusTooltip({
  label,
  description,
  documentationUrl,
  className,
  children,
}: {
  label: string;
  description: string;
  documentationUrl: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <InfoTooltip
      label={label}
      documentationUrl={documentationUrl}
      side="bottom"
      trigger={
        <button
          type="button"
          aria-label={`${label}. ${description}`}
          className={cn(
            "-m-1 inline-flex shrink-0 items-center gap-1 rounded-sm border-0 bg-transparent p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center",
            className,
          )}
        >
          {children}
        </button>
      }
    >
      {description}
    </InfoTooltip>
  );
}
