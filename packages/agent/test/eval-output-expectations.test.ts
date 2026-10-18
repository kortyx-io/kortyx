import type { StreamChunk } from "@kortyx/stream";
import { expect, it, vi } from "vitest";
import {
  createEvals,
  defineSuite,
  EvalRunResultSchema,
  EvalSuiteSchema,
  getEvalSuiteRevision,
} from "../src/evals/index";
import { missingOutputReason } from "../src/evals/output-expectations";
import type {
  EvalCommand,
  EvalGradeInput,
  EvalJson,
  EvalObservation,
  EvalOutputExpectation,
} from "../src/evals/types";

const complete = (
  schemaId = "app.product-list",
  schemaVersion: string | undefined = "2",
) => ({
  streamId: "products",
  dataType: "products",
  schemaId,
  ...(schemaVersion === undefined ? {} : { schemaVersion }),
  status: "done",
  data: { products: ["blue", "black"] },
});
const observation = (structured: EvalJson[]): EvalObservation => ({
  type: "answer",
  text: "",
  structured,
});
const suite = (outputs: EvalOutputExpectation[], criteria: string[] = []) =>
  defineSuite({
    id: "catalog",
    cases: [
      {
        id: "products",
        steps: [
          {
            message: "Show products",
            expect: { type: "answer", outputs, criteria },
          },
        ],
      },
    ],
  });

it.each([
  undefined,
  [],
])("leaves old expectations unchanged for %j", (outputs) => {
  expect(missingOutputReason(outputs, observation([]))).toBeUndefined();
});
it.each([
  complete(),
  complete("app.product-list", "3"),
  { schemaId: "app.product-list", status: "done", data: null },
])("accepts any completed version when unpinned: %j", (output) => {
  expect(
    missingOutputReason(
      [{ schemaId: "app.product-list" }],
      observation([output]),
    ),
  ).toBeUndefined();
});
it("requires every contract independently, permits extra outputs, and accepts an exact pinned version", () => {
  const outputs = [
    { schemaId: "app.product-list", schemaVersion: "2" },
    { schemaId: "app.product-summary" },
  ];
  expect(
    missingOutputReason(
      outputs,
      observation([
        complete(),
        complete("app.product-summary", "1"),
        complete("app.extra"),
      ]),
    ),
  ).toBeUndefined();
  expect(missingOutputReason(outputs, observation([complete()]))).toContain(
    "app.product-summary (any version)",
  );
});
it.each([
  null,
  false,
  12,
  "app.product-list",
  [],
  { schemaId: "app.product-list", status: "streaming", data: {} },
  { schemaId: "app.product-list", status: "done" },
  complete("app.different"),
  complete("app.product-list", "1"),
  { schemaId: "app.product-list", status: "done", data: {} },
  { data: complete(), status: "done" },
])("rejects missing, partial, nested and version-mismatched output: %j", (output) => {
  expect(
    missingOutputReason(
      [{ schemaId: "app.product-list", schemaVersion: "2" }],
      observation([output]),
    ),
  ).toContain("app.product-list (version 2)");
});
it("reports all missing requirements and never treats historical events as finalized output", () => {
  const result = observation([]);
  result.events = [{ type: "structured-data", kind: "final", ...complete() }];
  expect(
    missingOutputReason(
      [
        { schemaId: "app.product-list" },
        { schemaId: "app.receipt", schemaVersion: "1" },
      ],
      result,
    ),
  ).toBe(
    "Required completed structured outputs were not observed: app.product-list (any version), app.receipt (version 1).",
  );
});
it.each([
  "app",
  "studio",
] as const)("missing output fails before references and %s semantic judging, stops the case and runs cleanup", async (grading) => {
  const reference = vi.fn(() => ({}));
  const grade = vi.fn((_input: EvalGradeInput) => ({
    passed: true,
    reason: "Good prose",
    evidence: [],
  }));
  const teardown = vi.fn();
  const execute = vi.fn(() => ({
    observation: { ...observation([]), text: "A convincing answer" },
  }));
  const scenario = suite(
    [{ schemaId: "app.product-list" }],
    ["Useful content"],
  );
  const item = scenario.cases[0];
  const step = item?.steps[0];
  if (!item || !step) throw new Error("Fixture case required");
  step.expect.reference = { using: "facts" };
  item.steps = [
    ...item.steps,
    {
      message: "Continue",
      expect: { type: "answer", outputs: [], criteria: [] },
    },
  ];
  const evals = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [scenario],
    setup: () => ({}),
    execute,
    references: { facts: reference },
    teardown,
    judge: { id: "fixture", version: "1", grade },
  });
  const result = await evals.run({ suiteId: scenario.id, grading });
  expect(result.status).toBe("failed");
  expect(result.counts.failed).toBe(1);
  expect(result.cases[0]?.steps).toHaveLength(1);
  expect(result.cases[0]?.steps[0]?.reason).toContain("app.product-list");
  expect(execute).toHaveBeenCalledOnce();
  expect(reference).not.toHaveBeenCalled();
  expect(grade).not.toHaveBeenCalled();
  expect(teardown).toHaveBeenCalledOnce();
  expect(EvalRunResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(
    result,
  );
});
it("output-only expectations run without a judge and are retained in manifests and revisions", async () => {
  const scenario = suite([
    { schemaId: "app.product-list" },
    { schemaId: "app.product-summary", schemaVersion: "1" },
  ]);
  const evals = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [scenario],
    execute: () => ({
      observation: observation([
        complete(),
        complete("app.product-summary", "1"),
      ]),
    }),
  });
  const result = await evals.run({ suiteId: scenario.id });
  expect(result.status).toBe("passed");
  expect(result.cases[0]?.steps[0]?.criteria).toEqual([]);
  expect(
    evals.describe().suites[0]?.cases[0]?.steps[0]?.expect.outputs,
  ).toEqual(scenario.cases[0]?.steps[0]?.expect.outputs);
  expect(EvalSuiteSchema.parse(scenario)).toEqual(scenario);
  expect(getEvalSuiteRevision(scenario)).not.toBe(
    getEvalSuiteRevision(
      suite([{ schemaId: "app.product-list", schemaVersion: "2" }]),
    ),
  );
});
it("successful output checks still use semantic judging rather than passing incorrect content", async () => {
  const scenario = suite(
    [{ schemaId: "app.product-list" }],
    ["Correct prices"],
  );
  const grade = vi.fn((_input: EvalGradeInput) => ({
    passed: false,
    reason: "Wrong price",
    evidence: [],
  }));
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [scenario],
    execute: () => ({ observation: observation([complete()]) }),
    judge: { id: "fixture", version: "1", grade },
  }).run({ suiteId: scenario.id });
  expect(result.status).toBe("failed");
  expect(grade).toHaveBeenCalledOnce();
  expect(grade.mock.calls[0]?.[0]?.observation.structured).toHaveLength(1);
});
it.each([
  { schemaId: "" },
  { schemaVersion: "1" },
  { schemaId: "app.product-list", schemaVersion: 1 },
  { schemaId: "app.product-list", schemaVersion: "" },
  { schemaId: "app.product-list", count: 2 },
])("rejects malformed output expectations at configuration time: %j", (output) => {
  expect(() =>
    createEvals({
      agent: { streamChat: vi.fn() },
      suites: [suite([output as EvalOutputExpectation])],
    }),
  ).toThrow();
});
it.each([
  "final",
  "partial",
  "invalidated",
] as const)("uses native finalized envelopes for %s streams, including structured-only answers", async (mode) => {
  const scenario = suite([
    { schemaId: "app.product-list" },
    { schemaId: "app.product-summary", schemaVersion: "1" },
  ]);
  const chunks: StreamChunk[] = [
    {
      type: "structured-data",
      streamId: "products",
      dataType: "products",
      schemaId: "app.product-list",
      schemaVersion: "2",
      kind: "final",
      data: { products: ["blue", "black"] },
    },
    {
      type: "structured-data",
      streamId: "summary",
      dataType: "summary",
      schemaId: "app.product-summary",
      schemaVersion: "1",
      ...(mode === "partial"
        ? { kind: "set" as const, path: "summary", value: "Draft" }
        : { kind: "final" as const, data: { summary: "Two backpacks" } }),
    },
    ...(mode === "invalidated"
      ? [
          {
            type: "structured-data-invalidated" as const,
            streamId: "summary",
            checkpointId: "checkpoint",
          },
        ]
      : []),
    { type: "done", data: { secret: "PRIVATE_STATE" } },
  ];
  const result = await createEvals({
    agent: {
      streamChat: async () =>
        (async function* () {
          yield* chunks;
        })(),
    },
    suites: [scenario],
  }).run({ suiteId: scenario.id });
  expect(result.status).toBe(mode === "final" ? "passed" : "failed");
  expect(result.cases[0]?.steps[0]?.observation.text).toBe("");
  expect(JSON.stringify(result)).not.toContain("PRIVATE_STATE");
  if (mode !== "final")
    expect(result.cases[0]?.steps[0]?.reason).toContain("app.product-summary");
});
it("checks outputs on an interrupt step and does not reuse them to satisfy a later resumed step", async () => {
  const scenario = defineSuite({
    id: "approval",
    cases: [
      {
        id: "review",
        steps: [
          {
            message: "Show products and ask approval",
            expect: {
              type: "interrupt",
              outputs: [{ schemaId: "app.product-list" }],
            },
          },
          {
            resume: { type: "text", text: "Approved" },
            expect: {
              type: "answer",
              outputs: [{ schemaId: "app.product-list" }],
            },
          },
        ],
      },
    ],
  });
  const execute = vi.fn(({ command }: { command: EvalCommand }) =>
    command.type === "message"
      ? {
          observation: {
            type: "interrupt" as const,
            text: "Approve?",
            structured: [complete()],
            interrupt: {
              requestId: "approval",
              kind: "text" as const,
              options: [],
            },
          },
          continuation: {},
        }
      : { observation: observation([]) },
  );
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [scenario],
    execute,
  }).run({ suiteId: scenario.id });
  expect(result.cases[0]?.steps.map((step) => step.status)).toEqual([
    "passed",
    "failed",
  ]);
});
