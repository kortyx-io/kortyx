import { expect, it } from "vitest";
import { evalOutcomeUsage } from "../src/evals/usage";
import type { EvalWorkerOutcome } from "../src/evals/worker";

it.each([
  ["passed", "success"],
  ["failed", "quality_failed"],
  ["ungraded", "ungraded"],
  ["cancelled", "cancelled"],
  ["error", "failed"],
] as const)("projects persisted %s independently from admission", (status, outcome) => {
  const value = {
    result: { status, errors: [], cases: [] },
  } as unknown as EvalWorkerOutcome;
  expect(evalOutcomeUsage(value).outcome).toBe(outcome);
});
it("keeps deadline/cancellation facts separate from private diagnostic evidence", () => {
  const value = {
    error: "private failure",
    termination: {
      code: "EVAL_RUN_TIMEOUT",
      message: "private",
      timeoutMs: 123,
      diagnosticId: "private",
    },
  } as EvalWorkerOutcome;
  expect(evalOutcomeUsage(value)).toEqual({
    outcome: "failed",
    properties: {
      error_code: "EVAL_RUN_TIMEOUT",
      error_category: "workflow",
      retryable: false,
    },
  });
  expect(evalOutcomeUsage({ ...value, cancelled: true }).outcome).toBe(
    "cancelled",
  );
  expect(JSON.stringify(evalOutcomeUsage(value))).not.toContain("private");
});
it("classifies case failures without retaining original exceptions, case names or error messages", () => {
  const value = {
    error: "private failure",
    issue: {
      code: "PROVIDER_HTTP_ERROR",
      failure: {
        code: "PROVIDER_HTTP_ERROR",
        category: "provider",
        status: 429,
        retryable: true,
      },
      message: "private",
      exception: { data: { message: "private" } },
    },
  } as unknown as EvalWorkerOutcome;
  expect(evalOutcomeUsage(value).properties).toMatchObject({
    error_code: "PROVIDER_HTTP_ERROR",
    http_status: "429",
    retryable: true,
  });
  expect(JSON.stringify(evalOutcomeUsage(value))).not.toContain("private");
  expect(evalOutcomeUsage({})).toMatchObject({
    outcome: "failed",
    properties: { error_code: "UNCLASSIFIED_FAILURE" },
  });
});
