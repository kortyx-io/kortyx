import type { WorkflowHealth } from "../schema";

export const workflowHealthFilters = [
  "all",
  "healthy",
  "degraded",
  "failing",
  "idle",
] as const;
export const workflowViewModes = ["system", "health"] as const;
export const workflowMetrics = [
  "volume",
  "error",
  "latency",
  "cost",
  "interrupt",
] as const;

export type WorkflowHealthFilter = (typeof workflowHealthFilters)[number];
export type WorkflowViewMode = (typeof workflowViewModes)[number];
export type WorkflowMetric = (typeof workflowMetrics)[number];
export type WorkflowSelection =
  | { type: "workflow"; id: string }
  | { type: "node"; workflowId: string; id: string }
  | { type: "transition"; id: string };

export function isWorkflowHealthFilter(
  value: WorkflowHealthFilter,
): value is WorkflowHealth {
  return value !== "all";
}
