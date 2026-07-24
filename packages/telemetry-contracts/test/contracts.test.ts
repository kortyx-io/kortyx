import { describe, expect, it } from "vitest";
import {
  EnsureWorkflowTopologyRequestSchema,
  StudioCatalogsResponseSchema,
  StudioRunsResponseSchema,
  TelemetryEventBatchResponseSchema,
  TelemetryEventBatchSchema,
  TelemetryPricingHintSchema,
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
          transitions: [
            {
              sourceNodeId: "route",
              targetWorkflowId: "target-wf",
            },
          ],
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
    expect(
      TelemetryEventBatchResponseSchema.safeParse({
        accepted: 1,
        inserted: 1,
        duplicates: 0,
      }).success,
    ).toBe(true);
    expect(
      TelemetryPricingHintSchema.safeParse({
        source: "custom",
        currency: "USD",
        unitPrices: [
          {
            usageType: "image_output",
            unit: "image",
            unitQuantity: 1,
            priceMicros: 40_000,
          },
        ],
        usageItems: [
          {
            usageType: "image_output",
            quantity: 2,
            unit: "image",
          },
        ],
        pricingRef: "custom-image-contract",
      }).success,
    ).toBe(true);
    expect(
      StudioRunsResponseSchema.safeParse({
        totalCount: 1,
        runs: [
          {
            id: "run",
            status: "completed",
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
            workflowId: "wf",
            workflowIds: ["wf", "target-wf"],
            workflowRefs: [
              {
                workflowId: "wf",
                workflowRevisionId: null,
                declaredVersion: null,
              },
              {
                workflowId: "target-wf",
                workflowRevisionId: null,
                declaredVersion: "2.1.0",
              },
            ],
            workflowRevisionId: null,
            declaredVersion: null,
            transitionIds: ["wf:node:target-wf:"],
            path: ["node"],
            sessionId: null,
            provider: "AnyProvider",
            model: "any-model",
            models: ["any-model"],
            durationMs: 1000,
            tokens: 10,
            cost: 0.000004,
            pricingStatus: "priced",
            pricingSource: "custom",
            currency: "USD",
            result: "Completed",
            environment: "production",
            userId: null,
            tenantId: null,
            hasTool: false,
            hasRetry: false,
            interruptNodeId: null,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      StudioCatalogsResponseSchema.safeParse({
        environments: ["production"],
        providers: ["AnyProvider"],
        models: ["any-model"],
        workflows: ["wf"],
        tags: [],
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
