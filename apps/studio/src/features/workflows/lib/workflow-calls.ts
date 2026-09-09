import type { WorkflowSystem, WorkflowTransition } from "../schema";

export const sameWorkflowCall = (
  a: WorkflowTransition,
  b: WorkflowTransition,
) =>
  a.sourceWorkflowId === b.sourceWorkflowId &&
  a.sourceNodeId === b.sourceNodeId &&
  a.targetWorkflowId === b.targetWorkflowId;

/** Keep source-discovered paths visible even without traffic. Overlay evidence once. */
export function withWorkflowCallEvidence(
  system: WorkflowSystem,
  showObserved: boolean,
): WorkflowSystem {
  if (!showObserved) return system;
  const transitions = system.transitions.map((path) => {
    if (path.kind !== "call") return path;
    const observed = system.observedCalls?.find((call) =>
      sameWorkflowCall(path, call),
    );
    return observed
      ? {
          ...path,
          volume: observed.volume,
          successRate: observed.successRate,
          errorRate: observed.errorRate,
          medianDurationMs: observed.medianDurationMs,
          condition: "Discovered in source · observed call · returns to caller",
        }
      : path;
  });
  for (const call of system.observedCalls ?? []) {
    if (
      !transitions.some(
        (path) => path.kind === "call" && sameWorkflowCall(path, call),
      )
    )
      transitions.push({ ...call, kind: "call" });
  }
  return { ...system, transitions };
}
