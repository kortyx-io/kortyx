import { describe, expect, it } from "vitest";
import { projectWorkflowCalls, type StudioDetailEvent } from "../src";

const event = (
  sequence: number,
  status: string,
  branchId = "original",
  extra: Record<string, unknown> = {},
) =>
  ({
    id: `${branchId}-${sequence}`,
    type: `workflow.call.${status}`,
    occurredAt: new Date(1000 + sequence * 1000).toISOString(),
    runId: "run",
    workflowId: "parent",
    payload: {
      invocationId: "call",
      branchId,
      sequence,
      callId: "research",
      targetWorkflowId: "child",
      ...extra,
    },
  }) as StudioDetailEvent;
describe("workflow call projection", () => {
  it("orders out-of-order facts, deduplicates delivery, and counts active/wait separately", () => {
    const started = event(1, "started", "original", {
      input: { topic: "hello" },
    });
    const events = [
      event(5, "reused"),
      event(4, "completed", "original", { output: { answer: "yes" } }),
      event(2, "suspended"),
      started,
      event(3, "resumed"),
      started,
    ];
    expect(projectWorkflowCalls(events)).toMatchObject([
      {
        status: "completed",
        attempts: 2,
        reused: 1,
        activeMs: 2000,
        waitMs: 1000,
        input: { topic: "hello" },
        output: { answer: "yes" },
        events: expect.any(Array),
      },
    ]);
    expect(projectWorkflowCalls(events)[0]?.events).toHaveLength(5);
  });
  it("keeps rollback and fork evidence separate and does not borrow old completion or cost", () => {
    const calls = projectWorkflowCalls([
      event(1, "started"),
      event(2, "completed"),
      event(0, "restored", "rollback", {
        status: "interrupted",
        sourceRunId: "run",
      }),
      event(1, "resumed", "rollback"),
      event(2, "suspended", "rollback", {
        leaf: { workflowId: "grandchild", nodeId: "ask" },
      }),
    ]);
    expect(calls).toHaveLength(2);
    expect(calls.find((call) => call.branchId === "original")?.status).toBe(
      "completed",
    );
    expect(calls.find((call) => call.branchId === "rollback")).toMatchObject({
      status: "interrupted",
      attempts: 1,
      inherited: true,
      sourceRunId: "run",
      endedAt: null,
      leaf: { workflowId: "grandchild", nodeId: "ask" },
    });
  });
  it("distinguishes protocol cancellation from a returned application Cancel result", () => {
    const cancelled = {
      ...event(3, "started"),
      type: "run.cancelled" as const,
    };
    expect(
      projectWorkflowCalls([
        event(1, "started"),
        event(2, "suspended"),
        cancelled,
      ])[0]?.status,
    ).toBe("cancelled");
    expect(
      projectWorkflowCalls([
        event(1, "started"),
        event(2, "completed", "original", {
          output: { cancelledByUser: true },
        }),
        cancelled,
      ])[0]?.status,
    ).toBe("completed");
  });

  it("keeps repeated and recursive invocations distinct; tolerates partial and legacy telemetry", () => {
    expect(
      projectWorkflowCalls([{ ...event(1, "started"), type: "span.started" }]),
    ).toEqual([]);
    const calls = projectWorkflowCalls([
      event(1, "completed"),
      event(2, "failed", "original", {
        invocationId: "recursive",
        parentInvocationId: "call",
        callerNodeExecutionId: "activation2",
      }),
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      status: "failed",
      attempts: 0,
      parentInvocationId: "call",
      callerNodeExecutionId: "activation2",
    });
  });
});
