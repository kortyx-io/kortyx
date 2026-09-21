import { Pause, RotateCcw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
      "No failure, pause-at-this-node, or retry signal was recorded for runs containing this node in the selected period.",
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
      "At least one run containing this node failed in the selected period.",
    className: "bg-red-500",
  },
  interrupted: {
    label: "Interrupted node",
    description:
      "At least one run paused for input at this node in the selected period.",
    className: "bg-blue-500",
  },
  retried: {
    label: "Retried node",
    description:
      "At least one run containing this node included a retry in the selected period. The orange dot, border, and circular arrow all indicate this state.",
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
  focusable = true,
  className,
}: {
  health: WorkflowHealth;
  focusable?: boolean;
  className?: string;
}) {
  const status = workflowHealth[health];
  return (
    <StatusTooltip
      label={status.label}
      description={status.description}
      focusable={focusable}
      className={className}
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
    <StatusTooltip label={status.label} description={status.description}>
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
  focusable = true,
  className,
  children,
}: {
  label: string;
  description: string;
  focusable?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {focusable ? (
          <button
            type="button"
            aria-label={`${label}. ${description}`}
            className={cn(
              "-m-1 inline-flex shrink-0 items-center gap-1 rounded-sm border-0 bg-transparent p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              className,
            )}
          >
            {children}
          </button>
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              "-m-1 inline-flex shrink-0 items-center gap-1 rounded-sm p-1",
              className,
            )}
          >
            {children}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-72" side="bottom" sideOffset={6}>
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-muted-foreground">{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
