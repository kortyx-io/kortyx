import type { StudioDetailEvent } from "./index";

export type StudioWorkflowCall = {
  id: string;
  invocationId: string;
  branchId: string;
  parentInvocationId: string | null;
  callId: string;
  callerNodeId: string;
  callerNodeExecutionId: string;
  sourceWorkflowId: string;
  targetWorkflowId: string;
  targetVersion: string | null;
  status:
    | "running"
    | "interrupted"
    | "completed"
    | "failed"
    | "incomplete"
    | "cancelled";
  startedAt: string;
  endedAt: string | null;
  activeMs: number;
  waitMs: number;
  attempts: number;
  reused: number;
  inherited: boolean;
  sourceRunId: string | null;
  input?: unknown;
  output?: unknown;
  inputOmitted?: unknown;
  outputOmitted?: unknown;
  leaf: { workflowId?: string; nodeId?: string; invocationId?: string } | null;
  events: StudioDetailEvent[];
};
const str = (v: unknown, fallback = "") =>
  typeof v === "string" ? v : fallback;
/** Logical calls are ordered by persisted sequence, independently within each branch. */
export function projectWorkflowCalls(
  events: StudioDetailEvent[],
): StudioWorkflowCall[] {
  const groups = new Map<string, StudioDetailEvent[]>();
  for (const event of events) {
    if (
      !event.type.startsWith("workflow.call.") ||
      !str(event.payload.invocationId) ||
      !str(event.payload.targetWorkflowId)
    )
      continue;
    const key = `${event.runId}:${str(event.payload.branchId, event.runId)}:${event.payload.invocationId}`;
    const group = groups.get(key) ?? [];
    if (!group.some((existing) => existing.id === event.id)) group.push(event);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([id, group]) => {
      group.sort(
        (a, b) =>
          Number(a.payload.sequence ?? 0) - Number(b.payload.sequence ?? 0) ||
          a.occurredAt.localeCompare(b.occurredAt) ||
          a.id.localeCompare(b.id),
      );
      const first = group[0]!;
      const p = first.payload;
      const call: StudioWorkflowCall = {
        id,
        invocationId: str(p.invocationId),
        branchId: str(p.branchId, first.runId),
        parentInvocationId: str(p.parentInvocationId) || null,
        callId: str(p.callId),
        callerNodeId: str(p.callerNodeId),
        callerNodeExecutionId: str(p.callerNodeExecutionId),
        sourceWorkflowId: str(p.sourceWorkflowId, first.workflowId),
        targetWorkflowId: str(p.targetWorkflowId),
        targetVersion: str(p.targetVersion) || null,
        status: "incomplete",
        startedAt: first.occurredAt,
        endedAt: null,
        activeMs: 0,
        waitMs: 0,
        attempts: 0,
        reused: 0,
        inherited: false,
        sourceRunId: null,
        leaf: null,
        events: group,
      };
      let active: number | null = null;
      let waiting: number | null = null;
      for (const event of group) {
        const at = Date.parse(event.occurredAt);
        const status = event.type.slice("workflow.call.".length);
        for (const side of [
          "input",
          "output",
          "inputOmitted",
          "outputOmitted",
        ] as const)
          if (side in event.payload) call[side] = event.payload[side];
        if (status === "restored") {
          call.inherited = true;
          call.sourceRunId = str(event.payload.sourceRunId) || null;
          call.status =
            event.payload.status === "completed"
              ? "completed"
              : event.payload.status === "failed"
                ? "failed"
                : "interrupted";
          if (call.status === "interrupted") waiting = at;
        } else if (status === "started" || status === "resumed") {
          if (waiting !== null) call.waitMs += Math.max(0, at - waiting);
          waiting = null;
          active = at;
          call.attempts++;
          call.status = "running";
          call.endedAt = null;
        } else if (status === "reused") {
          call.reused++;
          call.status = "completed";
        } else if (
          status === "suspended" ||
          status === "completed" ||
          status === "failed"
        ) {
          if (active !== null) call.activeMs += Math.max(0, at - active);
          active = null;
          call.status = status === "suspended" ? "interrupted" : status;
          if (status === "suspended") {
            waiting = at;
            const leaf = event.payload.leaf;
            if (leaf && typeof leaf === "object") {
              const value = leaf as Record<string, unknown>;
              call.leaf = {
                workflowId: str(value.workflowId),
                nodeId: str(value.nodeId),
                invocationId: str(value.invocationId),
              };
            }
          } else {
            call.endedAt = event.occurredAt;
            call.leaf = null;
          }
        }
      }
      const cancellation = events.find(
        (event) =>
          event.type === "run.cancelled" &&
          event.runId === first.runId &&
          (event.payload.branchId ?? event.runId) === call.branchId &&
          event.occurredAt >= (group.at(-1)?.occurredAt ?? first.occurredAt),
      );
      if (
        cancellation &&
        (call.status === "interrupted" || call.status === "running")
      ) {
        call.status = "cancelled";
        call.endedAt = cancellation.occurredAt;
      }
      return call;
    })
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
