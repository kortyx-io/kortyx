import type { EvalCosts } from "@kortyx/agent/evals";
import type { StatTrend } from "./conversation-stat-trends";
import type { ComparisonRow } from "./presentation";

/** Compare the two chosen executions, never aggregate or average other repetitions. */
export function repetitionStatTrend(
  row: ComparisonRow | undefined,
  metric: "duration" | keyof EvalCosts,
): StatTrend | undefined {
  if (
    !row ||
    row.change === "changed" ||
    row.change === "incomplete" ||
    row.baseline.length !== 1 ||
    row.candidate.length !== 1
  )
    return undefined;
  const a = row.baseline[0],
    b = row.candidate[0];
  if (metric === "duration") {
    if (a.durationMs === undefined || b.durationMs === undefined)
      return undefined;
    const delta = b.durationMs - a.durationMs;
    return {
      delta,
      improvement: delta === 0 ? null : delta < 0,
      unit: "duration",
    };
  }
  const left = a.costs?.[metric],
    right = b.costs?.[metric];
  if (
    !left ||
    !right ||
    left.status !== "complete" ||
    right.status !== "complete" ||
    !left.currency ||
    left.currency !== right.currency ||
    left.amount === null ||
    right.amount === null ||
    left.costSummary?.complete === false ||
    right.costSummary?.complete === false
  )
    return undefined;
  const delta =
    Math.abs(right.amount - left.amount) < 1e-9
      ? 0
      : right.amount - left.amount;
  return {
    delta,
    improvement: delta === 0 ? null : delta < 0,
    unit: "cost",
    currency: right.currency,
  };
}
