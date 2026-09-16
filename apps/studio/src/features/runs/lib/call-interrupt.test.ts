import { describe, expect, it } from "vitest";
import { pendingCallInterrupt } from "./call-interrupt";

const call = { invocationId: "parent", branchId: "branch-a" };
const interrupt = (id: string, status: "pending" | "resolved" = "pending") => ({
  id,
  status,
  runId: "run",
});
const created = (
  id: string,
  branchId: string,
  payload: Record<string, unknown> = {},
) => ({
  type: "interrupt.created" as const,
  runId: "run",
  payload: { interruptId: id, branchId, ...payload },
});

describe("pending workflow-call interrupt", () => {
  it("does not select another branch even when the invocation ID is reused", () => {
    const detail = {
      interrupts: [interrupt("b"), interrupt("a")],
      events: [
        created("b", "branch-b", { invocationId: "parent" }),
        created("a", "branch-a", { invocationId: "parent" }),
      ],
    };
    expect(pendingCallInterrupt(detail, call)?.id).toBe("a");
  });

  it("matches a suspended descendant through the selected ancestor's call path", () => {
    const detail = {
      interrupts: [interrupt("unrelated"), interrupt("nested")],
      events: [
        created("unrelated", "branch-a", {
          workflowCall: { invocationId: "other" },
        }),
        created("nested", "branch-a", {
          workflowCall: { invocationId: "child" },
          workflowCallPath: [
            null,
            { invocationId: "parent" },
            { invocationId: "child" },
          ],
        }),
      ],
    };
    expect(pendingCallInterrupt(detail, call)?.id).toBe("nested");
  });

  it("ignores resolved requests and missing or unrelated creation events", () => {
    const detail = {
      interrupts: [
        interrupt("done", "resolved"),
        interrupt("missing"),
        interrupt("foreign"),
      ],
      events: [
        created("done", "branch-a", { invocationId: "parent" }),
        {
          ...created("foreign", "branch-a", { invocationId: "parent" }),
          runId: "another-run",
        },
      ],
    };
    expect(pendingCallInterrupt(detail, call)).toBeUndefined();
    expect(pendingCallInterrupt(detail, undefined)).toBeUndefined();
  });

  it("uses the run ID for legacy events without explicit branch correlation", () => {
    const detail = {
      interrupts: [interrupt("legacy")],
      events: [
        {
          type: "interrupt.created" as const,
          runId: "run",
          payload: {
            interruptId: "legacy",
            workflowCall: { invocationId: "parent" },
          },
        },
      ],
    };
    expect(pendingCallInterrupt(detail, { ...call, branchId: "run" })?.id).toBe(
      "legacy",
    );
  });
});
