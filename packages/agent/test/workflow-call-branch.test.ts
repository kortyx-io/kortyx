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

describe("restored tool evidence", () => {
  it.each([
    undefined,
    {},
    { environment: "test", service: { name: "app" } },
  ])("rebases cached tools and deduplicates evidence with telemetry %j", (partial) => {
    const events: KortyxTelemetryEvent[] = [];
    const original = {
      toolName: "lookup",
      invocationId: "child",
      toolCallId: "call",
      attemptId: "attempt",
      branchId: "old",
      outcome: "denied",
      executed: true,
      durationMs: 12,
    };
    const child = {
      invocationId: "child",
      fingerprint: "f",
      interrupts: [],
      status: "completed",
      telemetry: { branchId: "old" },
      toolObservations: [
        original,
        original,
        {
          ...original,
          attemptId: "other",
          runId: "original",
          workflowId: "nested",
          source: { runId: "earliest" },
        },
      ],
    };
    const request = {
      runId: "fork",
      workflow: "parent",
      sessionId: "session",
      state: { config: {} },
      graphSnapshot: { child, copy: { ...child } },
    } as unknown as PendingRequestRecord;
    const telemetry =
      partial === undefined
        ? undefined
        : {
            ...partial,
            reporter: {
              emit: async (batch: KortyxTelemetryEvent[]) => {
                events.push(...batch);
              },
              ensureWorkflowTopology: async () => ({
                workflowRevisionId: "rev",
                created: false,
              }),
            },
          };
    const branch = restoreWorkflowCallBranch([request], telemetry, "source");
    expect(request.state?.config.executionBranchId).toBe(branch);
    const tools = events.filter((e) => e.type === "tool.reused");
    if (partial?.environment) {
      expect(tools).toHaveLength(2);
      expect(tools[0]?.payload).toMatchObject({
        executed: false,
        observationKind: "reused",
        source: { runId: "source", attemptId: "attempt" },
      });
      expect(tools[1]?.payload).toMatchObject({
        source: { runId: "earliest" },
      });
      expect(child).toHaveProperty("restoredToolBranch", branch);
    } else expect(tools).toHaveLength(0);
  });
});
