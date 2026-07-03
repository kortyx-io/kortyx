import { describe, expect, it } from "vitest";
import {
  EnsureWorkflowTopologyRequestSchema,
  TelemetryEventBatchSchema,
} from "../src";

describe("telemetry contracts", () => {
  it("validates fixtures", () => {
    expect(
      EnsureWorkflowTopologyRequestSchema.safeParse({
        schemaVersion: 1,
        environment: "test",
        service: { name: "app" },
        workflow: {
          id: "wf",
          declaredVersion: "1",
          topologyHash: "a".repeat(64),
          nodes: [],
          edges: [],
        },
      }).success,
    ).toBe(true);
    expect(
      TelemetryEventBatchSchema.safeParse({
        events: [
          {
            schemaVersion: 1,
            eventId: "id",
            occurredAt: "2026-01-01T00:00:00.000Z",
            environment: "test",
            service: { name: "app" },
            correlation: { runId: "run", workflowId: "wf" },
            type: "span.started",
            payload: {},
          },
        ],
      }).success,
    ).toBe(true);
  });
  it("rejects invalid fixtures", () => {
    expect(EnsureWorkflowTopologyRequestSchema.safeParse({}).success).toBe(
      false,
    );
    expect(TelemetryEventBatchSchema.safeParse({ events: [] }).success).toBe(
      false,
    );
  });
});
