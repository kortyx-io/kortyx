import type { KortyxTelemetryEvent } from "@kortyx/hooks";
import type { PendingRequestRecord } from "@kortyx/runtime";
import { describe, expect, it } from "vitest";
import { restoreWorkflowCallBranch } from "../src/telemetry/workflow-call-branch";

describe("restored call telemetry", () => {
  it("handles old snapshots, missing state/session, malformed records and duplicate object references", () => {
    const events: KortyxTelemetryEvent[] = [];
    const record = {
      invocationId: "child",
      fingerprint: "key",
      interrupts: [],
      status: "interrupted",
      telemetry: { callId: "research", branchId: "source" },
    };
    const oldRecord = {
      invocationId: "legacy",
      fingerprint: "key",
      interrupts: [],
    };
    const request = {
      runId: "fork",
      workflow: "parent",
      graphSnapshot: {
        record,
        duplicate: record,
        oldRecord,
        noFingerprint: { invocationId: "bad", fingerprint: 42 },
        malformed: [
          { invocationId: "a" },
          { invocationId: "b", fingerprint: "f", interrupts: false },
        ],
      },
    } as unknown as PendingRequestRecord;
    const branch = restoreWorkflowCallBranch(
      [request],
      {
        environment: "test",
        service: { name: "app" },
        reporter: {
          ensureWorkflowTopology: async () => ({
            workflowRevisionId: "rev",
            created: false,
          }),
          emit: async (batch) => {
            events.push(...batch);
          },
        },
      },
      "source-run",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "workflow.call.restored",
      correlation: { runId: "fork", workflowId: "parent" },
      payload: {
        branchId: branch,
        sourceRunId: "source-run",
        sourceBranchId: "source",
        status: "interrupted",
      },
    });
    expect(record.telemetry.branchId).toBe(branch);
    expect(oldRecord).not.toHaveProperty("telemetry");
    const silentBranch = restoreWorkflowCallBranch(
      [request],
      undefined,
      "source-run",
    );
    expect(silentBranch).not.toBe(branch);
    expect(record.telemetry.branchId).toBe(silentBranch);
  });
});
