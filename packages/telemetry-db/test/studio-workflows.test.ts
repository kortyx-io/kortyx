import type { StudioRun } from "@kortyx/telemetry-contracts";
import { describe, expect, it } from "vitest";
import { createStudioWorkflowModelsFromProjections } from "../src/repositories/studio-workflows";
import type { WorkflowRevision } from "../src/schema";

const revision = (
  id: string,
  version: string,
  createdAt: string,
): WorkflowRevision =>
  ({
    id,
    organizationId: "org",
    projectId: "project",
    environment: "test",
    workflowId: "support",
    declaredVersion: version,
    topologyHash: id.padEnd(64, "a").slice(0, 64),
    serviceName: "service",
    deploymentRef: null,
    description: `Support ${version}`,
    tags: ["support"],
    nodes: [{ id: `answer-${version}`, label: `Answer ${version}` }],
    edges: [],
    workflowTransitions: [
      {
        sourceNodeId: `answer-${version}`,
        targetWorkflowId: "follow-up",
      },
    ],
    createdAt: new Date(createdAt),
  }) as WorkflowRevision;

const run = (
  id: string,
  version: string,
  status: StudioRun["status"],
  startedAt: string,
): StudioRun => ({
  id,
  status,
  startedAt,
  endedAt: new Date(Date.parse(startedAt) + 1_000).toISOString(),
  workflowId: "support",
  workflowIds: ["support"],
  workflowRefs: [
    {
      workflowId: "support",
      workflowRevisionId: `revision-${version}`,
      declaredVersion: version,
    },
  ],
  workflowRevisionId: `revision-${version}`,
  declaredVersion: version,
  transitionIds: [`support:answer-${version}:follow-up:`],
  path: [`answer-${version}`],
  sessionId: null,
  provider: null,
  model: null,
  models: [],
  durationMs: 1_000,
  tokens: 100,
  cost: 0.01,
  pricingStatus: "priced",
  pricingSource: "custom",
  currency: "USD",
  result: null,
  environment: "test",
  userId: null,
  tenantId: null,
  hasTool: false,
  hasRetry: false,
  interruptNodeId: null,
});

describe("Studio workflow projections", () => {
  it("recomputes topology, metrics, health and transitions for the selected cohort", () => {
    const models = createStudioWorkflowModelsFromProjections({
      revisions: [
        revision("revision-2", "2.0.0", "2026-07-24T00:00:00.000Z"),
        revision("revision-1", "1.0.0", "2026-07-20T00:00:00.000Z"),
      ],
      runs: [
        run("completed", "2.0.0", "completed", "2026-07-25T10:00:00.000Z"),
        run("failed", "2.0.0", "failed", "2026-07-25T11:00:00.000Z"),
      ],
      range: {
        range: "Custom range",
        startedAfter: "2026-07-25T00:00:00.000Z",
        startedBefore: "2026-07-25T23:59:59.999Z",
        workflowId: "support",
        version: "2.0.0",
      },
      now: new Date("2026-07-25T12:00:00.000Z"),
    });

    expect(models.workflows[0]).toMatchObject({
      id: "support",
      activeVersion: "2.0.0",
      health: "failing",
      metrics: {
        runCount: 2,
        successRate: 50,
        errorRate: 50,
        averageTokens: 100,
      },
      nodes: [
        {
          id: "answer-2.0.0",
          state: "failed",
          metrics: { runCount: 2, errorRate: 50 },
        },
      ],
    });
    expect(models.transitions).toEqual([
      expect.objectContaining({
        id: "support:answer-2.0.0:follow-up:",
        volume: 2,
        successRate: 50,
        errorRate: 50,
      }),
    ]);
    expect(models.cohort.version).toBe("2.0.0");
  });

  it("shows an older selected revision even when the latest version differs", () => {
    const models = createStudioWorkflowModelsFromProjections({
      revisions: [
        revision("revision-2", "2.0.0", "2026-07-24T00:00:00.000Z"),
        revision("revision-1", "1.0.0", "2026-07-20T00:00:00.000Z"),
      ],
      runs: [run("old", "1.0.0", "completed", "2026-07-20T10:00:00.000Z")],
      range: {
        range: "All time",
        startedAfter: null,
        startedBefore: null,
        workflowId: "support",
        version: "1.0.0",
      },
      now: new Date("2026-07-25T12:00:00.000Z"),
    });

    expect(models.workflows[0]).toMatchObject({
      activeVersion: "1.0.0",
      nodes: [{ id: "answer-1.0.0", metrics: { runCount: 1 } }],
      metrics: { runCount: 1 },
    });
  });
});
