import { expect, it, vi } from "vitest";
import {
  compactEvalObservation,
  createEvalJudgeEvidence,
  getEvalGradeEvidence,
  validateEvidenceFilters,
} from "../src/evals/evidence";
import {
  createEvalJudge,
  createEvals,
  type EvalEvidencePolicy,
  type EvalGradeInput,
  EvalManifestSchema,
  type EvalObservation,
  type EvalRunResult,
  EvalRunResultSchema,
  type EvalSuite,
  EvalSuiteSchema,
  getEvalSuiteRevision,
} from "../src/evals/index";

const output = {
  streamId: "answer",
  dataType: "app.answer",
  schemaId: "answer",
  schemaVersion: "1",
  status: "done",
  data: { text: "Paris" },
};
const final = {
  type: "structured-data",
  kind: "final",
  streamId: output.streamId,
  dataType: output.dataType,
  schemaId: output.schemaId,
  schemaVersion: output.schemaVersion,
  data: output.data,
};
const start = {
  type: "tool-call-start",
  toolCallId: "read",
  tool: "lookup",
  input: { id: "1" },
};
const result = {
  type: "tool-call-result",
  toolCallId: "read",
  tool: "lookup",
  content: "Paris",
  structuredContent: { city: "Paris" },
};
const observation: EvalObservation = {
  type: "answer",
  text: "Paris",
  structured: [output],
  events: [
    { type: "status", message: "Reading" },
    start,
    ...Array.from({ length: 134 }, () => ({
      type: "structured-data",
      kind: "text-delta",
      path: "text",
      delta: "draft",
      streamId: "answer",
    })),
    result,
    final,
    { type: "text-delta", delta: "Paris" },
    { type: "message", content: "Paris" },
    { type: "done" },
  ],
};
const suite: EvalSuite = {
  id: "cities",
  cases: [
    {
      id: "paris",
      steps: [
        { message: "Find city", expect: { type: "answer" } },
        {
          message: "Explain it",
          expect: {
            type: "answer",
            outputs: [{ schemaId: "answer" }],
            criteria: [
              "Use app.answer.data.text and verify it against lookup results.",
            ],
          },
        },
      ],
    },
  ],
};
const verdict = { passed: true, reason: "Correct", evidence: ["Paris"] };

it("drops streaming noise and exact final copies without mutating capture or losing tools", () => {
  const before = structuredClone(observation);
  const compact = compactEvalObservation(observation);
  expect(compact).toEqual({ ...observation, events: [start, result] });
  expect(JSON.stringify(compact).length).toBeLessThan(
    JSON.stringify(observation).length / 5,
  );
  expect(compactEvalObservation(compact)).toEqual(compact);
  expect(observation).toEqual(before);
  compact.text = "changed";
  expect(observation.text).toBe("Paris");
});

it("retains failures, incomplete/parallel tool calls, interrupts, and invalidation order", () => {
  const events = [
    start,
    { ...start, toolCallId: "parallel" },
    final,
    {
      type: "structured-data-invalidated",
      streamId: "answer",
      checkpointId: "rollback",
    },
    final,
    { type: "tool-call-error", toolCallId: "read", message: "Unavailable" },
    { type: "error", message: "Failure" },
    { type: "limit-reached", limit: "tools", maximum: 2, consumed: 2 },
    { type: "cancelled", reason: "Stopped" },
    { type: "tool-result", tool: "legacy", content: "Result" },
    {
      type: "interrupt",
      requestId: "choose",
      input: { question: "Which city?" },
    },
  ];
  const interrupt = {
    requestId: "choose",
    kind: "choice" as const,
    question: "Which city?",
    options: [{ id: "paris", label: "Paris" }],
  };
  const compact = compactEvalObservation({
    ...observation,
    type: "interrupt",
    interrupt,
    events,
  });
  expect(compact.events).toEqual(events);
  expect(compact.interrupt).toEqual(interrupt);
  expect(
    compactEvalObservation({ ...observation, structured: [], events: [final] })
      .events,
  ).toEqual([final]);
  expect(
    compactEvalObservation({
      ...observation,
      events: [null, 3, [], { type: "private" }],
    }).events,
  ).toEqual([]);
  const { events: _, ...legacy } = observation;
  expect(compactEvalObservation(legacy)).toEqual(legacy);
});

it("selects events and outputs independently, including event-only finals, without leaking excluded data", () => {
  const internal = {
    ...output,
    streamId: "plan",
    dataType: "app.plan",
    schemaId: "plan",
    data: { text: "INTERNAL" },
  };
  const source = {
    ...observation,
    structured: [output, internal, "legacy"],
    events: [...observation.events!, { ...final, ...internal }],
  };
  expect(
    compactEvalObservation(source, {
      events: false,
      outputs: [{ schemaId: "answer", schemaVersion: "1" }],
    }),
  ).toEqual({ ...source, events: [], structured: [output] });
  expect(
    compactEvalObservation(source, {
      events: ["tool-call-result"],
      outputs: false,
    }),
  ).toEqual({ ...source, events: [result], structured: [] });
  expect(
    compactEvalObservation(source, { outputs: [{ dataType: "app.answer" }] })
      .structured,
  ).toEqual([output]);
  expect(
    JSON.stringify(compactEvalObservation(source, { outputs: [] })),
  ).not.toContain("INTERNAL");
  expect(compactEvalObservation(source, { outputs: false }).events).toEqual([
    start,
    result,
  ]);
  expect(
    compactEvalObservation({
      ...observation,
      structured: [{ ...output, data: { text: "Lyon" } }],
    }).events,
  ).toContainEqual(final);
  expect(
    compactEvalObservation({
      ...observation,
      events: [{ ...final, streamId: undefined } as never],
    }).events,
  ).toHaveLength(1);
});

it("runs registered synchronous predicates on isolated copies and validates registrations", () => {
  const filters = {
    events: {
      lookup: vi.fn((event: { type: string }, params?: unknown) => {
        expect(params).toEqual({ chosen: true });
        return event.type === "tool-call-result";
      }),
    },
    outputs: {
      answer: vi.fn((value: unknown) => {
        const item = value as typeof output;
        const chosen = item.dataType === "app.answer";
        item.data.text = "mutated";
        return chosen;
      }),
    },
  };
  const policy: EvalEvidencePolicy = {
    events: { using: "lookup", params: { chosen: true } },
    outputs: { using: "answer" },
  };
  validateEvidenceFilters(policy, filters);
  const compact = compactEvalObservation(observation, policy, filters);
  expect(compact.events).toEqual([result]);
  expect(compact.structured).toEqual([output]);
  expect(output.data.text).toBe("Paris");
  expect(filters.events.lookup).toHaveBeenCalledTimes(2);
  expect(() =>
    validateEvidenceFilters({ outputs: { using: "absent" } }, {}),
  ).toThrow("Unknown outputs");
  expect(() =>
    validateEvidenceFilters({ events: { using: "toString" } }, {}),
  ).toThrow("Unknown events");
  expect(() =>
    compactEvalObservation(observation, { events: { using: "absent" } }),
  ).toThrow("not registered");
  expect(() =>
    compactEvalObservation(
      observation,
      { events: { using: "bad" } },
      { events: { bad: (() => "yes") as never } },
    ),
  ).toThrow("synchronously");
});

it("merges defaults into serializable suites, pins the revision, and filters current and earlier steps", async () => {
  const grade = vi.fn((_input: EvalGradeInput) => verdict);
  const configured = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [{ ...suite, evidence: { history: true, events: false } }],
    defaults: {
      evidence: { history: false, outputs: [{ dataType: "app.answer" }] },
    },
    execute: () => ({ observation }),
    judge: { id: "test", version: "1", grade },
  });
  expect(configured.listSuites()[0]?.evidence).toEqual({
    history: true,
    events: false,
    outputs: [{ dataType: "app.answer" }],
  });
  expect(
    EvalManifestSchema.parse(configured.describe()).suites[0]?.evidence,
  ).toEqual(configured.listSuites()[0]?.evidence);
  const run = await configured.run({ suiteId: suite.id });
  expect(run.status).toBe("passed");
  expect(run.suiteRevision).toBe(
    getEvalSuiteRevision(configured.listSuites()[0]!),
  );
  expect(run.suiteRevision).not.toBe(getEvalSuiteRevision(suite));
  expect(EvalRunResultSchema.parse(JSON.parse(JSON.stringify(run)))).toEqual(
    run,
  );
  const input = grade.mock.calls[0]![0];
  expect(input.observation.events).toEqual([]);
  expect(input.conversation).toHaveLength(1);
  expect(input.conversation[0]?.observation.events).toEqual([]);
  expect(input.conversation[0]).not.toHaveProperty("evidence");
  expect(run.cases[0]?.steps[0]?.observation).toEqual(observation);
  expect(run.cases[0]?.steps[1]?.evidence?.version).toBe("compact-v1");
});

it("history=false changes only grading, and filters cannot bypass deterministic output requirements", async () => {
  const grade = vi.fn((_input: EvalGradeInput) => verdict);
  const execute = vi.fn(() => ({ observation }));
  const run = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    defaults: { evidence: { history: false, events: false, outputs: false } },
    execute,
    judge: { id: "test", version: "1", grade },
  }).run({ suiteId: suite.id });
  expect(run.status).toBe("passed");
  expect(grade.mock.calls[0]?.[0].conversation).toEqual([]);
  expect(grade.mock.calls[0]?.[0].observation).toEqual({
    ...observation,
    structured: [],
    events: [],
  });
  const denied = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    defaults: { evidence: { outputs: false } },
    execute: () => ({ observation: { ...observation, structured: [] } }),
    judge: { id: "test", version: "1", grade },
  }).run({ suiteId: suite.id });
  expect(denied.status).toBe("failed");
  expect(grade).toHaveBeenCalledOnce();
});

it("captures custom selections for Studio without shipping callback code", async () => {
  const run = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [{ ...suite, evidence: { events: { using: "results" } } }],
    evidenceFilters: {
      events: { results: (event) => event.type === "tool-call-result" },
    },
    execute: () => ({ observation }),
  }).run({ suiteId: suite.id, grading: "studio" });
  const restored = EvalRunResultSchema.parse(
    JSON.parse(JSON.stringify(run)),
  ) as EvalRunResult;
  const steps = restored.cases[0]!.steps;
  expect(
    getEvalGradeEvidence(steps[1]!, steps.slice(0, 1)).observation.events,
  ).toEqual([result]);
  expect(
    getEvalGradeEvidence(steps[1]!, steps.slice(0, 1)).conversation[0]
      ?.observation.events,
  ).toEqual([result]);
  const { evidence: _, ...old } = steps[1]!;
  expect(getEvalGradeEvidence(old, [old]).observation.events).toEqual([
    start,
    result,
  ]);
  expect(
    getEvalGradeEvidence(old, [old]).conversation[0]?.observation.events,
  ).toEqual([start, result]);
  expect(createEvalJudgeEvidence(observation, { history: false }).history).toBe(
    false,
  );
});

it("rejects invalid selectors at setup and reports predicate failures as grading errors without losing capture", async () => {
  for (const evidence of [
    { events: ["text-delta"] },
    { outputs: [{}] },
    { history: "yes" },
    { events: () => true },
  ])
    expect(EvalSuiteSchema.safeParse({ ...suite, evidence }).success).toBe(
      false,
    );
  expect(() =>
    createEvals({
      agent: { streamChat: vi.fn() },
      suites: [{ ...suite, evidence: { events: { using: "missing" } } }],
    }),
  ).toThrow("Unknown events");
  const grade = vi.fn(() => verdict);
  const run = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    defaults: { evidence: { events: { using: "broken" } } },
    evidenceFilters: {
      events: {
        broken: () => {
          throw new Error("PRIVATE FAILURE");
        },
      },
    },
    execute: () => ({ observation }),
    judge: { id: "test", version: "1", grade },
  }).run({ suiteId: suite.id });
  expect(run.status).toBe("error");
  expect(run.cases[0]?.errors[0]?.phase).toBe("grading");
  expect(run.cases[0]?.steps[0]?.observation).toEqual(observation);
  expect(grade).not.toHaveBeenCalled();
  expect(JSON.stringify(run)).not.toContain("PRIVATE FAILURE");
});

it("direct model judges compact both observations and explain field selection without assuming visibility", async () => {
  const invoke = vi.fn(async (_messages: { content: string }[]) => ({
    content: JSON.stringify(verdict),
  }));
  const judge = createEvalJudge({
    model: {
      modelId: "test",
      provider: {
        id: "test",
        models: ["test"],
        getModel: () => ({ invoke, stream: async function* () {} }),
      },
    },
  });
  const previous = {
    index: 0,
    input: { message: "Find city" },
    expectation: { type: "answer" as const },
    observation,
    status: "passed" as const,
    criteria: [],
  };
  await judge.grade({
    criterion: { id: "answer", text: "Evaluate app.answer.data.text" },
    input: { message: "Explain it" },
    observation,
    conversation: [previous],
    signal: new AbortController().signal,
  });
  const messages = invoke.mock.calls[0]![0];
  const payload = JSON.parse(messages[1]!.content);
  expect(payload.observation.events).toEqual([start, result]);
  expect(payload.conversation[0].observation.events).toEqual([start, result]);
  expect(messages[0]!.content).toContain("not proof of frontend visibility");
  expect(messages[0]!.content).toContain("insufficient evidence");
  expect(judge.version).toBe("kortyx-rubric-v4");
});

it("cannot reintroduce an output rejected by a predicate through different event metadata", () => {
  const source = {
    ...observation,
    events: [{ ...final, opId: "event-only-metadata" }],
  };
  const compact = compactEvalObservation(
    source,
    { outputs: { using: "source-check" } },
    {
      outputs: {
        "source-check": (value) =>
          value !== null && typeof value === "object" && "opId" in value,
      },
    },
  );
  expect(compact.structured).toEqual([]);
  expect(compact.events).toEqual([]);
});
