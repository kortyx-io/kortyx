import { expect, it } from "vitest";
import { comparisonMetric } from "./comparison-metrics";
import type { CaseRow, ComparisonRow } from "./presentation";

const attempt = (status: string, durationMs?: number) =>
  ({ status, durationMs }) as CaseRow;
const row: ComparisonRow = {
  id: "case",
  name: "Case",
  change: "improved",
  baseline: [attempt("failed", 100), attempt("passed", 300)],
  candidate: [attempt("passed", 400)],
};
it("compares mean duration and pass-rate percentage points across differing attempt counts", () => {
  expect(comparisonMetric(row, "duration")).toBe(200);
  expect(comparisonMetric(row, "passRate")).toBe(50);
});
it("does not invent deltas for context changes, incomplete evidence or missing cost", () => {
  expect(
    comparisonMetric({ ...row, change: "changed" }, "passRate"),
  ).toBeUndefined();
  expect(
    comparisonMetric({ ...row, candidate: [attempt("passed")] }, "duration"),
  ).toBeUndefined();
  expect(comparisonMetric(row, "cost")).toBeUndefined();
});

it("compares mean cost instead of total spend when repetition counts differ", () => {
  const priced = (amount: number, currency = "USD", status = "complete") =>
    ({
      ...attempt("passed"),
      costs: { total: { amount, currency, status } },
    }) as CaseRow;
  const pricedRow = {
    ...row,
    baseline: [priced(0.1), priced(0.3)],
    candidate: [priced(0.25)],
  };
  expect(comparisonMetric(pricedRow, "cost")).toBeCloseTo(0.05);
  expect(
    comparisonMetric(
      { ...pricedRow, candidate: [priced(0.25, "EUR")] },
      "cost",
    ),
  ).toBeUndefined();
  expect(
    comparisonMetric(
      { ...pricedRow, candidate: [priced(0.25, "USD", "partial")] },
      "cost",
    ),
  ).toBeUndefined();
});
