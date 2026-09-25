import {
  projectWorkflowCalls,
  type StudioRunDetailResponse,
} from "@kortyx/telemetry-contracts";

export type RunTopologyNode = {
  id: string;
  attempts: number;
  status: "completed" | "failed" | "interrupted" | "running";
  firstSeenAt: string;
  durationMs: number | null;
};

export type RunTopologyWorkflow = {
  id: string;
  nodes: RunTopologyNode[];
};

export type RunTopologyCall = {
  id: string;
  sourceWorkflowId: string;
  targetWorkflowId: string;
  callerNodeIds: string[];
  count: number;
  failed: number;
};

export function buildRunTopology(detail: StudioRunDetailResponse): {
  workflows: RunTopologyWorkflow[];
  calls: RunTopologyCall[];
} {
  const workflows = new Map<string, Map<string, RunTopologyNode>>();
  const ensureWorkflow = (id: string) => {
    let nodes = workflows.get(id);
    if (!nodes) {
      nodes = new Map();
      workflows.set(id, nodes);
    }
    return nodes;
  };
  ensureWorkflow(detail.run.workflowId);

  const endings = new Map(
    detail.events
      .filter(
        (event) =>
          event.spanId &&
          (event.type === "span.ended" || event.type === "span.failed"),
      )
      .map((event) => [event.spanId, event]),
  );
  for (const event of detail.events) {
    if (
      event.type !== "span.started" ||
      event.payload.name !== "kortyx.node" ||
      !event.nodeId
    )
      continue;
    const nodes = ensureWorkflow(event.workflowId);
    const current = nodes.get(event.nodeId);
    const end = event.spanId ? endings.get(event.spanId) : undefined;
    const status =
      end?.type === "span.failed"
        ? isInterrupt(end.payload.error)
          ? "interrupted"
          : "failed"
        : end
          ? "completed"
          : "running";
    const durationMs =
      typeof end?.payload.durationMs === "number"
        ? end.payload.durationMs
        : null;
    if (!current) {
      nodes.set(event.nodeId, {
        id: event.nodeId,
        attempts: 1,
        status,
        firstSeenAt: event.occurredAt,
        durationMs,
      });
    } else {
      current.attempts++;
      // A later completed attempt resolves an earlier failure or pause.
      current.status = status;
      current.durationMs = durationMs;
      if (event.occurredAt < current.firstSeenAt)
        current.firstSeenAt = event.occurredAt;
    }
  }

  const calls = new Map<string, RunTopologyCall>();
  for (const call of projectWorkflowCalls(detail.events)) {
    ensureWorkflow(call.sourceWorkflowId);
    ensureWorkflow(call.targetWorkflowId);
    const id = `${call.sourceWorkflowId}→${call.targetWorkflowId}`;
    let edge = calls.get(id);
    if (!edge) {
      edge = {
        id,
        sourceWorkflowId: call.sourceWorkflowId,
        targetWorkflowId: call.targetWorkflowId,
        callerNodeIds: [],
        count: 0,
        failed: 0,
      };
      calls.set(id, edge);
    }
    edge.count++;
    if (call.status === "failed") edge.failed++;
    if (call.callerNodeId && !edge.callerNodeIds.includes(call.callerNodeId))
      edge.callerNodeIds.push(call.callerNodeId);
  }

  return {
    workflows: [...workflows].map(([id, nodes]) => ({
      id,
      nodes: [...nodes.values()].sort(
        (a, b) =>
          a.firstSeenAt.localeCompare(b.firstSeenAt) ||
          a.id.localeCompare(b.id),
      ),
    })),
    calls: [...calls.values()],
  };
}

function isInterrupt(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "GraphInterrupt"
  );
}
