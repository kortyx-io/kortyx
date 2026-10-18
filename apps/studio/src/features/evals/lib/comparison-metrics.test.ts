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
