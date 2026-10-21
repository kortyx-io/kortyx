import type { ProviderModelRef } from "@kortyx/providers";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createEvalJudge,
  createEvalRouteHandler,
  createEvals,
  defineJudgePrompt,
  defineSuite,
  EvalRunResultSchema,
  EvalSuiteSchema,
  getEvalSuiteRevision,
  promptText,
} from "../src/evals/index";
import { renderJudgePrompt } from "../src/evals/judge-prompt";
import type { EvalGradeInput, EvalJudge } from "../src/evals/types";

function prompt(id = "test/judge") {
  return defineJudgePrompt({
    id,
    messages: ({ criterion, input, observation, reference, conversation }) => [
      {
        role: "system",
        content: "Assess the supplied requirement using evidence.",
      },
      {
        role: "user",
        content: promptText`Criterion: ${criterion.text}\nInput: ${input}\nObservation: ${observation}\nReference: ${reference}\nHistory: ${conversation}`,
      },
    ],
  });
}
const gradeInput = (): EvalGradeInput => ({
  criterion: { id: "accurate", text: "Report Paris" },
  input: { message: "City?" },
  observation: { type: "answer", text: "Paris", structured: [] },
  conversation: [],
  signal: new AbortController().signal,
});
function model(passed = true) {
  const invoke = vi.fn(async (_messages: unknown) => ({
    content: JSON.stringify({ passed, reason: "Assessed", evidence: [] }),
  }));
  return {
    invoke,
    ref: {
      modelId: passed ? "pass" : "fail",
      provider: { id: "test", getModel: () => ({ invoke }) },
    } as unknown as ProviderModelRef,
  };
}
const agent = { streamChat: vi.fn() } as unknown as Parameters<
  typeof createEvals
>[0]["agent"];
const cases = [
  {
    id: "city",
    steps: [
      {
        message: "City?",
        expect: { type: "answer" as const, criteria: ["Report Paris"] },
      },
    ],
  },
];
const execute = async () => ({
  observation: {
    type: "answer" as const,
    text: "Paris",
    structured: [],
    events: [
      {
        type: "tool-call-result",
        tool: "lookup",
        structuredContent: { city: "Paris" },
      },
    ],
  },
});

describe("portable judge prompt declarations", () => {
  it("captures typed references once and emits the ordinary portable prompt format", () => {
    const definition = prompt();
    expect(definition.content.messages[1]?.content).toContain(
      "{{criterion.text}}",
    );
    expect(definition.content.messages[1]?.content).toContain(
      "{{observation}}",
    );
    expect(definition.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(definition.content.messages)).toBe(true);
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
    expectTypeOf(definition.content.messages[0]?.content).toEqualTypeOf<
      string | undefined
    >();
  });
  it("validates names, required inputs, unsafe paths, and accidental JavaScript coercion", () => {
    for (const content of [
      "{{criterion.text}} {{observation.typo}}",
      "{{criterion.text}}",
      "{{criterion.text}} {{observation.__proto__}}",
      "{{observation}} {{unknown}}",
    ])
      expect(() =>
        defineJudgePrompt({ id: "bad", messages: [{ role: "user", content }] }),
      ).toThrow();
    expect(() =>
      defineJudgePrompt({
        id: "bad",
        messages: ({ observation }) => [
          { role: "user", content: `${observation}` },
        ],
      }),
    ).toThrow(/promptText/);
    expect(() => promptText`Value: ${"{{observation}}"}`).toThrow(
      /interpolated literals/,
    );
  });
  it("serializes structured inputs, normalizes absent evidence, and never leaks earlier verdicts", () => {
    const input = gradeInput();
    input.reference = { price: 49 };
    const messages = renderJudgePrompt(
      JSON.parse(JSON.stringify(prompt())),
      input,
    );
    expect(messages[1]?.content).toContain('"price":49');
    expect(messages[1]?.content).toContain('"events":[]');
    expect(messages[1]?.content).toContain('"interrupt":null');
    expect(messages[1]?.content).toContain("History: []");
    expect(messages[1]?.content).not.toContain("[object Object]");
  });
  it("rejects tampered prompt snapshots before model calls", () => {
    const altered = structuredClone(prompt());
    altered.content.messages[0]!.content = "Changed";
    const mock = model();
    expect(() => createEvalJudge({ model: mock.ref, prompt: altered })).toThrow(
      /hash/,
    );
    expect(mock.invoke).not.toHaveBeenCalled();
  });
});

describe("suite-owned judges", () => {
  it("selects imported judges independently, preserving legacy fallback and saving requests", async () => {
    const passing = model();
    const failing = model(false);
    const yes = createEvalJudge({ model: passing.ref, prompt: prompt("yes") });
    const no = createEvalJudge({ model: failing.ref, prompt: prompt("no") });
    const suite = defineSuite({ id: "yes", judge: yes, cases });
    const evals = createEvals({
      agent,
      execute,
      judge: no,
      suites: [
        suite,
        defineSuite({ id: "no", judge: no, cases }),
        { id: "fallback", cases },
      ],
    });
    expect((await evals.run({ suiteId: "yes" })).status).toBe("passed");
    expect((await evals.run({ suiteId: "no" })).status).toBe("failed");
    expect((await evals.run({ suiteId: "fallback" })).status).toBe("failed");
    const result = EvalRunResultSchema.parse(
      await evals.run({ suiteId: "yes" }),
    );
    expect(result.judge?.prompt?.hash).toBe(yes.prompt?.hash);
    expect(result.cases[0]?.steps[0]?.criteria[0]?.request?.messages).toEqual(
      passing.invoke.mock.calls.at(-1)?.[0],
    );
    expect(EvalSuiteSchema.parse(JSON.parse(JSON.stringify(suite)))).toEqual(
      suite,
    );
    expect(JSON.stringify(evals.describe())).not.toMatch(
      /getModel|apiKey|grade/,
    );
  });
  it("respects disabled history, events and outputs when injecting variables", async () => {
    const mock = model();
    const judge = createEvalJudge({ model: mock.ref, prompt: prompt() });
    const evals = createEvals({
      agent,
      suites: [
        defineSuite({
          id: "filtered",
          judge,
          evidence: { history: false, events: false, outputs: false },
          cases,
        }),
      ],
      execute: async () => ({
        observation: {
          type: "answer",
          text: "Paris",
          structured: [{ secret: "PRIVATE_OUTPUT" }],
          events: [{ type: "tool-call-result", secret: "PRIVATE_EVENT" }],
        },
      }),
    });
    const result = await evals.run({ suiteId: "filtered" });
    expect(result.status).toBe("passed");
    expect(JSON.stringify(mock.invoke.mock.calls)).not.toMatch(
      /PRIVATE_OUTPUT|PRIVATE_EVENT/,
    );
    expect(JSON.stringify(result.cases[0]?.steps[0]?.observation)).toContain(
      "PRIVATE_OUTPUT",
    );
  });
  it("carries the same portable template into Studio capture without invoking the App judge", async () => {
    const mock = model();
    const judge = createEvalJudge({ model: mock.ref, prompt: prompt() });
    const suite = defineSuite({ id: "studio", judge, cases });
    const evals = createEvals({ agent, suites: [suite], execute });
    const result = await evals.run({
      suiteId: "studio",
      grading: "studio",
      judgeIdentity: {
        id: "studio/model",
        version: "1",
        location: "studio",
        promptTemplates: true,
        prompt: judge.prompt,
      },
    });
    expect(result.status).toBe("ungraded");
    expect(result.judge?.prompt).toEqual(judge.prompt);
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(EvalRunResultSchema.parse(result).suite.judge?.prompt).toEqual(
      judge.prompt,
    );
  });
  it("fails a deserialized App binding explicitly until an executable judge is bound", async () => {
    const mock = model();
    const suite = defineSuite({
      id: "portable",
      judge: createEvalJudge({ model: mock.ref, prompt: prompt() }),
      cases,
    });
    const setup = vi.fn();
    const evals = createEvals({
      agent,
      suites: [JSON.parse(JSON.stringify(suite))],
      setup,
    });
    await expect(evals.run({ suiteId: "portable" })).rejects.toThrow(
      /not bound/,
    );
    expect(setup).not.toHaveBeenCalled();
  });
  it("checks prompt hashes as part of App judge pins", async () => {
    const mock = model();
    const judge = createEvalJudge({ model: mock.ref, prompt: prompt() });
    const suite = defineSuite({ id: "pin", judge, cases });
    const evals = createEvals({ agent, suites: [suite] });
    await expect(
      evals.run({
        suiteId: "pin",
        judgeIdentity: {
          id: judge.id,
          version: judge.version,
          location: judge.location,
          prompt: prompt("changed"),
        },
      }),
    ).rejects.toThrow(/changed/);
  });
});

// Compile-time contract: symbolic inputs are typed references, never runtime data.
function checkTypes() {
  defineJudgePrompt({
    id: "types",
    messages: (variables) => {
      // @ts-expect-error Unknown criterion field.
      variables.criterion.description;
      // @ts-expect-error No runtime array methods on declaration-time evidence.
      variables.observation.events.filter(() => true);
      return [
        {
          role: "user",
          content: promptText`${variables.criterion.text} ${variables.observation}`,
        },
      ];
    },
  });
  expectTypeOf<EvalJudge>().toHaveProperty("grade");
}

void checkTypes;

it("warns once for the deprecated application judge without breaking execution", async () => {
  vi.resetModules();
  const { createEvals: freshCreateEvals } = await import(
    "../src/evals/create-evals"
  );
  const warning = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
  try {
    const judge: EvalJudge = {
      id: "legacy",
      version: "1",
      grade: () => ({ passed: true, reason: "Pass", evidence: [] }),
    };
    for (let i = 0; i < 2; i++) {
      const evals = freshCreateEvals({
        agent,
        execute,
        suites: [{ id: "legacy", cases }],
        judge,
      });
      expect((await evals.run({ suiteId: "legacy" })).status).toBe("passed");
    }
    expect(warning).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("defineSuite"),
      {
        code: "KORTYX_EVAL_APPLICATION_JUDGE_DEPRECATED",
        type: "DeprecationWarning",
      },
    );
  } finally {
    warning.mockRestore();
  }
});

it("uses per-suite judge pins at the authenticated consumer route", async () => {
  const mock = model();
  const judge = createEvalJudge({ model: mock.ref, prompt: prompt() });
  const suite = defineSuite({ id: "route", judge, cases });
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
        judge: evals.describe().suites[0]?.judge,
      }),
    }),
  );
  expect(response.status).toBe(200);
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(events.at(-1)).toMatchObject({
    type: "result",
    result: { status: "passed", judge: { prompt: { id: "test/judge" } } },
  });
});
