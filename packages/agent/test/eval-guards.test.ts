import type { StreamChunk } from "@kortyx/stream";
import { describe, expect, it, vi } from "vitest";
import { EvalObservationSchema, parseEvalSuite } from "../src/evals/contracts";
import {
  createEvals,
  type EvalExecution,
  type EvalObservation,
  type EvalSuite,
  getEvalSuiteRevision,
} from "../src/evals/index";
import { executeEvalChat } from "../src/evals/stream";
import type { CreateEvalsOptions } from "../src/evals/types";

const answer: EvalObservation = {
  type: "answer",
  text: "Paris",
  structured: [],
};
const interrupt: EvalObservation = {
  type: "interrupt",
  text: "Choose",
  structured: [],
  interrupt: {
    requestId: "pick",
    kind: "text",
    schemaId: "picker",
    schemaVersion: "1",
    options: [],
  },
};
const suite: EvalSuite = {
  id: "jobs",
  cases: [
    { id: "one", steps: [{ message: "jobs", expect: { type: "answer" } }] },
  ],
};
const unusedAgent = {
  streamChat: vi.fn(async () => {
    throw new Error("Unexpected native call");
  }),
};
const base = {
  agent: unusedAgent,
  suites: [suite],
  execute: () => ({ observation: answer }),
};

describe("eval configuration and selection boundaries", () => {
  it("rejects ambiguous identifiers and impossible expectations", () => {
    expect(() => createEvals({ ...base, suites: [] })).toThrow(
      "At least one suite",
    );
    expect(() => createEvals({ ...base, suites: [suite, suite] })).toThrow(
      "unique suite IDs",
    );
    expect(() =>
      parseEvalSuite({ ...suite, cases: [suite.cases[0], suite.cases[0]] }),
    ).toThrow("Case IDs");
    for (const expectValue of [
      { type: "answer", schemaId: "picker" },
      { type: "answer", schemaVersion: "1" },
      { type: "answer", criteria: ["first", { id: "0", text: "second" }] },
    ])
      expect(() =>
        parseEvalSuite({
          ...suite,
          cases: [
            { id: "one", steps: [{ message: "hi", expect: expectValue }] },
          ],
        }),
      ).toThrow("Invalid suite");
    for (const judge of [
      { id: " ", version: "1" },
      { id: "judge", version: " " },
    ])
      expect(() =>
        createEvals({
          ...base,
          judge: {
            ...judge,
            grade: () => ({ passed: true, reason: "ok", evidence: [] }),
          },
        }),
      ).toThrow("ID and version");
    for (const defaults of [
      { repetitions: 0 },
      { concurrency: 1.5 },
      { caseTimeoutMs: -1 },
      { cleanupTimeoutMs: Infinity },
    ])
      expect(() => createEvals({ ...base, defaults })).toThrow(
        "positive safe integer",
      );
    expect(() =>
      EvalObservationSchema.parse({
        ...answer,
        interrupt: interrupt.interrupt,
      }),
    ).toThrow();
    expect(() =>
      EvalObservationSchema.parse({ ...interrupt, interrupt: undefined }),
    ).toThrow();
  });
  it("validates selections and overflow before execution and runs only selected cases", async () => {
    const execute = vi.fn(base.execute);
    const evals = createEvals({
      ...base,
      execute,
      suites: [
        {
          ...suite,
          cases: [suite.cases[0]!, { ...suite.cases[0]!, id: "two" }],
        },
      ],
    });
    await expect(evals.run({ suiteId: "missing" })).rejects.toThrow(
      "Unknown suite",
    );
    for (const caseIds of [[], ["one", "one"], ["missing"]])
      await expect(evals.run({ suiteId: suite.id, caseIds })).rejects.toThrow(
        "Select unique",
      );
    await expect(
      evals.run({ suiteId: suite.id, repetitions: Number.MAX_SAFE_INTEGER }),
    ).rejects.toThrow("Too many");
    expect(execute).not.toHaveBeenCalled();
    const result = await evals.run({ suiteId: suite.id, caseIds: ["two"] });
    expect(result.cases.map((value) => value.caseId)).toEqual(["two"]);
    expect(evals.describe()).toMatchObject({
      schemaVersion: 1,
      responders: [],
    });
    expect(evals.describe()).not.toHaveProperty("judge");
    expect(evals.describe()).not.toHaveProperty("paramsSchema");
  });
  it("hashes JSON object references independently of their key order", () => {
    const withReference = (reference: object): EvalSuite => ({
      ...suite,
      cases: [
        {
          id: "one",
          steps: [
            {
              message: "jobs",
              expect: { type: "answer", reference: reference as never },
            },
          ],
        },
      ],
    });
    expect(
      getEvalSuiteRevision(withReference({ z: [null, 1], a: false })),
    ).toBe(getEvalSuiteRevision(withReference({ a: false, z: [null, 1] })));
  });
});

describe("custom execution contracts and cleanup", () => {
  const waitingSuite: EvalSuite = {
    id: "waiting",
    cases: [
      {
        id: "pick",
        steps: [
          { message: "choose", expect: { type: "interrupt" } },
          {
            resume: { using: "pick", params: { city: "Paris" } },
            expect: {
              type: "answer",
              reference: { using: "facts", params: "Paris" },
            },
          },
          { message: "again", expect: { type: "answer" } },
        ],
      },
    ],
  };
  it.each([
    "function",
    "versionless",
    "versioned",
  ])("runs %s named responders with arguments and conversation history", async (kind) => {
    const respond = vi.fn(() => ({ type: "text" as const, text: "Paris" }));
    const facts = vi.fn(({ args }) => ({ city: args }));
    const execute = vi.fn(
      ({ command }: { command: { type: string } }): EvalExecution =>
        command.type === "message" && execute.mock.calls.length === 1
          ? { observation: interrupt, continuation: "private" }
          : { observation: answer },
    );
    const evals = createEvals({
      agent: unusedAgent,
      suites: [waitingSuite],
      execute,
      responders: {
        pick:
          kind === "function"
            ? respond
            : {
                schemaId: "picker",
                ...(kind === "versioned" ? { schemaVersion: "1" } : {}),
                respond,
              },
      },
      references: { facts },
    });
    expect(evals.describe().responders[0]).toMatchObject({ name: "pick" });
    const result = await evals.run({ suiteId: "waiting" });
    expect(result.status).toBe("passed");
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({ args: { city: "Paris" } }),
    );
    expect(facts).toHaveBeenCalledWith(
      expect.objectContaining({ args: "Paris" }),
    );
    expect(execute.mock.calls[2]?.[0]).toMatchObject({
      history: expect.arrayContaining([
        {
          role: "user",
          content: JSON.stringify({ type: "text", text: "Paris" }),
        },
      ]),
    });
  });
  it("treats a reference with additional keys as literal JSON", async () => {
    const reference = { using: "a real data field", city: "Paris" };
    const evals = createEvals({
      ...base,
      suites: [
        {
          id: "literal",
          cases: [
            {
              id: "one",
              steps: [
                { message: "jobs", expect: { type: "answer", reference } },
              ],
            },
          ],
        },
      ],
    });
    expect(
      (await evals.run({ suiteId: "literal" })).cases[0]?.steps[0]?.reference,
    ).toEqual(reference);
  });
  it("rejects a waiting observation without private continuation", async () => {
    const result = await createEvals({
      ...base,
      execute: () => ({ observation: interrupt }),
    }).run({ suiteId: suite.id });
    expect(result.cases[0]?.errors[0]?.phase).toBe("execute");
  });
  it.each([
    "error",
    "still-waiting",
    "throws",
  ])("records %s interrupt cleanup failures without leaking private details", async (mode) => {
    const teardown = vi.fn();
    const evals = createEvals({
      ...base,
      suites: [
        {
          id: "waiting",
          cases: [
            {
              id: "one",
              steps: [{ message: "hi", expect: { type: "interrupt" } }],
            },
          ],
        },
      ],
      teardown,
      execute: ({ command }) => {
        if (command.type !== "cancel")
          return { observation: interrupt, continuation: "PRIVATE" };
        if (mode === "throws") throw new Error("PRIVATE");
        return mode === "error"
          ? { observation: { ...answer, type: "error" } }
          : { observation: interrupt, continuation: "PRIVATE" };
      },
    });
    const result = await evals.run({ suiteId: "waiting" });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.errors).toContainEqual(
      expect.objectContaining({ code: "EVAL_INTERRUPT_CLEANUP_FAILED" }),
    );
    expect(teardown).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("enforces a separate cooperative cleanup timeout", async () => {
    const result = await createEvals({
      ...base,
      defaults: { cleanupTimeoutMs: 5 },
      teardown: async ({ signal }) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      },
    }).run({ suiteId: suite.id });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.errors[0]?.phase).toBe("cleanup");
  });
  it("reports cancellation during grading on the active step", async () => {
    const controller = new AbortController();
    const evals = createEvals({
      ...base,
      suites: [
        {
          ...suite,
          cases: [
            {
              id: "one",
              steps: [
                {
                  message: "hi",
                  expect: { type: "answer", criteria: ["Correct"] },
                },
              ],
            },
          ],
        },
      ],
      judge: {
        id: "judge",
        version: "1",
        grade: () => {
          controller.abort();
          return { passed: true, reason: "ok", evidence: [] };
        },
      },
    });
    const result = await evals.run({
      suiteId: suite.id,
      signal: controller.signal,
    });
    expect(result.status).toBe("cancelled");
    expect(result.cases[0]?.steps[0]).toMatchObject({
      status: "cancelled",
      reason: "Case was cancelled.",
    });
  });
});

describe("native stream failure boundaries", () => {
  it("passes an explicitly selected workflow through the default executor", async () => {
    const streamChat = vi.fn(async () =>
      (async function* (): AsyncGenerator<StreamChunk> {
        yield { type: "done", data: {} };
      })(),
    );
    const result = await createEvals({
      agent: { streamChat },
      suites: [
        { ...suite, cases: [{ ...suite.cases[0]!, workflowId: "jobs" }] },
      ],
    }).run({ suiteId: suite.id });
    expect(result.status).toBe("passed");
    expect(streamChat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ workflowId: "jobs" }),
    );
  });

  const pending = {
    type: "interrupt",
    requestId: "one",
    resumeToken: "private",
    kind: "text",
    question: "Choose",
    options: [],
  } as const;
  const native = (
    streamChat: (
      ...args: Parameters<CreateEvalsOptions["agent"]["streamChat"]>
    ) => AsyncIterable<StreamChunk> | Promise<AsyncIterable<StreamChunk>>,
    command: Parameters<typeof executeEvalChat>[0]["command"] = {
      type: "message",
      message: "hi",
    },
    continuation?: unknown,
  ) =>
    executeEvalChat({
      agent: { streamChat: async (...args) => streamChat(...args) },
      command,
      continuation,
      history: [],
      sessionId: "eval-one",
      clientTurnId: "turn",
      signal: new AbortController().signal,
    });
  it.each([
    "error",
    "cancelled",
  ] as const)("captures streamed %s as a terminal observation", async (type) => {
    const result = await native(async function* () {
      yield { type, message: "failure" } as StreamChunk;
    });
    expect(result.observation.type).toBe(type);
  });
  it("links observations to a streamed native run when no finalized event is available", async () => {
    const result = await native(async function* () {
      yield {
        type: "trace",
        runId: "native-run",
        traceId: "trace",
        spanId: "span",
        rootSpanName: "kortyx.run",
      } as StreamChunk;
      yield { type: "done", data: {} };
    });
    expect(result.observation.runId).toBe("native-run");
  });
  it("propagates execution rejection even if the response stream already ended", async () => {
    await expect(
      native(async function* (_messages, options) {
        options?.onExecution?.(Promise.reject(new Error("execution failed")));
        yield { type: "done", data: {} };
      }),
    ).rejects.toThrow("execution failed");
  });
  it("rejects resumes without a complete native continuation", async () => {
    for (const continuation of [
      undefined,
      [{ ...pending, resumeToken: undefined }],
      [{ ...pending, requestId: undefined }],
    ])
      await expect(
        native(
          unusedAgent.streamChat,
          { type: "resume", response: { type: "text", text: "Paris" } },
          continuation,
        ),
      ).rejects.toThrow("No waiting interrupt");
  });
  it.each([
    "error",
    "still-waiting",
    "throws",
  ])("attempts all parallel cleanup requests even after %s", async (mode) => {
    const streamChat = vi.fn(async function* () {
      if (mode === "throws") throw new Error("cancel failed");
      yield (
        mode === "error" ? { type: "error", message: "cancel failed" } : pending
      ) as StreamChunk;
    });
    await expect(
      native(streamChat, { type: "cancel" }, [
        pending,
        { ...pending, requestId: "two" },
      ]),
    ).rejects.toThrow("Could not cancel all");
    expect(streamChat).toHaveBeenCalledTimes(2);
  });
});
