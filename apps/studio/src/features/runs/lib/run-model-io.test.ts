import type { StudioDetailEvent } from "@kortyx/telemetry-contracts";
import { describe, expect, it } from "vitest";
import {
  buildModelExchanges,
  buildModelOperationEntries,
  buildModelOperations,
  type ModelExchange,
  type ModelOperation,
  modelInputSegments,
} from "./run-model-io";

it("shows one chronological operation without repeating provider inputs or empty outputs", () => {
  const prompt = [
    { role: "system", content: "instructions" },
    { role: "user", content: "Which Victor?" },
  ];
  const request = {
    role: "assistant",
    content: "",
    toolCalls: [
      {
        name: "kortyx_request_input__candidatePicker",
        input: { question: "Which?" },
      },
    ],
  };
  const response = { role: "tool", content: '{"type":"select","id":"a"}' };
  const toolCall = {
    role: "assistant",
    content: "",
    toolCalls: [{ name: "read_candidate", input: { id: "a" } }],
  };
  const toolResult = { role: "tool", content: "Victor A is shortlisted" };
  const base: ModelExchange = {
    id: "first",
    opId: "reason",
    reasonId: "sift",
    reasonSpanId: "span",
    invocationId: "invocation",
    nodeId: "sift",
    workflowId: "workflow",
    occurredAt: "2026-09-25T12:00:00.000Z",
    provider: "openai",
    model: "model",
    emitted: false,
    streamed: true,
    format: "unknown",
    status: "incomplete",
    inputCaptured: true,
    input: prompt,
    outputCaptured: false,
    output: undefined,
    structuredOutputCaptured: false,
    structuredOutput: undefined,
    finishReason: undefined,
    durationMs: null,
  };
  const second: ModelExchange = {
    ...base,
    id: "second",
    occurredAt: "2026-09-25T12:00:04.000Z",
    input: [...prompt, request, response],
    outputCaptured: true,
    output: "",
    format: "tool-calls",
    status: "completed",
  };
  const third: ModelExchange = {
    ...second,
    id: "third",
    occurredAt: "2026-09-25T12:00:07.000Z",
    input: [...prompt, request, response, toolCall, toolResult],
    output: '{"answer":"Victor A is shortlisted"}',
    format: "structured",
  };
  const operation: ModelOperation = {
    id: "reason",
    reasonId: "sift",
    model: "model",
    nodeId: "sift",
    workflowId: "workflow",
    attempts: [base, second, third],
    interruptCount: 1,
    explicitInterruptCount: 0,
    steps: [
      { kind: "model", occurredAt: base.occurredAt, exchange: base },
      {
        kind: "milestone",
        id: "checkpoint",
        occurredAt: "2026-09-25T12:00:02.000Z",
        label: "Execution checkpoint saved",
      },
      {
        kind: "milestone",
        id: "resume",
        occurredAt: "2026-09-25T12:00:03.000Z",
        label: "Execution resumed",
      },
      { kind: "model", occurredAt: second.occurredAt, exchange: second },
      {
        kind: "tool",
        id: "tool",
        occurredAt: "2026-09-25T12:00:06.000Z",
        label: "read_candidate",
        status: "completed",
      },
      { kind: "model", occurredAt: third.occurredAt, exchange: third },
    ],
  };

  expect(
    buildModelOperationEntries(operation).map((entry) =>
      entry.kind === "payload" ? entry.title : entry.label,
    ),
  ).toEqual([
    "Model input · full messages",
    "Human input requested by model",
    "Execution checkpoint saved",
    "Execution resumed",
    "Human response returned to model",
    "Earlier model tool request",
    "read_candidate tool completed",
    "Tool result returned to model",
    "Raw model output",
  ]);
});

it("separates a model's human-input request and response from its initial prompt", () => {
  const messages = [
    { role: "system", content: "instructions" },
    { role: "user", content: "Which Victor?" },
    {
      role: "assistant",
      content: "",
      toolCalls: [
        {
          name: "kortyx_request_input__candidatePicker",
          input: { question: "Which?" },
        },
      ],
    },
    { role: "tool", content: '{"type":"select","id":"a"}' },
  ];
  const segments = modelInputSegments(messages);
  expect(segments.map((segment) => segment.title)).toEqual([
    "Initial model input",
    "Human input requested by model",
    "Human response returned to model",
  ]);
  expect(segments.flatMap((segment) => segment.value as unknown[])).toEqual(
    messages,
  );
});

const event = (
  id: string,
  type: string,
  spanId: string,
  parentSpanId: string | null,
  payload: Record<string, unknown>,
): StudioDetailEvent => ({
  id,
  type,
  spanId,
  parentSpanId,
  payload,
  occurredAt: "2026-09-25T12:00:00.000Z",
  receivedAt: "2026-09-25T12:00:00.000Z",
  environment: "test",
  serviceName: "test",
  deploymentRef: null,
  traceId: "trace",
  runId: "run",
  sessionId: null,
  workflowId: "workflow",
  workflowRevisionId: null,
  nodeId: "node",
  userId: null,
  tenantId: null,
  tags: [],
  metadata: null,
});

describe("buildModelExchanges", () => {
  it("keeps exact submitted messages and pairs the final structured result with the last model step", () => {
    const messages = [{ role: "system", content: "full prompt" }];
    const events = [
      event("reason", "span.started", "reason", null, {
        name: "useReason",
        attributes: { emit: true, hasOutputSchema: true },
      }),
      event("first", "span.started", "first", "reason", {
        name: "runReasonEngine",
        input: messages,
        attributes: { providerId: "openai", modelId: "model", stream: true },
      }),
      event("first-end", "span.ended", "first", "reason", {
        name: "runReasonEngine",
        output: "",
      }),
      event("first-generation", "generation.completed", "first", "reason", {
        finishReason: { unified: "tool-calls" },
      }),
      event("second", "span.started", "second", "reason", {
        name: "runReasonEngine",
        input: [...messages, { role: "tool", content: "result" }],
        attributes: { providerId: "openai", modelId: "model", stream: false },
      }),
      event("second-end", "span.ended", "second", "reason", {
        name: "runReasonEngine",
        output: '{"answer":"yes"}',
      }),
      event("reason-end", "span.ended", "reason", null, {
        name: "useReason",
        output: { answer: "yes" },
      }),
    ];

    const [first, second] = buildModelExchanges(events);
    expect(first).toMatchObject({
      input: messages,
      output: "",
      inputCaptured: true,
      outputCaptured: true,
      structuredOutputCaptured: false,
      emitted: true,
      streamed: true,
      format: "tool-calls",
    });
    expect(second).toMatchObject({
      output: '{"answer":"yes"}',
      structuredOutput: { answer: "yes" },
      emitted: true,
      streamed: false,
      format: "structured",
    });
  });

  it("distinguishes uncaptured content from empty text and incomplete calls", () => {
    const [item] = buildModelExchanges([
      event("start", "span.started", "model", null, {
        name: "runReasonEngine",
        attributes: { modelId: "model" },
      }),
    ]);
    expect(item).toMatchObject({
      status: "incomplete",
      inputCaptured: false,
      outputCaptured: false,
      emitted: null,
      streamed: null,
      format: "unknown",
    });
  });

  it("classifies streamed plain text separately from buffered text", () => {
    const items = buildModelExchanges([
      event("stream", "span.started", "stream", null, {
        name: "runReasonEngine",
        attributes: { stream: true },
      }),
      event("stream-end", "span.ended", "stream", null, {
        name: "runReasonEngine",
        output: "Hello",
      }),
      event("buffer", "span.started", "buffer", null, {
        name: "runReasonEngine",
        attributes: { stream: false },
      }),
      event("buffer-end", "span.ended", "buffer", null, {
        name: "runReasonEngine",
        output: "Hello",
      }),
    ]);
    expect(items.map((item) => item.format)).toEqual(["text-delta", "text"]);
  });

  it("groups resumed provider attempts by opId without hiding an unclosed attempt", () => {
    const at = (item: StudioDetailEvent, second: number) => ({
      ...item,
      occurredAt: `2026-09-25T12:00:${String(second).padStart(2, "0")}.000Z`,
    });
    const events = [
      at(
        event("reason-1", "span.started", "reason-1", null, {
          name: "useReason",
          attributes: { id: "sift", opId: "same-op" },
        }),
        0,
      ),
      at(
        event("model-1", "span.started", "model-1", "reason-1", {
          name: "runReasonEngine",
          invocationId: "child-invocation",
          attributes: { modelId: "model", opId: "same-op" },
        }),
        1,
      ),
      at(
        event("interrupt", "interrupt.created", "", null, {
          workflowCallPath: [{ invocationId: "child-invocation" }],
        }),
        2,
      ),
      at(event("checkpoint", "session.checkpointed", "", null, {}), 2),
      at(
        event("reason-2", "span.started", "reason-2", null, {
          name: "useReason",
          attributes: { id: "sift", opId: "same-op" },
        }),
        3,
      ),
      at(
        event("model-2", "span.started", "model-2", "reason-2", {
          name: "runReasonEngine",
          invocationId: "child-invocation",
          attributes: { modelId: "model", opId: "same-op" },
        }),
        4,
      ),
      at(
        event("model-2-end", "span.ended", "model-2", "reason-2", {
          name: "runReasonEngine",
          output: "",
        }),
        5,
      ),
      at(
        event("tool", "tool.started", "tool", "reason-2", {
          name: "read_candidate",
        }),
        6,
      ),
      at(
        event("tool-end", "tool.completed", "tool", "reason-2", {
          name: "read_candidate",
          outcome: "success",
        }),
        7,
      ),
      at(
        event("model-3", "span.started", "model-3", "reason-2", {
          name: "runReasonEngine",
          invocationId: "child-invocation",
          attributes: { modelId: "model", opId: "same-op" },
        }),
        8,
      ),
      at(
        event("model-3-end", "span.ended", "model-3", "reason-2", {
          name: "runReasonEngine",
          output: "answer",
        }),
        9,
      ),
      at(
        event("reason-2-end", "span.ended", "reason-2", null, {
          name: "useReason",
          attributes: { interruptCount: 1 },
        }),
        10,
      ),
      at(
        event("separate-reason", "span.started", "separate-reason", null, {
          name: "useReason",
          attributes: { id: "sift", opId: "another-op" },
        }),
        11,
      ),
      at(
        event(
          "separate-model",
          "span.started",
          "separate-model",
          "separate-reason",
          {
            name: "runReasonEngine",
            attributes: { modelId: "model", opId: "another-op" },
          },
        ),
        12,
      ),
    ];
    const operations = buildModelOperations(events);
    expect(operations).toHaveLength(2);
    expect(operations[0].attempts.map((attempt) => attempt.status)).toEqual([
      "incomplete",
      "completed",
      "completed",
    ]);
    expect(operations[0].interruptCount).toBe(1);
    expect(operations[0].explicitInterruptCount).toBe(1);
    expect(operations[0].steps.map((step) => step.kind)).toEqual([
      "model",
      "milestone",
      "milestone",
      "model",
      "tool",
      "model",
    ]);
    expect(operations[1].attempts).toHaveLength(1);
  });
});
