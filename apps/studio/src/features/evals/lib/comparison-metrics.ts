import { evalFilterCost } from "./cost";
import type { CaseRow, ComparisonRow } from "./presentation";

type MetricCase = Pick<CaseRow, "status" | "durationMs" | "costs">;

export function comparisonMetric(
  row: {
    change: ComparisonRow["change"];
    baseline: MetricCase[];
    candidate: MetricCase[];
  },
  metric: "passRate" | "duration" | "cost",
) {
  if (row.change === "changed" || row.change === "incomplete") return undefined;
  const all = [...row.baseline, ...row.candidate];
  if (!row.baseline.length || !row.candidate.length) return undefined;
  if (metric === "cost") {
    const currencies = all.map((r) => r.costs?.total.currency);
    if (
      currencies.some((c) => !c) ||
      new Set(currencies).size !== 1 ||
      all.some((r) => r.costs?.total.status !== "complete")
    )
      return undefined;
  }
  const read = (r: MetricCase) =>
    metric === "passRate"
      ? r.status === "passed"
        ? 100
        : 0
      : metric === "duration"
        ? r.durationMs
        : evalFilterCost(r.costs);
  const mean = (rows: MetricCase[]) => {
    const values = rows.map(read);
    return values.some((v) => v == null || !Number.isFinite(v))
      ? undefined
      : (values as number[]).reduce((a, b) => a + b, 0) / values.length;
  };
  const left = mean(row.baseline),
    right = mean(row.candidate);
  return left === undefined || right === undefined ? undefined : right - left;
}
