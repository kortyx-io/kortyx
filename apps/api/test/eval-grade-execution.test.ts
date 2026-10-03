import { createEvals, type EvalJudge, type EvalSuite } from "@kortyx/agent";
import { expect, it, vi } from "vitest";
import { gradeEvalExecution } from "../src/evals/grade-execution";

const suite: EvalSuite = {
  id: "jobs",
  cases: [
    {
      id: "salary",
      steps: [
        {
          message: "Read salary",
          expect: { type: "answer", criteria: ["Salary matches tool result"] },
        },
        {
          message: "Explain it",
          expect: { type: "answer", criteria: ["Explain accurately"] },
        },
      ],
    },
  ],
};
const capture = () =>
  createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    execute: () => ({
      observation: {
        type: "answer",
        text: "EUR 99,000",
        structured: [],
        events: [{ type: "tool-call-result", content: "EUR 90,000" }],
      },
    }),
  }).run({ suiteId: suite.id, grading: "studio" });
const judge: EvalJudge = {
  id: "studio/test",
  version: "1",
  grade: () => ({
    passed: false,
    reason: "Invented amount",
    evidence: ["90000 versus 99000"],
  }),
};
it("Studio cannot turn a missing output into a pass and still grades content after successful contract checks", async () => {
  const output = {
    schemaId: "app.product-list",
    status: "done",
    data: { products: [{ price: 99 }] },
  };
  const execution = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [
      {
        id: "catalog",
        cases: [
          {
            id: "missing",
            steps: [
              {
                message: "Show products",
                expect: {
                  type: "answer",
                  outputs: [{ schemaId: "app.receipt" }],
                  criteria: ["Correct prices"],
                },
              },
            ],
          },
          {
            id: "wrong-content",
            steps: [
              {
                message: "Show products",
                expect: {
                  type: "answer",
                  outputs: [{ schemaId: "app.product-list" }],
                  criteria: ["Correct prices"],
                },
              },
            ],
          },
        ],
      },
    ],
    execute: () => ({
      observation: { type: "answer", text: "", structured: [output] },
    }),
  }).run({ suiteId: "catalog", grading: "studio" });
  const grade = vi.fn((input: Parameters<EvalJudge["grade"]>[0]) => {
    expect(input.observation.structured).toEqual([output]);
    expect(input.observation.text).toBe("");
    return {
      passed: false,
      reason: "Wrong price",
      evidence: ["99 instead of 80"],
    };
  });
  const original = structuredClone(execution);
  const result = await gradeEvalExecution(
    execution,
    { ...judge, grade },
    new AbortController().signal,
    async () => {},
  );
  expect(grade).toHaveBeenCalledOnce();
  expect(execution).toEqual(original);
  expect(result.status).toBe("failed");
  expect(result.counts.failed).toBe(2);
  expect(result.cases[0]?.steps[0]?.reason).toContain(
    "app.receipt (any version)",
  );
  expect(result.cases[0]?.steps[0]?.criteria).toEqual([]);
  expect(result.cases[1]?.steps[0]?.criteria[0]?.reason).toBe("Wrong price");
});
it("grades every captured step and stores failed criteria with evidence without mutating captured execution", async () => {
  const execution = await capture();
  const grade = vi.fn(judge.grade);
  const progress = vi.fn(async () => {});
  const result = await gradeEvalExecution(
    execution,
    { ...judge, grade },
    new AbortController().signal,
    progress,
  );
  expect(result.status).toBe("failed");
  expect(result.counts).toEqual({
    passed: 0,
    failed: 1,
    error: 0,
    cancelled: 0,
  });
  expect(result.judge).toEqual({
    id: judge.id,
    version: "1",
    location: "studio",
  });
  expect(result.cases[0]?.steps[0]?.criteria[0]).toMatchObject({
    passed: false,
    evidence: ["90000 versus 99000"],
  });
  expect(grade).toHaveBeenCalledTimes(2);
  expect(grade.mock.calls[1]?.[0].conversation[0]?.criteria[0]?.passed).toBe(
    false,
  );
  expect(progress).toHaveBeenCalledTimes(3);
  expect(execution.status).toBe("ungraded");
  expect(execution.cases[0]?.steps[0]?.criteria).toEqual([]);
});
it("records provider failures as grading errors and preserves tool evidence without exposing the provider exception", async () => {
  const execution = await capture();
  const result = await gradeEvalExecution(
    execution,
    {
      ...judge,
      grade: () => {
        throw new Error("secret-provider-key");
      },
    },
    new AbortController().signal,
    async () => {},
  );
  expect(result.status).toBe("error");
  expect(result.cases[0]?.errors[0]?.phase).toBe("grading");
  expect(result.cases[0]?.steps[0]?.observation.events).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("secret-provider-key");
});
it("cancellation aborts grading rather than turning it into a failing verdict", async () => {
  const execution = await capture();
  const controller = new AbortController();
  const grade = vi.fn(() => {
    controller.abort();
    throw new Error("aborted");
  });
  await expect(
    gradeEvalExecution(
      execution,
      { ...judge, grade },
      controller.signal,
      async () => {},
    ),
  ).rejects.toThrow();
  expect(grade).toHaveBeenCalledOnce();
});

it("stops waiting when a custom judge ignores cancellation", async () => {
  const execution = await capture();
  const controller = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const judging = gradeEvalExecution(
    execution,
    {
      ...judge,
      grade: () => {
        started();
        return new Promise(() => {});
      },
    },
    controller.signal,
    async () => {},
  );
  await ready;
  controller.abort();
  await expect(judging).rejects.toThrow();
});

it("isolates mutable custom judges from saved tool evidence and later conversation context", async () => {
  const execution = await capture();
  const original = structuredClone(execution);
  let calls = 0;
  const result = await gradeEvalExecution(
    execution,
    {
      ...judge,
      grade: (input) => {
        calls++;
        expect(input.observation.text).toBe("EUR 99,000");
        expect(input.observation.events?.[0]).toEqual({
          type: "tool-call-result",
          content: "EUR 90,000",
        });
        if (calls === 2) {
          expect(input.conversation[0]?.observation.text).toBe("EUR 99,000");
          input.conversation[0]!.observation.text = "Corrupted prior step";
        }
        input.observation.text = "Corrupted evidence";
        (input.observation.events as unknown as unknown[]).length = 0;
        input.input = { message: "Corrupted prompt" };
        return { passed: true, reason: "Checked", evidence: ["EUR 90,000"] };
      },
    },
    new AbortController().signal,
    async () => {},
  );
  expect(execution).toEqual(original);
  expect(result.cases[0]?.steps.map((s) => s.observation)).toEqual(
    original.cases[0]?.steps.map((s) => s.observation),
  );
  expect(result.status).toBe("passed");
  expect(calls).toBe(2);
});

it("keeps execution failures and cancelled attempts out of semantic judging even when the judge always passes", async () => {
  const execution = await capture();
  const first = execution.cases[0]!;
  first.status = "failed";
  first.steps[0]!.status = "failed";
  first.steps[0]!.reason = "Expected human input but received an answer";
  const cancelled = structuredClone(first);
  cancelled.repetition = 2;
  cancelled.status = "cancelled";
  cancelled.steps = [];
  execution.cases.push(cancelled);
  const grade = vi.fn(() => ({
    passed: true,
    reason: "Checked",
    evidence: [],
  }));
  const result = await gradeEvalExecution(
    execution,
    { ...judge, grade },
    new AbortController().signal,
    async () => {},
  );
  expect(grade).toHaveBeenCalledOnce();
  expect(result.cases.map((c) => c.status)).toEqual(["failed", "cancelled"]);
  expect(result.cases[0]?.steps[0]?.reason).toContain("Expected human input");
  expect(result.status).toBe("cancelled");
  expect(result.counts).toEqual({
    passed: 0,
    failed: 1,
    error: 0,
    cancelled: 1,
  });
});

it("stores an invalid judge verdict as a grading error while preserving successful sibling attempts", async () => {
  const execution = await capture();
  const second = structuredClone(execution.cases[0]!);
  second.repetition = 2;
  execution.cases.push(second);
  let calls = 0;
  const result = await gradeEvalExecution(
    execution,
    {
      ...judge,
      grade: () => {
        calls++;
        return calls === 1
          ? ({
              passed: "yes",
              reason: "PRIVATE_PROVIDER_VALUE",
              evidence: [],
            } as unknown as ReturnType<EvalJudge["grade"]>)
          : { passed: true, reason: "Checked", evidence: [] };
      },
    },
    new AbortController().signal,
    async () => {},
  );
  expect(result.status).toBe("error");
  expect(result.counts).toEqual({
    passed: 1,
    failed: 0,
    error: 1,
    cancelled: 0,
  });
  expect(result.cases[0]?.steps[0]?.observation.events).toHaveLength(1);
  expect(result.cases[1]?.steps.every((s) => s.status === "passed")).toBe(true);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_PROVIDER_VALUE");
});

it("does not publish a late judge result after cancellation", async () => {
  const execution = await capture();
  const controller = new AbortController();
  let resolve!: (value: {
    passed: boolean;
    reason: string;
    evidence: string[];
  }) => void;
  const grade = vi.fn(
    () =>
      new Promise<{ passed: boolean; reason: string; evidence: string[] }>(
        (done) => {
          resolve = done;
        },
      ),
  );
  const progress = vi.fn(async () => {});
  const pending = gradeEvalExecution(
    execution,
    { ...judge, grade },
    controller.signal,
    progress,
  );
  await vi.waitFor(() => expect(grade).toHaveBeenCalledOnce());
  controller.abort();
  await expect(pending).rejects.toThrow();
  resolve({ passed: true, reason: "Late answer", evidence: [] });
  await Promise.resolve();
  expect(progress).not.toHaveBeenCalled();
  expect(execution.cases[0]?.steps[0]?.criteria).toEqual([]);
});
