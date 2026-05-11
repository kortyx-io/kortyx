import { describe, expect, it } from "vitest";
import {
  readReasonCheckpoint,
  readReasonCompletedCheckpoint,
  resolveHookStatePatch,
  resolveReasonCheckpointKey,
} from "../src/reason/checkpoint";

describe("reason checkpoints", () => {
  it("resolves stable explicit and positional checkpoint keys", () => {
    expect(resolveReasonCheckpointKey({ id: "plan", autoIndex: 3 })).toBe(
      "__useReason:plan",
    );
    expect(resolveReasonCheckpointKey({ autoIndex: 3 })).toBe(
      "__useReason:auto:3",
    );
  });

  it("ignores malformed interrupt checkpoints", () => {
    expect(readReasonCheckpoint(null)).toBeUndefined();
    expect(readReasonCheckpoint({ status: "completed" })).toBeUndefined();
    expect(
      readReasonCheckpoint({
        status: "awaiting_interrupt",
        request: { kind: "choice" },
      }),
    ).toBeUndefined();
    expect(
      readReasonCheckpoint({
        status: "awaiting_interrupt",
        firstText: "Draft",
        request: null,
      }),
    ).toBeUndefined();
  });

  it("restores optional interrupt checkpoint metadata", () => {
    expect(
      readReasonCheckpoint({
        status: "awaiting_interrupt",
        request: { kind: "choice" },
        firstText: "Draft",
        firstRaw: { raw: true },
        firstUsage: { input: 1, output: 2, total: 3 },
        firstFinishReason: { unified: "stop", raw: "STOP" },
        firstProviderMetadata: { requestId: "req-1" },
        firstWarnings: [{ type: "other", message: "warning" }],
        firstOutput: { summary: "Draft" },
      }),
    ).toEqual({
      status: "awaiting_interrupt",
      request: { kind: "choice" },
      firstText: "Draft",
      firstRaw: { raw: true },
      firstUsage: { input: 1, output: 2, total: 3 },
      firstFinishReason: { unified: "stop", raw: "STOP" },
      firstProviderMetadata: { requestId: "req-1" },
      firstWarnings: [{ type: "other", message: "warning" }],
      firstOutput: { summary: "Draft" },
    });
  });

  it("reads only valid completed checkpoints", () => {
    expect(readReasonCompletedCheckpoint(null)).toBeUndefined();
    expect(
      readReasonCompletedCheckpoint({ status: "awaiting_interrupt" }),
    ).toBeUndefined();
    expect(
      readReasonCompletedCheckpoint({ status: "completed" }),
    ).toBeUndefined();
    expect(
      readReasonCompletedCheckpoint({
        status: "completed",
        result: { text: "done", opId: "op-1" },
      }),
    ).toEqual({
      status: "completed",
      result: { text: "done", opId: "op-1" },
    });
  });

  it("builds resume state patches with node and workflow state", () => {
    expect(
      resolveHookStatePatch({
        nodeId: "reason-node",
        currentNodeState: {
          byIndex: [1],
          byKey: {},
        },
        workflowState: {
          shared: true,
        },
      }),
    ).toEqual({
      __kortyx: {
        nodeState: {
          nodeId: "reason-node",
          state: {
            byIndex: [1],
            byKey: {},
          },
        },
        workflowState: {
          shared: true,
        },
      },
    });
  });
});
