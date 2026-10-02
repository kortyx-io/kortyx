import { describe, expect, it, vi } from "vitest";
import type { EvalJudge, EvalSuite } from "../src/evals/index";
import {
  createEvalRouteHandler,
  createEvals,
  EvalWireEventSchema,
  getEvalSuiteRevision,
} from "../src/evals/index";

const suite: EvalSuite = {
  id: "jobs",
  cases: [
    {
      id: "ambiguity",
      steps: [
        {
          message: "Find the engineer role",
          expect: {
            type: "interrupt",
            schemaId: "job-picker",
            criteria: ["Offer both cities"],
          },
        },
        {
          resume: { type: "select", ids: ["paris"] },
          expect: { type: "answer", criteria: ["Describe Paris"] },
        },
      ],
    },
  ],
};
const identity = {
  id: "studio/test",
  version: "1",
  location: "studio" as const,
};
const codeJudge: EvalJudge = {
  id: "app/test",
  version: "1",
  location: "app",
  grade: () => ({ passed: false, reason: "Failed in code", evidence: [] }),
};
const agent = { streamChat: vi.fn() } as unknown as Parameters<
  typeof createEvals
>[0]["agent"];
const execute = vi.fn(async ({ command }: { command: { type: string } }) =>
  command.type === "message"
    ? {
        continuation: { secret: "private" },
        observation: {
          type: "interrupt" as const,
          text: "Which city?",
          structured: [],
          interrupt: {
            requestId: "choose",
            kind: "choice" as const,
            schemaId: "job-picker",
            options: [
              { id: "paris", label: "Paris" },
              { id: "barcelona", label: "Barcelona" },
            ],
          },
        },
      }
    : {
        observation: {
          type: "answer" as const,
          text: "Paris engineer description",
          structured: [],
          events: [
            { type: "tool-call-result", structuredContent: { city: "Paris" } },
          ],
        },
      },
);

describe("judge selection", () => {
  it("allows no judge at construction, advertises Studio support, and fails local grading before executing", async () => {
    const work = vi.fn(execute);
    const evals = createEvals({ agent, suites: [suite], execute: work });
    expect(evals.describe()).toMatchObject({ studioJudging: true });
    expect(evals.describe().judge).toBeUndefined();
    await expect(evals.run({ suiteId: suite.id })).rejects.toThrow(
      "Local runs with criteria require a judge",
    );
    expect(work).not.toHaveBeenCalled();
  });
  it("captures all declared steps and runs cleanup while bypassing even a failing code judge", async () => {
    const grade = vi.fn(codeJudge.grade);
    const teardown = vi.fn();
    const evals = createEvals({
      agent,
      suites: [suite],
      execute,
      teardown,
      judge: { ...codeJudge, grade },
    });
    const result = await evals.run({
      suiteId: suite.id,
      grading: "studio",
      judgeIdentity: identity,
    });
    expect(grade).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "ungraded",
      judge: identity,
      counts: { passed: 0, ungraded: 1 },
    });
    expect(
      result.cases[0]?.steps.map((step) => [step.status, step.criteria]),
    ).toEqual([
      ["ungraded", []],
      ["ungraded", []],
    ]);
    expect(result.cases[0]?.steps[1]?.observation.events).toHaveLength(1);
    expect(teardown).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(EvalWireEventSchema.parse({ type: "result", result }).type).toBe(
      "result",
    );
  });
  it("keeps the code judge as the local default and stops on its failing verdict", async () => {
    const grade = vi.fn(codeJudge.grade);
    const evals = createEvals({
      agent,
      suites: [suite],
      execute,
      judge: { ...codeJudge, grade },
    });
    const result = await evals.run({ suiteId: suite.id });
    expect(result.status).toBe("failed");
    expect(grade).toHaveBeenCalledOnce();
    expect(result.cases[0]?.steps).toHaveLength(1);
    await expect(
      evals.run({
        suiteId: suite.id,
        judgeIdentity: { ...codeJudge, version: "changed" },
      }),
    ).rejects.toThrow("App judge changed");
  });
  it("accepts authenticated Studio selection without a code judge or any Studio credential in the consumer", async () => {
    const evals = createEvals({ agent, suites: [suite], execute });
    const serviceKey = "test-service-key-that-is-at-least-32-characters";
    const handler = createEvalRouteHandler({ evals, serviceKey });
    const response = await handler(
      new Request("https://app.test/evals", {
        method: "POST",
        headers: {
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          suiteId: suite.id,
          suiteRevision: getEvalSuiteRevision(suite),
          grading: "studio",
          judge: identity,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => EvalWireEventSchema.parse(JSON.parse(line)));
    expect(events.at(-1)).toMatchObject({
      type: "result",
      result: { status: "ungraded", judge: identity },
    });
  });
});

it("rejects stale local judge pins before setup, even for cases needing no semantic grade", async () => {
  const noCriteria: EvalSuite = {
    id: "plain",
    cases: [
      {
        id: "answer",
        steps: [{ message: "Hello", expect: { type: "answer" } }],
      },
    ],
  };
  const setup = vi.fn();
  const judge = { id: "local", version: "1", grade: codeJudge.grade };
  const withoutJudge = createEvals({ agent, suites: [noCriteria], setup });
  await expect(
    withoutJudge.run({ suiteId: "plain", judgeIdentity: identity }),
  ).rejects.toThrow("App judge changed");
  const evals = createEvals({ agent, suites: [noCriteria], setup, judge });
  expect(evals.describe().judge).toEqual({ id: "local", version: "1" });
  expect(
    createEvals({ agent, suites: [noCriteria], judge: codeJudge }).describe()
      .judge?.location,
  ).toBe("app");
  for (const pin of [
    { ...judge, id: "changed" },
    { ...judge, location: "app" as const },
  ])
    await expect(
      evals.run({ suiteId: "plain", judgeIdentity: pin }),
    ).rejects.toThrow("App judge changed");
  expect(setup).not.toHaveBeenCalled();
});

it("rejects legacy consumers and stale app judges at the authenticated route before executing", async () => {
  const run = vi.fn();
  const key = "test-service-key-that-is-at-least-32-characters";
  const runner = {
    describe: () => ({
      schemaVersion: 1 as const,
      suites: [suite],
      judge: { id: "app/test", version: "1" },
    }),
    run,
  };
  const handler = createEvalRouteHandler({ evals: runner, serviceKey: key });
  for (const selection of [
    { grading: "studio", judge: identity },
    { judge: { id: "different", version: "1" } },
    { judge: { id: "app/test", version: "1", location: "app" } },
    { judge: { id: "app/test", version: "2" } },
  ]) {
    const response = await handler(
      new Request("https://app.test/evals", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          suiteId: suite.id,
          suiteRevision: getEvalSuiteRevision(suite),
          ...selection,
        }),
      }),
    );
    expect(response.status).toBe(409);
  }
  expect(run).not.toHaveBeenCalled();
});

it("rejects a pinned app judge when deployment removes the app judge", async () => {
  const key = "test-service-key-that-is-at-least-32-characters";
  const run = vi.fn();
  const handler = createEvalRouteHandler({
    evals: {
      describe: () => ({ schemaVersion: 1 as const, suites: [suite] }),
      run,
    },
    serviceKey: key,
  });
  const response = await handler(
    new Request("https://app.test/evals", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        suiteId: suite.id,
        suiteRevision: getEvalSuiteRevision(suite),
        judge: { id: "app/test", version: "1" },
      }),
    }),
  );
  expect(response.status).toBe(409);
  expect(run).not.toHaveBeenCalled();
});
