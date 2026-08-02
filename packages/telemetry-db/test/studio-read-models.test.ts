import { describe, expect, it } from "vitest";
import { createStudioReadModelsFromRecords } from "../src/repositories/studio-read-models";
import type { TelemetryEventRecord, WorkflowRevision } from "../src/schema";

const baseTime = Date.parse("2026-07-06T10:00:00.000Z");

const event = (
  offsetMs: number,
  input: {
    type: string;
    eventId: string;
    runId?: string;
    sessionId?: string;
    workflowId?: string;
    workflowRevisionId?: string | null;
    topologyHash?: string | null;
    nodeId?: string | null;
    spanId?: string | null;
    payload?: Record<string, unknown>;
  },
): TelemetryEventRecord =>
  ({
    id: input.eventId,
    organizationId: "org",
    projectId: "project",
    eventId: input.eventId,
    schemaVersion: 1,
    type: input.type,
    occurredAt: new Date(baseTime + offsetMs),
    receivedAt: new Date(baseTime + offsetMs),
    environment: "test",
    serviceName: "test-service",
    deploymentRef: null,
    traceId: "trace",
    spanId: input.spanId ?? null,
    parentSpanId: null,
    runId: input.runId ?? "run-1",
    sessionId: input.sessionId ?? "session-1",
    workflowId: input.workflowId ?? "canvas-creation",
    workflowRevisionId: input.workflowRevisionId ?? "revision-1",
    topologyHash: input.topologyHash ?? "a".repeat(64),
    nodeId: input.nodeId ?? null,
    userId: "user-1",
    tenantId: "tenant-1",
    contextTags: ["test"],
    contextMetadata: null,
    payload: input.payload ?? {},
  }) as TelemetryEventRecord;

const revision = (
  workflowId = "canvas-creation",
  id = "revision-1",
  workflowTransitionsOrVersion:
    | WorkflowRevision["workflowTransitions"]
    | string = [],
  declaredVersion = "1.0.0",
): WorkflowRevision => {
  const workflowTransitions = Array.isArray(workflowTransitionsOrVersion)
    ? workflowTransitionsOrVersion
    : [];
  const version =
    typeof workflowTransitionsOrVersion === "string"
      ? workflowTransitionsOrVersion
      : declaredVersion;
  return {
    id,
    organizationId: "org",
    projectId: "project",
    environment: "test",
    workflowId,
    declaredVersion: version,
    topologyHash: "a".repeat(64),
    serviceName: "test-service",
    deploymentRef: null,
    description: null,
    tags: ["test"],
    nodes: [
      {
        id:
          workflowId === "general-chat"
            ? "classifyIntent"
            : "fetchDiscoveryCanvasInputs",
        label:
          workflowId === "general-chat"
            ? "Classify Intent"
            : "Fetch Discovery Canvas Inputs",
        type: "workflow",
      },
    ],
    edges: [
      {
        sourceNodeId: "__start__",
        targetNodeId:
          workflowId === "general-chat"
            ? "classifyIntent"
            : "fetchDiscoveryCanvasInputs",
      },
      {
        sourceNodeId:
          workflowId === "general-chat"
            ? "classifyIntent"
            : "fetchDiscoveryCanvasInputs",
        targetNodeId: "__end__",
      },
    ],
    workflowTransitions,
    createdAt: new Date(baseTime),
  } as WorkflowRevision;
};

describe("Studio read model projection", () => {
  it("keeps an interrupted run interrupted and derives node metrics from checkpoints", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [revision()],
      rates: [],
      events: [
        event(0, {
          eventId: "root-start",
          type: "span.started",
          spanId: "root-1",
          payload: { name: "kortyx.run" },
        }),
        event(1_000, {
          eventId: "interrupt-created",
          type: "interrupt.created",
          nodeId: "fetchDiscoveryCanvasInputs",
          payload: {
            interruptId: "human-1",
            kind: "choice",
            optionCount: 2,
            nodeId: "fetchDiscoveryCanvasInputs",
          },
        }),
        event(1_100, {
          eventId: "checkpoint",
          type: "session.checkpointed",
          payload: {
            checkpointId: "checkpoint-1",
            turnIndex: 1,
            nodes: ["fetchDiscoveryCanvasInputs"],
          },
        }),
        event(1_200, {
          eventId: "root-end",
          type: "span.ended",
          spanId: "root-1",
          payload: { name: "kortyx.run", durationMs: 1_200 },
        }),
      ],
    });

    expect(models.runs[0]).toMatchObject({
      id: "run-1",
      status: "interrupted",
      durationMs: 1_000,
      interruptNodeId: "fetchDiscoveryCanvasInputs",
      interruptId: "human-1",
      interruptStatus: "pending",
      path: ["fetchDiscoveryCanvasInputs"],
    });
    expect(models.sessions[0]).toMatchObject({
      id: "session-1",
      status: "interrupted",
      pendingInterruptId: "human-1",
      interruptStatus: "pending",
      durationMs: 1_000,
    });
    expect(models.interrupts[0]).toMatchObject({
      id: "human-1",
      status: "pending",
      workflowId: "canvas-creation",
      nodeId: "fetchDiscoveryCanvasInputs",
      resumeToken: null,
    });
    expect(models.detailEvents).toHaveLength(4);
    expect(
      models.workflows.workflows[0]?.nodes.find(
        (node) => node.id === "fetchDiscoveryCanvasInputs",
      )?.metrics.runCount,
    ).toBe(1);
  });

  it("ends an unfinished root span at the interrupt boundary", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [revision()],
      rates: [],
      events: [
        event(0, {
          eventId: "root-start",
          type: "span.started",
          spanId: "root-1",
          payload: { name: "kortyx.run" },
        }),
        event(4_000, {
          eventId: "interrupt-created",
          type: "interrupt.created",
          nodeId: "fetchDiscoveryCanvasInputs",
          payload: {
            interruptId: "human-open-root",
            kind: "choice",
            nodeId: "fetchDiscoveryCanvasInputs",
            expiresAt: "2099-01-01T00:00:00.000Z",
          },
        }),
      ],
    });

    expect(models.runs[0]).toMatchObject({
      status: "interrupted",
      startedAt: new Date(baseTime).toISOString(),
      endedAt: new Date(baseTime + 4_000).toISOString(),
      durationMs: 4_000,
      interruptStatus: "pending",
      result: "Waiting for input at fetchDiscoveryCanvasInputs",
    });
    expect(models.sessions[0]).toMatchObject({
      durationMs: 4_000,
      interruptStatus: "pending",
    });
  });

  it("presents an unresolved request past its deadline as expired", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [revision()],
      rates: [],
      events: [
        event(0, {
          eventId: "root-start",
          type: "span.started",
          spanId: "root-1",
          payload: { name: "kortyx.run" },
        }),
        event(1_000, {
          eventId: "interrupt-created",
          type: "interrupt.created",
          nodeId: "fetchDiscoveryCanvasInputs",
          payload: {
            interruptId: "human-expired",
            kind: "choice",
            nodeId: "fetchDiscoveryCanvasInputs",
            expiresAt: new Date(baseTime + 2_000).toISOString(),
          },
        }),
      ],
    });

    expect(models.interrupts[0]).toMatchObject({
      id: "human-expired",
      status: "expired",
      resumeOutcome: "expired before resume",
    });
    expect(models.runs[0]).toMatchObject({
      status: "interrupted",
      interruptStatus: "expired",
      durationMs: 1_000,
      result: "Input expired at fetchDiscoveryCanvasInputs",
    });
    expect(models.sessions[0]).toMatchObject({
      status: "interrupted",
      interruptStatus: "expired",
      latestResult: "Input expired at fetchDiscoveryCanvasInputs",
    });
  });

  it("redacts capability secrets from Studio detail events", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [revision()],
      rates: [],
      events: [
        event(0, {
          eventId: "secret-event",
          type: "interrupt.created",
          payload: {
            interruptId: "human-secret",
            resumeToken: "do-not-expose",
            nested: {
              api_key: "also-secret",
              totalTokenCount: 42,
              safe: "visible",
            },
          },
        }),
      ],
    });

    expect(models.detailEvents[0]?.payload).toEqual({
      interruptId: "human-secret",
      resumeToken: "[REDACTED]",
      nested: {
        api_key: "[REDACTED]",
        totalTokenCount: 42,
        safe: "visible",
      },
    });
  });

  it("projects static, dynamic, and free-form interrupt semantics truthfully", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [revision()],
      rates: [],
      events: [
        event(0, {
          eventId: "static-created",
          type: "interrupt.created",
          payload: {
            interruptId: "static-1",
            kind: "choice",
            interactionMode: "static-options",
            question: "Approve?",
            optionCount: 2,
            options: [
              { id: "approve", label: "Approve", value: "must-not-project" },
              {
                id: "revise",
                label: "Revise",
                description: "Request changes",
              },
            ],
          },
        }),
        event(100, {
          eventId: "static-cancelled",
          type: "interrupt.cancelled",
          payload: {
            interruptId: "static-1",
            reason: "cancelled_by_client",
          },
        }),
        event(200, {
          eventId: "dynamic-created",
          type: "interrupt.created",
          payload: {
            interruptId: "dynamic-1",
            kind: "choice",
            interactionMode: "dynamic-picker",
            schemaId: "pick-agent",
            schemaVersion: "1",
            optionCount: 0,
          },
        }),
        event(300, {
          eventId: "dynamic-resolved",
          type: "interrupt.resolved",
          payload: {
            interruptId: "dynamic-1",
            resumeOutcome: "resumed",
            responseCaptured: false,
          },
        }),
        event(400, {
          eventId: "text-created",
          type: "interrupt.created",
          payload: {
            interruptId: "text-1",
            kind: "text",
            interactionMode: "freeform",
            optionCount: 0,
          },
        }),
        event(500, {
          eventId: "text-expired",
          type: "interrupt.expired",
          payload: { interruptId: "text-1" },
        }),
        event(600, {
          eventId: "failed-created",
          type: "interrupt.created",
          payload: {
            interruptId: "failed-1",
            kind: "choice",
            interactionMode: "dynamic-picker",
            schemaId: "pick-agent",
            optionCount: 0,
          },
        }),
        event(700, {
          eventId: "failed-response",
          type: "interrupt.resolved",
          payload: {
            interruptId: "failed-1",
            response: "agent-1",
            responseCaptured: true,
            resumeOutcome: "resumed",
          },
        }),
        event(800, {
          eventId: "failed-resume",
          type: "interrupt.resolved",
          payload: {
            interruptId: "failed-1",
            resumeOutcome: "failed",
            resumeError: "checkpoint rejected",
          },
        }),
      ],
    });

    expect(
      models.interrupts.find((interrupt) => interrupt.id === "static-1"),
    ).toMatchObject({
      status: "cancelled",
      interactionMode: "static-options",
      contentCaptured: true,
      optionCount: 2,
      options: [
        { id: "approve", label: "Approve", description: null },
        {
          id: "revise",
          label: "Revise",
          description: "Request changes",
        },
      ],
      resumeOutcome: "cancelled",
    });
    expect(
      models.interrupts.find((interrupt) => interrupt.id === "dynamic-1"),
    ).toMatchObject({
      status: "resolved",
      interactionMode: "dynamic-picker",
      schemaId: "pick-agent",
      schemaVersion: "1",
      optionCount: 0,
      options: null,
      response: null,
      responseCaptured: false,
      resumeOutcome: "resumed",
    });
    expect(
      models.interrupts.find((interrupt) => interrupt.id === "text-1"),
    ).toMatchObject({
      status: "expired",
      type: "text",
      interactionMode: "freeform",
      responseCaptured: false,
      resumeOutcome: "expired before resume",
    });
    expect(
      models.interrupts.find((interrupt) => interrupt.id === "failed-1"),
    ).toMatchObject({
      status: "failed",
      response: "agent-1",
      responseCaptured: true,
      resumeOutcome: "resume failed",
      resumeError: "checkpoint rejected",
    });
  });

  it("does not let an older failed root attempt poison a later completed attempt", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [revision()],
      rates: [],
      events: [
        event(0, {
          eventId: "first-root-start",
          type: "span.started",
          spanId: "root-1",
          payload: { name: "kortyx.run" },
        }),
        event(500, {
          eventId: "first-root-failed",
          type: "span.failed",
          spanId: "root-1",
          payload: {
            name: "kortyx.run",
            error: { message: "temporary resume failure" },
          },
        }),
        event(501, {
          eventId: "first-root-ended-after-fail",
          type: "span.ended",
          spanId: "root-1",
          payload: { name: "kortyx.run", durationMs: 501 },
        }),
        event(2_000, {
          eventId: "second-root-start",
          type: "span.started",
          spanId: "root-2",
          payload: { name: "kortyx.run" },
        }),
        event(3_000, {
          eventId: "second-root-ended",
          type: "span.ended",
          spanId: "root-2",
          payload: { name: "kortyx.run", durationMs: 1_000 },
        }),
      ],
    });

    expect(models.runs[0]).toMatchObject({
      id: "run-1",
      status: "completed",
      durationMs: 3_000,
    });
    expect(models.sessions[0]).toMatchObject({
      id: "session-1",
      status: "completed",
      failed: 0,
      succeeded: 1,
    });
  });

  it("accepts a later terminal root event when its start event was not delivered", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [revision()],
      rates: [],
      events: [
        event(0, {
          eventId: "orphan-root-start",
          type: "span.started",
          spanId: "root-1",
          payload: { name: "kortyx.run" },
        }),
        event(500, {
          eventId: "interrupt-created",
          type: "interrupt.created",
          nodeId: "fetchDiscoveryCanvasInputs",
          payload: {
            interruptId: "human-1",
            kind: "choice",
            optionCount: 0,
          },
        }),
        event(600, {
          eventId: "interrupt-resolved",
          type: "interrupt.resolved",
          nodeId: "fetchDiscoveryCanvasInputs",
          payload: {
            interruptId: "human-1",
            resumeOutcome: "resumed",
          },
        }),
        event(2_000, {
          eventId: "resumed-root-ended",
          type: "span.ended",
          spanId: "root-2",
          payload: { name: "kortyx.run", durationMs: 1_000 },
        }),
      ],
    });

    expect(models.runs).toHaveLength(1);
    expect(models.runs[0]).toMatchObject({
      id: "run-1",
      status: "completed",
      endedAt: new Date(baseTime + 2_000).toISOString(),
      durationMs: 2_000,
    });
    expect(models.sessions[0]).toMatchObject({
      id: "session-1",
      status: "completed",
      succeeded: 1,
      interrupted: 0,
      pendingInterruptId: null,
    });
    expect(models.interrupts[0]).toMatchObject({
      id: "human-1",
      status: "resolved",
    });
  });

  it("marks a start-only run incomplete after the session later terminates", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [revision()],
      rates: [],
      events: [
        event(0, {
          eventId: "abandoned-root-start",
          type: "span.started",
          runId: "run-abandoned",
          spanId: "root-abandoned",
          payload: { name: "kortyx.run" },
        }),
        event(500, {
          eventId: "abandoned-node-start",
          type: "span.started",
          runId: "run-abandoned",
          spanId: "node-abandoned",
          nodeId: "fetchDiscoveryCanvasInputs",
          payload: { name: "kortyx.node" },
        }),
        event(2_000, {
          eventId: "later-root-start",
          type: "span.started",
          runId: "run-completed",
          spanId: "root-completed",
          payload: { name: "kortyx.run" },
        }),
        event(3_000, {
          eventId: "later-root-ended",
          type: "span.ended",
          runId: "run-completed",
          spanId: "root-completed",
          payload: { name: "kortyx.run", durationMs: 1_000 },
        }),
      ],
    });

    expect(models.runs.find((run) => run.id === "run-abandoned")).toMatchObject(
      {
        status: "incomplete",
        endedAt: null,
        durationMs: null,
        result: "Telemetry ended before a terminal run event was observed.",
      },
    );
    expect(models.runs.find((run) => run.id === "run-completed")).toMatchObject(
      {
        status: "completed",
      },
    );
    expect(models.sessions[0]).toMatchObject({
      id: "session-1",
      status: "completed",
      runs: 2,
      succeeded: 1,
      failed: 0,
    });
  });

  it("keeps a resumed run running while the latest root attempt is active", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [revision()],
      rates: [],
      events: [
        event(0, {
          eventId: "first-root-start",
          type: "span.started",
          spanId: "root-1",
          payload: { name: "kortyx.run" },
        }),
        event(500, {
          eventId: "first-root-failed",
          type: "span.failed",
          spanId: "root-1",
          payload: {
            name: "kortyx.run",
            error: { message: "interrupted attempt failed during resume" },
          },
        }),
        event(1_000, {
          eventId: "interrupt-created",
          type: "interrupt.created",
          nodeId: "fetchDiscoveryCanvasInputs",
          payload: {
            interruptId: "human-1",
            kind: "choice",
            optionCount: 2,
          },
        }),
        event(1_100, {
          eventId: "interrupt-resolved",
          type: "interrupt.resolved",
          nodeId: "fetchDiscoveryCanvasInputs",
          payload: {
            interruptId: "human-1",
            resumeOutcome: "resumed",
          },
        }),
        event(2_000, {
          eventId: "second-root-start",
          type: "span.started",
          spanId: "root-2",
          payload: { name: "kortyx.run" },
        }),
      ],
    });

    expect(models.runs[0]).toMatchObject({
      id: "run-1",
      status: "running",
      endedAt: null,
      durationMs: null,
    });
    expect(models.sessions[0]).toMatchObject({
      id: "session-1",
      status: "running",
      failed: 0,
      pendingInterruptId: null,
    });
    expect(models.interrupts[0]).toMatchObject({
      id: "human-1",
      status: "resolved",
    });
  });

  it("projects workflow handoffs as Studio transitions", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [
        revision("general-chat", "revision-general"),
        revision("canvas-creation", "revision-1", "2.1.0"),
      ],
      rates: [],
      events: [
        event(0, {
          eventId: "root-start",
          type: "span.started",
          spanId: "root-1",
          workflowId: "general-chat",
          workflowRevisionId: "revision-general",
          nodeId: "classifyIntent",
          payload: { name: "kortyx.run" },
        }),
        event(500, {
          eventId: "transition",
          type: "workflow.transitioned",
          workflowId: "canvas-creation",
          workflowRevisionId: "revision-1",
          nodeId: "classifyIntent",
          payload: {
            sourceWorkflowId: "general-chat",
            sourceNodeId: "classifyIntent",
            targetWorkflowId: "canvas-creation",
          },
        }),
        event(600, {
          eventId: "source-root-end",
          type: "span.ended",
          spanId: "root-1",
          workflowId: "general-chat",
          workflowRevisionId: "revision-general",
          nodeId: "classifyIntent",
          payload: { name: "kortyx.run", durationMs: 600 },
        }),
        event(700, {
          eventId: "target-root-start",
          type: "span.started",
          spanId: "root-2",
          workflowId: "canvas-creation",
          workflowRevisionId: "revision-1",
          nodeId: "fetchDiscoveryCanvasInputs",
          payload: { name: "kortyx.run" },
        }),
        event(1_000, {
          eventId: "target-root-end",
          type: "span.ended",
          spanId: "root-2",
          workflowId: "canvas-creation",
          workflowRevisionId: "revision-1",
          nodeId: "fetchDiscoveryCanvasInputs",
          payload: { name: "kortyx.run", durationMs: 1_000 },
        }),
      ],
    });

    expect(models.workflows.workflows.map((workflow) => workflow.id)).toEqual([
      "canvas-creation",
      "general-chat",
    ]);
    expect(models.workflows.transitions[0]).toMatchObject({
      sourceWorkflowId: "general-chat",
      sourceNodeId: "classifyIntent",
      targetWorkflowId: "canvas-creation",
      volume: 1,
      successRate: 100,
    });
    expect(
      models.workflows.workflows.find(
        (workflow) => workflow.id === "general-chat",
      )?.metrics.runCount,
    ).toBe(1);
    expect(
      models.workflows.workflows.find(
        (workflow) => workflow.id === "canvas-creation",
      )?.metrics.runCount,
    ).toBe(1);
    expect(models.runs).toHaveLength(1);
    expect(models.runs[0]?.workflowId).toBe("general-chat");
    expect(models.runs[0]?.workflowIds).toEqual([
      "general-chat",
      "canvas-creation",
    ]);
    expect(models.runs[0]?.workflowRefs).toEqual([
      {
        workflowId: "general-chat",
        workflowRevisionId: "revision-general",
        declaredVersion: "1.0.0",
      },
      {
        workflowId: "canvas-creation",
        workflowRevisionId: "revision-1",
        declaredVersion: "2.1.0",
      },
    ]);
    expect(models.runs[0]?.transitionIds).toEqual([
      "general-chat:classifyIntent:canvas-creation:",
    ]);
    expect(models.sessions[0]).toMatchObject({
      id: "session-1",
      workflowIds: ["general-chat", "canvas-creation"],
      workflowCount: 2,
      activeWorkflowId: "canvas-creation",
      activeVersion: "2.1.0",
    });
  });

  it("projects declared topology handoffs before runtime traffic exists", () => {
    const models = createStudioReadModelsFromRecords({
      revisions: [
        revision("general-chat", "revision-general", [
          {
            sourceNodeId: "classifyIntent",
            targetWorkflowId: "canvas-creation",
          },
        ]),
        revision(),
      ],
      rates: [],
      events: [],
    });

    expect(models.workflows.transitions[0]).toMatchObject({
      sourceWorkflowId: "general-chat",
      sourceNodeId: "classifyIntent",
      targetWorkflowId: "canvas-creation",
      volume: 0,
      successRate: null,
    });
  });
});
