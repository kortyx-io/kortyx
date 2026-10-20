import { expect, it, vi } from "vitest";
import { evaluateChecks } from "../src/evals/checks";
import {
  createEvals,
  defineSuite,
  EvalRunResultSchema,
  EvalSuiteSchema,
  evalChecks,
  getEvalSuiteRevision,
} from "../src/evals/index";
import type { EvalCheck, EvalJson, EvalObservation } from "../src/evals/types";

const answer = (extra: Partial<EvalObservation> = {}): EvalObservation => ({
  type: "answer",
  text: "Price: EUR 49",
  structured: [],
  ...extra,
});
const verdict = (check: EvalCheck, observation = answer()) =>
  evaluateChecks([check], observation)[0];
const suite = (checks: readonly EvalCheck[], criteria: string[] = []) =>
  defineSuite({
    id: "catalog",
    cases: [
      {
        id: "price",
        steps: [
          {
            message: "Read price",
            expect: { type: "answer", checks, criteria },
          },
        ],
      },
    ],
  });

it("serializes all six helpers as data and changes the suite revision when a check changes", () => {
  const checks = [
    evalChecks.textEquals("Price: EUR 49", { ignoreCase: true }),
    evalChecks.textContains("EUR"),
    evalChecks.textMatches("eur \\d+", "i"),
    evalChecks.toolCalled("catalog.lookup"),
    evalChecks.toolInputEquals("catalog.lookup", { sku: "blue" }),
    evalChecks.outputEquals({
      schemaId: "app.card",
      path: ["prices", 0],
      value: 49,
    }),
  ];
  const scenario = suite(checks);
  expect(EvalSuiteSchema.parse(JSON.parse(JSON.stringify(scenario)))).toEqual(
    scenario,
  );
  expect(checks.map((item) => item.type)).toEqual([
    "text-equals",
    "text-contains",
    "text-matches",
    "tool-called",
    "tool-input-equals",
    "output-equals",
  ]);
  expect(getEvalSuiteRevision(scenario)).not.toBe(
    getEvalSuiteRevision(suite([evalChecks.textContains("USD")])),
  );
});

it.each([
  { type: "unknown" },
  { using: "custom" },
  { type: "text-equals", value: 42 },
  { type: "text-equals", value: "sales", ignoreCase: "true" },
  { type: "text-equals", value: "sales", trim: true },
  { type: "text-contains", value: "" },
  { type: "text-matches", pattern: "[" },
  { type: "text-matches", pattern: ".", flags: "ii" },
  { type: "tool-called", tool: "" },
  { type: "output-equals", schemaId: "card", path: [-1], value: null },
])("rejects invalid or unsupported descriptors before running: %j", (check) => {
  expect(() =>
    createEvals({
      agent: { streamChat: vi.fn() },
      suites: [suite([check as EvalCheck])],
    }),
  ).toThrow();
});

it.each([
  ["sales", "sales", undefined, true],
  ["sales", "SALES", undefined, false],
  ["sales", "SALES", false, false],
  ["sales", "SALES", true, true],
  ["sales", "This is sales", true, false],
  ["sales", "sales ", true, false],
  ["sales", "sales\n", true, false],
  ["^sales$", "sales", true, false],
  ["^sales$", "^SALES$", true, true],
  ["", "", undefined, true],
] as const)("compares the complete literal %j with %j (ignoreCase: %j)", (value, text, ignoreCase, passed) => {
  const check =
    ignoreCase === undefined
      ? evalChecks.textEquals(value)
      : evalChecks.textEquals(value, { ignoreCase });
  expect(verdict(check, answer({ text }))).toMatchObject({
    passed,
    evidence: passed ? [text] : [],
    reason: passed
      ? "The answer equals the expected text."
      : "The answer does not equal the expected text.",
  });
});

it("keeps text equality options serializable and part of the suite revision", () => {
  expect(evalChecks.textEquals("sales")).toEqual({
    type: "text-equals",
    value: "sales",
  });
  expect(
    EvalSuiteSchema.parse(suite([evalChecks.textEquals("")])),
  ).toBeDefined();
  expect(
    getEvalSuiteRevision(suite([evalChecks.textEquals("sales")])),
  ).not.toBe(
    getEvalSuiteRevision(
      suite([evalChecks.textEquals("sales", { ignoreCase: true })]),
    ),
  );
});

it.each([
  true,
  false,
])("persists text equality verdicts through SDK execution (ignoreCase: %j)", async (ignoreCase) => {
  const scenario = suite([evalChecks.textEquals("sales", { ignoreCase })]);
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [scenario],
    execute: () => ({ observation: answer({ text: "SALES" }) }),
  }).run({ suiteId: scenario.id });
  expect(result.status).toBe(ignoreCase ? "passed" : "failed");
  expect(result.cases[0]?.steps[0]?.checks?.[0]).toMatchObject({
    check: { type: "text-equals", value: "sales", ignoreCase },
    passed: ignoreCase,
  });
  expect(EvalRunResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(
    result,
  );
});

it("matches literal text case-sensitively and regex flags without state leaking across repetitions", () => {
  expect(verdict(evalChecks.textContains("EUR"))).toMatchObject({
    passed: true,
    evidence: ["EUR"],
  });
  expect(verdict(evalChecks.textContains("eur"))).toMatchObject({
    passed: false,
    evidence: [],
  });
  const check = evalChecks.textMatches("eur \\d+", "ig");
  expect(verdict(check)).toMatchObject({ passed: true, evidence: ["EUR 49"] });
  expect(verdict(check)?.passed).toBe(true);
  expect(verdict(evalChecks.textMatches("USD"))?.passed).toBe(false);
  expect(verdict(evalChecks.textMatches("^"))?.evidence).toEqual([]);
});

it("requires captured tool evidence, not an answer's claim, arbitrary objects or structured output", () => {
  const check = evalChecks.toolCalled("catalog.lookup");
  expect(
    verdict(check, answer({ text: "I called catalog.lookup" }))?.passed,
  ).toBe(false);
  for (const type of [
    "tool-call-start",
    "tool-call-result",
    "tool-call-error",
    "tool-result",
  ])
    expect(
      verdict(check, answer({ events: [{ type, tool: "catalog.lookup" }] }))
        ?.passed,
    ).toBe(true);
  expect(
    verdict(
      check,
      answer({
        events: [
          null,
          [],
          "catalog.lookup",
          { type: "text", tool: "catalog.lookup" },
          { type: "tool-call-start", tool: "other" },
        ],
      }),
    )?.passed,
  ).toBe(false);
  expect(
    verdict(
      evalChecks.toolInputEquals("catalog.lookup", { sku: "blue" }),
      answer({
        events: [
          {
            type: "tool-call-result",
            tool: "catalog.lookup",
            input: { sku: "blue" },
          },
        ],
      }),
    )?.passed,
  ).toBe(false);
});

it.each([
  [{ a: 1, b: [null, true] }, { b: [null, true], a: 1 }, true],
  [[1, 2], [2, 1], false],
  [[1], [1, 2], false],
  [[1], { "0": 1 }, false],
  [{ a: 1 }, { a: 1, extra: true }, false],
  [{ a: 1 }, { b: 1 }, false],
  [null, {}, false],
  [true, 1, false],
  [1, "1", false],
  [null, null, true],
] as [
  EvalJson,
  EvalJson,
  boolean,
][])("uses exact JSON equality for tool inputs: %j versus %j", (expected, actual, passed) => {
  expect(
    verdict(
      evalChecks.toolInputEquals("lookup", expected),
      answer({
        events: [{ type: "tool-call-start", tool: "lookup", input: actual }],
      }),
    )?.passed,
  ).toBe(passed);
});

it("reads only current completed output data, distinguishes missing from null and avoids inherited properties", () => {
  const output = {
    schemaId: "app.card",
    schemaVersion: "2",
    status: "done",
    data: { prices: [49], missing: null },
  };
  const check = evalChecks.outputEquals({
    schemaId: "app.card",
    path: ["prices", 0],
    value: 49,
  });
  expect(
    verdict(check, answer({ structured: [null, [], {}, output] }))?.passed,
  ).toBe(true);
  for (const structured of [
    [],
    [{ ...output, status: "streaming" }],
    [{ ...output, schemaId: "other" }],
    [{ ...output, data: null }],
  ])
    expect(
      verdict(
        check,
        answer({
          structured,
          events: [{ type: "structured-data", ...output }],
        }),
      )?.passed,
    ).toBe(false);
  expect(
    verdict(
      evalChecks.outputEquals({
        schemaId: "app.card",
        schemaVersion: "1",
        path: [],
        value: output.data,
      }),
      answer({ structured: [output] }),
    )?.passed,
  ).toBe(false);
  expect(
    verdict(
      evalChecks.outputEquals({
        schemaId: "app.card",
        schemaVersion: "2",
        path: [],
        value: output.data,
      }),
      answer({ structured: [output] }),
    )?.passed,
  ).toBe(true);
  for (const key of ["absent", "toString", "__proto__"])
    expect(
      verdict(
        evalChecks.outputEquals({
          schemaId: "app.card",
          path: [key],
          value: null,
        }),
        answer({ structured: [output] }),
      )?.passed,
    ).toBe(false);
  expect(
    verdict(
      evalChecks.outputEquals({
        schemaId: "app.card",
        path: ["missing"],
        value: null,
      }),
      answer({ structured: [output] }),
    )?.passed,
  ).toBe(true);
});

it.each([
  "app",
  "studio",
] as const)("%s grading cannot override a failed deterministic check; later steps, references and judges are skipped and cleanup runs", async (grading) => {
  const scenario = suite(
    [evalChecks.textContains("USD"), evalChecks.textContains("EUR")],
    ["Correct currency"],
  );
  const expanded = {
    ...scenario,
    cases: scenario.cases.map((item) => ({
      ...item,
      steps: [
        ...item.steps.map((step) => ({
          ...step,
          expect: { ...step.expect, reference: { using: "facts" } },
        })),
        { message: "Continue", expect: { type: "answer" as const } },
      ],
    })),
  };
  const execute = vi.fn(() => ({ observation: answer() }));
  const grade = vi.fn(() => ({
    passed: true,
    reason: "Looks good",
    evidence: [],
  }));
  const facts = vi.fn(() => ({}));
  const teardown = vi.fn();
  const events: unknown[] = [];
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [expanded],
    setup: () => ({}),
    execute,
    references: { facts },
    teardown,
    judge: { id: "fixture", version: "1", grade },
  }).run({
    suiteId: scenario.id,
    grading,
    onProgress: (event) => {
      events.push(event);
    },
  });
  expect(result.status).toBe("failed");
  expect(
    result.cases[0]?.steps[0]?.checks?.map((check) => check.passed),
  ).toEqual([false, true]);
  expect(execute).toHaveBeenCalledOnce();
  expect(grade).not.toHaveBeenCalled();
  expect(facts).not.toHaveBeenCalled();
  expect(teardown).toHaveBeenCalledOnce();
  expect(events).toContainEqual(
    expect.objectContaining({
      type: "step-completed",
      step: expect.objectContaining({
        checks: expect.any(Array),
        status: "failed",
      }),
    }),
  );
  expect(EvalRunResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(
    result,
  );
});

it.each([
  "app",
  "studio",
] as const)("check-only %s execution needs no judge and ignores judge evidence filtering", async (grading) => {
  const scenario = {
    ...suite([evalChecks.toolCalled("lookup")]),
    evidence: { events: false as const, outputs: false as const },
  };
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [scenario],
    execute: () => ({
      observation: answer({
        events: [{ type: "tool-call-start", tool: "lookup", input: {} }],
      }),
    }),
  }).run({ suiteId: scenario.id, grading });
  expect(result.status).toBe("passed");
  expect(result.cases[0]?.steps[0]?.checks?.[0]?.passed).toBe(true);
  expect(result.cases[0]?.steps[0]?.judgeCalls).toBeUndefined();
});

it("runs semantic judging after successful checks and does not carry tool evidence across steps", async () => {
  const scenario = suite([evalChecks.textContains("EUR")], ["Helpful"]);
  const grade = vi.fn(() => ({
    passed: true,
    reason: "Helpful",
    evidence: [],
  }));
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [scenario],
    execute: () => ({ observation: answer() }),
    judge: { id: "fixture", version: "1", grade },
  }).run({ suiteId: scenario.id });
  expect(result.status).toBe("passed");
  expect(grade).toHaveBeenCalledOnce();
  const multi = defineSuite({
    id: "multi",
    cases: [
      {
        id: "case",
        steps: [
          { message: "Lookup", expect: { type: "answer" } },
          {
            message: "Recall",
            expect: {
              type: "answer",
              checks: [evalChecks.toolCalled("lookup")],
            },
          },
        ],
      },
    ],
  });
  let turn = 0;
  const second = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [multi],
    execute: () => ({
      observation: answer({
        events:
          turn++ === 0 ? [{ type: "tool-call-start", tool: "lookup" }] : [],
      }),
    }),
  }).run({ suiteId: multi.id });
  expect(second.cases[0]?.steps.map((step) => step.status)).toEqual([
    "passed",
    "failed",
  ]);
});
