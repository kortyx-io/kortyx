import type { WorkflowHealth } from "../schema";

export const workflowHealthFilters = [
  "all",
  "unknown",
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

export const DEFAULT_WORKFLOW_ID = "general-chat";

export type WorkflowSelection =
  | { type: "workflow"; id: string }
  | { type: "node"; workflowId: string; id: string }
  | { type: "transition"; id: string };

/** Workflow group the canvas should frame for the current URL selection. */
export function workflowCanvasFocusId(
  selection: WorkflowSelection,
  workflowParam: string,
): string {
  if (selection.type === "node") return selection.workflowId;
  if (selection.type === "transition") return workflowParam;
  return selection.id;
}

export function isWorkflowHealthFilter(
  value: WorkflowHealthFilter,
): value is WorkflowHealth {
  return value !== "all";
}
