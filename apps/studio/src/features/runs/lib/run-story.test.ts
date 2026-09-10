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

it("shows aborted execution and child spans as cancelled in event and trace views", () => {
  const events = [
    detailEvent(
      "root-start",
      "span.started",
      0,
      { name: "kortyx.run" },
      { spanId: "root" },
    ),
    detailEvent(
      "child-start",
      "span.started",
      1,
      { name: "kortyx.workflow.call" },
      { spanId: "child", parentSpanId: "root" },
    ),
    detailEvent(
      "child-abort",
      "span.failed",
      20,
      {
        name: "kortyx.workflow.call",
        error: { name: "AbortError", message: "Execution cancelled." },
      },
      { spanId: "child", parentSpanId: "root" },
    ),
    detailEvent(
      "root-abort",
      "span.failed",
      21,
      {
        name: "kortyx.run",
        error: { name: "AbortError", message: "Execution cancelled." },
      },
      { spanId: "root" },
    ),
    detailEvent(
      "root-end",
      "span.ended",
      22,
      { name: "kortyx.run" },
      { spanId: "root" },
    ),
    detailEvent("cancel", "run.cancelled", 22, { reason: "execution_aborted" }),
  ];
  const story = buildEventStory(events, START);
  expect(
    story
      .filter((item) => item.event.type === "span.failed")
      .map((item) => item.state),
  ).toEqual(["cancelled", "cancelled"]);
  expect(
    story.find((item) => item.event.id === "child-abort")?.title,
  ).toContain("cancelled");
  expect(story.find((item) => item.event.id === "root-end")?.state).toBe(
    "cancelled",
  );
  expect(story.find((item) => item.event.id === "root-end")?.title).toContain(
    "ended after cancellation",
  );
  const trace = buildTraceStory(events);
  expect(trace.find((item) => item.id === "root-start")?.status).toBe(
    "cancelled",
  );
  expect(trace.find((item) => item.id === "child-start")?.status).toBe(
    "cancelled",
  );
  expect(trace.find((item) => item.id === "cancel")?.label).toBe(
    "Run cancelled",
  );
});

it("shows limit exhaustion and its span endings as a pause instead of failure or success", () => {
  const events = [
    detailEvent(
      "start",
      "span.started",
      0,
      { name: "kortyx.run" },
      { spanId: "limit-span" },
    ),
    detailEvent(
      "blocked",
      "span.failed",
      20,
      {
        name: "kortyx.run",
        error: { name: "ExecutionLimitReachedError", message: "Limit reached" },
      },
      { spanId: "limit-span" },
    ),
    detailEvent(
      "end",
      "span.ended",
      21,
      { name: "kortyx.run" },
      { spanId: "limit-span" },
    ),
    detailEvent("limit", "run.limit_reached", 22, {
      limit: "maxToolCalls",
      maximum: 2,
      consumed: 2,
    }),
    detailEvent("wait", "interrupt.created", 23, {
      interruptId: "limit-request",
      question: "Limit reached — Continue?",
    }),
  ];
  const story = buildEventStory(events, START);
  expect(story.find((x) => x.event.id === "end")).toMatchObject({
    state: "interrupted",
  });
  expect(story.find((x) => x.event.id === "limit")).toMatchObject({
    state: "interrupted",
    title: "Limit reached — Continue?",
    description: expect.stringContaining("2/2"),
  });
  expect(isControlFlowInterrupt(events[1]!)).toBe(true);
});
