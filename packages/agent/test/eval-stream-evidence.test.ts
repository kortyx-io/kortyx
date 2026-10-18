// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import { defineWorkflow } from "@kortyx/core";
import { useReason } from "@kortyx/hooks";
import { createInMemoryFrameworkAdapter } from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import { expect, it, vi } from "vitest";
import { createAgent } from "../src/chat/create-agent";
import {
  EvalObservationSchema,
  EvalProgressSchema,
  EvalRunResultSchema,
  EvalWireEventSchema,
} from "../src/evals/contracts";
import {
  createEvalJudge,
  createEvals,
  type EvalGradeInput,
  type EvalSuite,
} from "../src/evals/index";
import { captureEvalEvent } from "../src/evals/stream-evidence";
import { StudioEvalDetailSchema } from "../src/evals/studio-contracts";
import type { ChatMessage } from "../src/types/chat-message";

const answerSuite: EvalSuite = {
  id: "salary",
  cases: [
    {
      id: "barcelona",
      steps: [
        {
          message: "Salary for Barcelona?",
          expect: {
            type: "answer",
            criteria: ["Matches the retrieved salary."],
          },
        },
      ],
    },
  ],
};

it.each([
  true,
  false,
])("captures real useReason tool evidence only when emit is %s", async (emit) => {
  const execute = vi.fn(async () => ({
    jobId: "barcelona",
    salary: "EUR 100,000",
  }));
  const invoke = vi
    .fn()
    .mockResolvedValueOnce({
      content: "",
      toolCalls: [
        { id: "read-1", name: "read_job", input: { jobId: "barcelona" } },
      ],
    })
    .mockResolvedValueOnce({ content: "Barcelona: EUR 100,000" });
  const workflow = defineWorkflow({
    id: "jobs",
    version: "1",
    nodes: {
      answer: {
        run: async () => {
          const result = await useReason({
            model: {
              provider: {
                id: "fixture",
                models: ["fixture"],
                getModel: () => ({ invoke, stream: async function* () {} }),
              },
              modelId: "fixture",
            },
            input: "Salary for Barcelona?",
            stream: false,
            emit: false,
            tools: [{ name: "read_job", inputSchema: {}, execute }],
            toolExecution: { emit, maxSteps: 3 },
          });
          return { ui: { message: result.text } };
        },
      },
    },
    edges: [
      ["__start__", "answer"],
      ["answer", "__end__"],
    ],
  });
  const grade = vi.fn((_input: EvalGradeInput) => ({
    passed: true,
    reason: "Checked evidence.",
    evidence: [],
  }));
  const result = await createEvals({
    agent: createAgent({
      workflows: [workflow],
      defaultWorkflowId: "jobs",
      frameworkAdapter: createInMemoryFrameworkAdapter(),
    }),
    suites: [answerSuite],
    judge: { id: "fixture", version: "1", grade },
  }).run({ suiteId: answerSuite.id });
  expect(result.status).toBe("passed");
  expect(execute).toHaveBeenCalledOnce();
  const events = result.cases[0]?.steps[0]?.observation.events ?? [];
  const tools = events.filter(
    (event) =>
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      String(event.type).startsWith("tool-call-"),
  );
  if (emit) {
    expect(tools).toEqual([
      expect.objectContaining({
        type: "tool-call-start",
        tool: "read_job",
        toolCallId: "read-1",
        input: { jobId: "barcelona" },
      }),
      expect.objectContaining({
        type: "tool-call-result",
        tool: "read_job",
        toolCallId: "read-1",
        structuredContent: { jobId: "barcelona", salary: "EUR 100,000" },
      }),
    ]);
    expect(JSON.stringify(tools[1])).toContain("EUR 100,000");
  } else expect(tools).toEqual([]);
  expect(grade.mock.calls[0]?.[0].observation.events).toEqual(tools);
  expect(result.cases[0]?.steps[0]?.observation.text).toBe(
    "Barcelona: EUR 100,000",
  );
  const run = {
    id: result.id,
    targetId: "hiring",
    targetName: "Hiring",
    environment: "development",
    suiteId: result.suiteId,
    suiteRevision: result.suiteRevision,
    status: result.status,
    createdAt: result.startedAt,
    startedAt: result.startedAt,
    endedAt: result.startedAt,
    error: null,
    cancelRequestedAt: null,
    counts: result.counts,
    suite: answerSuite,
    result,
    events: [],
  };
  const stored = StudioEvalDetailSchema.parse(
    JSON.parse(JSON.stringify({ run })),
  );
  expect(
    JSON.stringify(stored.run.result?.cases[0]?.steps[0]?.observation.events),
  ).toBe(JSON.stringify(events));
  expect(EvalRunResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(
    result,
  );
});

it("retains ordered evidence across a native resume without copying private transport state", async () => {
  const privateValue = "PRIVATE_RUNTIME_SECRET";
  const first: StreamChunk[] = [
    {
      type: "tool-call-start",
      tool: "read_job",
      toolCallId: "read-1",
      node: "brief",
      input: { jobId: "barcelona" },
    },
    {
      type: "tool-call-result",
      tool: "read_job",
      toolCallId: "read-1",
      node: "brief",
      content: "Barcelona: EUR 100,000",
      structuredContent: { jobId: "barcelona", salary: "EUR 100,000" },
      isError: false,
    },
    {
      type: "transition",
      transitionTo: "choose",
      payload: { accessToken: privateValue },
    },
    {
      type: "interrupt",
      requestId: "choose-1",
      resumeToken: privateValue,
      meta: { secret: privateValue },
      input: {
        kind: "choice",
        multiple: false,
        question: "Which job?",
        options: [{ id: "barcelona", label: "Barcelona" }],
        meta: { secret: privateValue },
      },
    },
  ];
  const second: StreamChunk[] = [
    { type: "text-start", node: "brief", segmentId: "answer" },
    {
      type: "text-delta",
      node: "brief",
      segmentId: "answer",
      delta: "Barcelona: ",
    },
    {
      type: "text-delta",
      node: "brief",
      segmentId: "answer",
      delta: "EUR 100,000",
    },
    { type: "text-end", node: "brief", segmentId: "answer" },
    {
      type: "tool-call-error",
      tool: "audit",
      toolCallId: "audit-1",
      message: "Audit unavailable",
    },
    { type: "text-delta", node: "brief", segmentId: "answer", delta: "." },
    {
      type: "text-delta",
      node: "other",
      segmentId: "answer",
      delta: "Other source",
    },
    { type: "done", data: { accessToken: privateValue } },
  ];
  const streamChat = vi.fn(async (messages: ChatMessage[]) => {
    const resume = messages.at(-1)?.metadata?.resume as
      | { token: string; selected: string[] }
      | undefined;
    if (resume)
      expect(resume).toMatchObject({
        token: privateValue,
        selected: ["barcelona"],
      });
    return (async function* () {
      yield* resume ? second : first;
    })();
  });
  const invoke = vi.fn(
    async (_messages: { role: string; content: string }[]) => ({
      content: JSON.stringify({
        passed: true,
        reason: "Matches retrieved data.",
        evidence: ["Barcelona: EUR 100,000"],
      }),
    }),
  );
  const suite: EvalSuite = {
    id: "choose",
    cases: [
      {
        id: "salary",
        steps: [
          { message: "Which salary?", expect: { type: "interrupt" } },
          {
            resume: { type: "select", ids: ["barcelona"] },
            expect: {
              type: "answer",
              criteria: ["Matches the selected job's retrieved salary."],
            },
          },
        ],
      },
    ],
  };
  const progress = vi.fn();
  const result = await createEvals({
    agent: { streamChat },
    suites: [suite],
    judge: createEvalJudge({
      model: {
        provider: {
          id: "judge",
          models: ["judge"],
          getModel: () => ({ invoke, stream: async function* () {} }),
        },
        modelId: "judge",
      },
    }),
  }).run({ suiteId: suite.id, onProgress: progress });
  expect(result.status).toBe("passed");
  expect(streamChat).toHaveBeenCalledTimes(2);
  const events = result.cases[0]?.steps[1]?.observation.events;
  expect(events).toEqual([
    second[0],
    { ...second[1], delta: "Barcelona: EUR 100,000" },
    second[3],
    second[4],
    second[5],
    second[6],
    { type: "done" },
  ]);
  const payload = JSON.parse(invoke.mock.calls[0]?.[0]?.[1]?.content ?? "null");
  expect(payload.conversation[0].observation.events[1]).toEqual(first[1]);
  expect(payload.observation.events).toEqual([second[4]]);
  expect(
    JSON.stringify([result, progress.mock.calls, invoke.mock.calls]),
  ).not.toContain(privateValue);
  for (const [event] of progress.mock.calls)
    expect(EvalProgressSchema.safeParse(event).success).toBe(true);
  expect(EvalWireEventSchema.parse({ type: "result", result }).type).toBe(
    "result",
  );
  expect(EvalRunResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(
    result,
  );
});

it("accepts previously stored observations without execution events", () => {
  expect(
    EvalObservationSchema.parse({
      type: "answer",
      text: "Old run",
      structured: [],
    }),
  ).toEqual({ type: "answer", text: "Old run", structured: [] });
});

// Evidence must remain useful when a tool fails, output is invalidated, or a
// workflow suspends with a custom UI. Extra transport state must never hitchhike.
const publicEvidenceChunks = [
  { type: "tool-result", tool: "legacy_read", content: "Paris" },
  {
    type: "status",
    node: "read",
    message: "Reading role",
  },
  {
    type: "structured-data-invalidated",
    streamId: "role",
    checkpointId: "rollback-1",
  },
  { type: "cancelled", runId: "run-1", reason: "User cancelled" },
  {
    type: "limit-reached",
    runId: "run-1",
    limit: "maxToolCalls",
    maximum: 5,
    consumed: 5,
  },
] satisfies StreamChunk[];
it.each(
  publicEvidenceChunks,
)("preserves public $type evidence while removing injected transport fields", (chunk) => {
  const injected = {
    ...chunk,
    accessToken: "PRIVATE",
    state: { secret: "PRIVATE" },
  };
  expect(captureEvalEvent(injected)).toEqual(chunk);
});

it("captures custom human input and falls back to its schema without leaking resume state", () => {
  const event = captureEvalEvent({
    type: "interrupt",
    requestId: "approval-1",
    resumeToken: "PRIVATE",
    input: {
      kind: "custom",
      multiple: false,
      schemaId: "approval",
      schemaVersion: "2",
      request: { title: "Approve Paris role" },
    },
  });
  expect(event).toEqual({
    type: "interrupt",
    requestId: "approval-1",
    schemaId: "approval",
    schemaVersion: "2",
    input: {
      kind: "custom",
      multiple: false,
      request: { title: "Approve Paris role" },
    },
  });
  expect(JSON.stringify(event)).not.toContain("PRIVATE");
});

it.each([
  { kind: "set" as const, path: "salary", value: 90000 },
  { kind: "append" as const, path: "cities", items: ["Paris"] },
  { kind: "text-delta" as const, path: "description", delta: "Engineer" },
  { kind: "final" as const, data: { salary: 90000 } },
])("preserves $kind structured evidence for judging and excludes private graph state", (operation) => {
  const chunk = {
    type: "structured-data" as const,
    streamId: "role",
    dataType: "job",
    ...operation,
  };
  const injected = { ...chunk, state: { secret: "PRIVATE" } };
  expect(captureEvalEvent(injected)).toEqual(chunk);
});
