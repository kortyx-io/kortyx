import type {
  StudioDetailEvent,
  StudioInterrupt,
  StudioWorkflowCall,
} from "@kortyx/telemetry-contracts";

/** A child call may be suspended in a descendant, but never another branch. */
export function pendingCallInterrupt(
  detail: {
    interrupts: readonly Pick<StudioInterrupt, "id" | "status" | "runId">[];
    events: readonly Pick<StudioDetailEvent, "type" | "payload" | "runId">[];
  },
  call: Pick<StudioWorkflowCall, "invocationId" | "branchId"> | undefined,
) {
  if (!call) return undefined;
  return detail.interrupts.find((interrupt) => {
    if (interrupt.status !== "pending") return false;
    const created = detail.events.find(
      (event) =>
        event.type === "interrupt.created" &&
        event.runId === interrupt.runId &&
        event.payload.interruptId === interrupt.id,
    );
    if (
      !created ||
      (created.payload.branchId ?? created.runId) !== call.branchId
    )
      return false;
    const path = created.payload.workflowCallPath;
    const leaf = created.payload.workflowCall;
    return (
      created.payload.invocationId === call.invocationId ||
      (leaf !== null &&
        typeof leaf === "object" &&
        "invocationId" in leaf &&
        leaf.invocationId === call.invocationId) ||
      (Array.isArray(path) &&
        path.some(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            entry.invocationId === call.invocationId,
        ))
    );
  });
}
