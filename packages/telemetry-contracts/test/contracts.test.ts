import { describe, expect, it } from "vitest";
import {
  EnsureWorkflowTopologyRequestSchema,
  resolveStudioInterruptStatus,
  resolveStudioTimeRange,
  StudioCatalogsResponseSchema,
  StudioChangeSchema,
  StudioInterruptSchema,
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
    expect(
      StudioChangeSchema.safeParse({
        schemaVersion: 1,
        changeId: "change-1",
        emittedAt: "2026-01-01T00:00:00.000Z",
        organizationId: "org-1",
        projectId: "project-1",
        resources: ["runs", "sessions"],
      }).success,
    ).toBe(true);
    expect(
      StudioInterruptSchema.safeParse({
        id: "human-1",
        status: "resolved",
        type: "choice",
        interactionMode: "dynamic-picker",
        schemaId: "pick-agent",
        schemaVersion: "1",
        createdAt: "2026-01-01T00:00:00.000Z",
        resolvedAt: "2026-01-01T00:00:01.000Z",
        expiresAt: "2026-01-01T00:15:00.000Z",
        question: null,
        contentCaptured: false,
        optionCount: 0,
        options: null,
        workflowId: "workflow",
        nodeId: "pickAgent",
        sessionId: "session",
        userId: null,
        tenantId: null,
        response: null,
        responseCaptured: false,
        resumeOutcome: "resumed",
        resumeError: null,
        runId: "run",
        resumeToken: null,
        resolvedBy: null,
        environment: "production",
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
    expect(
      StudioChangeSchema.safeParse({
        schemaVersion: 1,
        changeId: "change-1",
        emittedAt: "2026-01-01T00:00:00.000Z",
        organizationId: "org-1",
        projectId: "project-1",
        resources: ["runs"],
        payload: { secret: true },
      }).success,
    ).toBe(false);
  });

  it("resolves relative Studio ranges into deterministic UTC boundaries", () => {
    expect(
      resolveStudioTimeRange(
        { range: "7 days" },
        new Date("2026-07-25T12:00:00.000Z"),
      ),
    ).toEqual({
      ok: true,
      value: {
        range: "7 days",
        startedAfter: "2026-07-18T12:00:00.000Z",
        startedBefore: "2026-07-25T12:00:00.000Z",
      },
    });
    expect(
      resolveStudioTimeRange(
        { range: "All time" },
        new Date("2026-07-25T12:00:00.000Z"),
      ),
    ).toEqual({
      ok: true,
      value: {
        range: "All time",
        startedAfter: null,
        startedBefore: null,
      },
    });
  });

  it("derives interrupt expiry from its deadline without changing terminal states", () => {
    const expiresAt = "2026-07-26T12:15:00.000Z";
    expect(
      resolveStudioInterruptStatus(
        { status: "pending", expiresAt },
        Date.parse("2026-07-26T12:14:59.999Z"),
      ),
    ).toBe("pending");
    expect(
      resolveStudioInterruptStatus(
        { status: "pending", expiresAt },
        Date.parse(expiresAt),
      ),
    ).toBe("expired");
    expect(
      resolveStudioInterruptStatus(
        { status: "resolved", expiresAt },
        Date.parse("2026-07-26T13:00:00.000Z"),
      ),
    ).toBe("resolved");
  });

  it("normalizes custom Studio ranges and rejects ambiguous boundaries", () => {
    expect(
      resolveStudioTimeRange({
        range: "Custom range",
        startedAfter: "2026-07-20T01:00:00+02:00",
        startedBefore: "2026-07-21T01:00:00+02:00",
      }),
    ).toEqual({
      ok: true,
      value: {
        range: "Custom range",
        startedAfter: "2026-07-19T23:00:00.000Z",
        startedBefore: "2026-07-20T23:00:00.000Z",
      },
    });
    expect(
      resolveStudioTimeRange({
        range: "Custom range",
        startedAfter: "2026-07-20T01:00:00",
        startedBefore: "2026-07-21T01:00:00Z",
      }),
    ).toEqual({
      ok: false,
      error: "Start time must include an explicit UTC offset.",
    });
    expect(
      resolveStudioTimeRange({
        range: "Custom range",
        startedAfter: "2026-07-21T01:00:00Z",
        startedBefore: "2026-07-20T01:00:00Z",
      }),
    ).toEqual({
      ok: false,
      error: "Start time must be before end time.",
    });
  });
});
