import { expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { parseEvalSuite } from "../src/evals/contracts";
import { defineSuite } from "../src/evals/index";
import type { EvalStep, EvalSuite } from "../src/evals/types";

const paramsSchema = z
  .object({ jobIds: z.array(z.string()).min(1).max(3) })
  .strict();
type JobParams = z.input<typeof paramsSchema>;

const steps: EvalStep[] = [
  { message: "Describe the job", expect: { type: "answer" } },
];

it("checks required case params through a generic and returns plain suite data", () => {
  const suite = defineSuite<JobParams>({
    id: "jobs",
    cases: [{ id: "description", params: { jobIds: ["barcelona"] }, steps }],
  });
  type Params = (typeof suite.cases)[number]["params"];
  expectTypeOf<Params>().toExtend<{ jobIds: string[] }>();
  expectTypeOf<{ jobIds: number[] }>().not.toExtend<Params>();
  expectTypeOf<Record<string, never>>().not.toExtend<Params>();
  const plainSuite: EvalSuite = suite;
  expect(plainSuite).toBe(suite);
  expect(suite).not.toHaveProperty("paramsSchema");
  expect(parseEvalSuite(JSON.parse(JSON.stringify(suite)))).toEqual(suite);
});

it("uses schema input types so transforms and defaults are applied by the runner", () => {
  const schema = z.object({
    count: z.string().transform(Number),
    actor: z.string().default("recruiter"),
  });
  const suite = defineSuite<z.input<typeof schema>>({
    id: "defaults",
    cases: [{ id: "one", params: { count: "2" }, steps }],
  });
  expectTypeOf(suite.cases[0]?.params.count).toEqualTypeOf<
    string | undefined
  >();
  expect(suite.cases[0]?.params).toEqual({ count: "2" });
});

it("allows omitted params only when the parameter type accepts undefined", () => {
  const suite = defineSuite<JobParams | undefined>({
    id: "optional",
    cases: [{ id: "no-fixture", steps }],
  });
  expectTypeOf<(typeof suite.cases)[number]["params"]>().toExtend<
    { jobIds: string[] } | undefined
  >();
  expect(suite.cases[0]).not.toHaveProperty("params");
});

it("supports suites without case params", () => {
  const suite = defineSuite({
    id: "conversation",
    cases: [{ id: "hello", steps }],
  });
  const plainSuite: EvalSuite = suite;
  expect(plainSuite).toBe(suite);
  expect(parseEvalSuite(suite)).toEqual(suite);
});

it("supports EvalSuite<T> directly without a helper", () => {
  const suite = {
    id: "jobs",
    cases: [{ id: "description", params: { jobIds: ["barcelona"] }, steps }],
  } satisfies EvalSuite<JobParams>;
  expectTypeOf(suite.cases[0]?.params.jobIds).toEqualTypeOf<
    string[] | undefined
  >();
  expect(parseEvalSuite(suite)).toEqual(suite);
});

// Compile-only assertions for the developer-facing helper and generic suite type.
function invalidDefinitions() {
  defineSuite<JobParams>({
    id: "jobs",
    // @ts-expect-error jobIds must be string[].
    cases: [{ id: "invalid", params: { jobIds: [123] }, steps }],
  });
  defineSuite<JobParams>({
    id: "jobs",
    // @ts-expect-error required params cannot be omitted.
    cases: [{ id: "missing", steps }],
  });
  defineSuite<JobParams>({
    id: "jobs",
    // @ts-expect-error typo does not satisfy the params type.
    cases: [{ id: "typo", params: { jobId: "barcelona" }, steps }],
  });
  const invalid: EvalSuite<JobParams> = {
    id: "jobs",
    // @ts-expect-error direct EvalSuite<T> checks params too.
    cases: [{ id: "invalid", params: { jobIds: [123] }, steps }],
  };
  void invalid;
}
void invalidDefinitions;
