import type {
  StudioDetailEvent,
  StudioRunDetailResponse,
} from "@kortyx/telemetry-contracts";
import { describe, expect, it } from "vitest";
import { buildRunTopology } from "./run-topology";

const at = (ms: number) =>
  new Date(Date.UTC(2026, 8, 25, 0, 0, 0, ms)).toISOString();
const event = (
  id: string,
  type: string,
  ms: number,
  workflowId: string,
  nodeId: string | null,
  spanId: string | null,
  payload: Record<string, unknown>,
) =>
  ({
    id,
    type,
    occurredAt: at(ms),
    workflowId,
    nodeId,
    spanId,
    payload,
    runId: "run-1",
  }) as StudioDetailEvent;

describe("buildRunTopology", () => {
  it("shows observed nodes and one call edge even after a call resumes", () => {
    const detail = {
      run: { workflowId: "parent" },
      events: [
        event("a", "span.started", 0, "parent", "alpha", "span-a", {
          name: "kortyx.node",
        }),
        event("b", "span.started", 0, "parent", "beta", "span-b", {
          name: "kortyx.node",
        }),
        event("a-end", "span.ended", 10, "parent", "alpha", "span-a", {
          durationMs: 10,
        }),
        event("b-end", "span.ended", 20, "parent", "beta", "span-b", {
          durationMs: 20,
        }),
        event("call", "workflow.call.started", 5, "parent", "alpha", null, {
          invocationId: "child-1",
          branchId: "branch-1",
          sourceWorkflowId: "parent",
          targetWorkflowId: "child",
          callerNodeId: "alpha",
          callId: "call-1",
        }),
        event("resume", "workflow.call.resumed", 15, "parent", "alpha", null, {
          invocationId: "child-1",
          branchId: "branch-1",
          sourceWorkflowId: "parent",
          targetWorkflowId: "child",
          callerNodeId: "alpha",
          callId: "call-1",
        }),
        event("child", "span.started", 6, "child", "worker", "span-c", {
          name: "kortyx.node",
        }),
        event("child-end", "span.failed", 19, "child", "worker", "span-c", {
          error: { name: "Error" },
        }),
      ],
    } as StudioRunDetailResponse;

    const topology = buildRunTopology(detail);
    expect(topology.workflows.map((workflow) => workflow.id)).toEqual([
      "parent",
      "child",
    ]);
    expect(topology.workflows[0]?.nodes.map((node) => node.id)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(topology.workflows[1]?.nodes[0]?.status).toBe("failed");
    expect(topology.calls).toMatchObject([
      {
        sourceWorkflowId: "parent",
        targetWorkflowId: "child",
        count: 1,
        callerNodeIds: ["alpha"],
      },
    ]);
  });
});
