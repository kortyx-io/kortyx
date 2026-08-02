import type { StudioDetailEvent } from "@kortyx/telemetry-contracts";
import { describe, expect, it } from "vitest";
import { buildEventStory } from "./run-event-story";
import {
  buildTimelineScale,
  buildTraceStory,
  isControlFlowInterrupt,
} from "./run-trace-story";

const START = "2026-07-21T00:00:00.000Z";

describe("buildEventStory", () => {
  it("orders lifecycle facts at the same timestamp and assigns execution phases", () => {
    const events = [
      detailEvent("resume", "span.started", 2_000, {
        name: "kortyx.run",
      }),
      detailEvent("resolved", "interrupt.resolved", 2_000, {
        interruptId: "interrupt-1",
      }),
      detailEvent("initial", "span.started", 0, {
        name: "kortyx.run",
      }),
      detailEvent("transition", "workflow.transitioned", 1_000, {
        sourceWorkflowId: "general-chat",
        targetWorkflowId: "canvas-creation",
      }),
    ];

    const story = buildEventStory(events, START);

    expect(story.map((item) => item.event.id)).toEqual([
      "initial",
      "transition",
      "resolved",
      "resume",
    ]);
    expect(story.find((item) => item.event.id === "initial")?.phase).toBe(1);
    expect(story.find((item) => item.event.id === "resume")?.phase).toBe(2);
    expect(story.find((item) => item.event.id === "transition")?.title).toBe(
      "general-chat → canvas-creation",
    );
  });

  it("presents GraphInterrupt failures as interrupted control flow", () => {
    const failure = detailEvent(
      "paused",
      "span.failed",
      500,
      {
        name: "kortyx.node",
        error: { name: "GraphInterrupt", message: "Pause" },
      },
      { nodeId: "collectBrief" },
    );

    const [item] = buildEventStory([failure], START);

    expect(item?.state).toBe("interrupted");
    expect(item?.title).toBe("collectBrief paused");
  });
});

describe("buildTraceStory", () => {
  it("models resumed execution as a continuation rather than a retry attempt", () => {
    const events = [
      detailEvent(
        "run-1",
        "span.started",
        0,
        { name: "kortyx.run" },
        { spanId: "run-span-1" },
      ),
      detailEvent(
        "run-1-end",
        "span.ended",
        1_000,
        { name: "kortyx.run", durationMs: 1_000 },
        { spanId: "run-span-1" },
      ),
      detailEvent("interrupt", "interrupt.created", 900, {
        interruptId: "interrupt-1",
      }),
      detailEvent("resolved", "interrupt.resolved", 5_000, {
        interruptId: "interrupt-1",
      }),
      detailEvent(
        "run-2",
        "span.started",
        5_500,
        { name: "kortyx.run" },
        { spanId: "run-span-2" },
      ),
      detailEvent(
        "run-2-end",
        "span.ended",
        6_500,
        { name: "kortyx.run", durationMs: 1_000 },
        { spanId: "run-span-2" },
      ),
    ];

    const executions = buildTraceStory(events).filter(
      (item) => item.kind === "execution",
    );

    expect(executions).toHaveLength(2);
    expect(executions.map((item) => item.executionRole)).toEqual([
      "initial",
      "resumed",
    ]);
    expect(executions[1]?.label).toBe("Run resumed");
  });

  it("compresses long unobserved waits without changing wall-clock duration", () => {
    const events = [
      detailEvent("first", "session.checkpointed", 0),
      detailEvent("second", "session.checkpointed", 1_000),
      detailEvent("third", "session.checkpointed", 31_000),
    ];

    const scale = buildTimelineScale(events, START);

    expect(scale.wallDurationMs).toBe(31_000);
    expect(scale.gaps).toHaveLength(1);
    expect(scale.gaps[0]?.actualDurationMs).toBe(30_000);
    expect(scale.visibleDurationMs).toBeLessThan(scale.wallDurationMs);
    expect(scale.toPercent(scale.endMs)).toBe(100);
  });
});

describe("isControlFlowInterrupt", () => {
  it("distinguishes GraphInterrupt from operational failures", () => {
    expect(
      isControlFlowInterrupt(
        detailEvent("pause", "span.failed", 0, {
          error: { name: "GraphInterrupt" },
        }),
      ),
    ).toBe(true);
    expect(
      isControlFlowInterrupt(
        detailEvent("failure", "span.failed", 0, {
          error: { name: "ProviderError" },
        }),
      ),
    ).toBe(false);
  });
});

function detailEvent(
  id: string,
  type: StudioDetailEvent["type"],
  offsetMs: number,
  payload: Record<string, unknown> = {},
  overrides: Partial<StudioDetailEvent> = {},
): StudioDetailEvent {
  const occurredAt = new Date(Date.parse(START) + offsetMs).toISOString();
  return {
    id,
    type,
    occurredAt,
    receivedAt: occurredAt,
    environment: "test",
    serviceName: "studio-test",
    deploymentRef: null,
    traceId: "trace-1",
    spanId: null,
    parentSpanId: null,
    runId: "run-1",
    sessionId: "session-1",
    workflowId: "general-chat",
    workflowRevisionId: null,
    nodeId: null,
    userId: null,
    tenantId: null,
    tags: [],
    metadata: null,
    payload,
    ...overrides,
  };
}
