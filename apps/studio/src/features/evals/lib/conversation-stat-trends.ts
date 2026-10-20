import type { ChangeSide, ConversationChange } from "./evaluation-changes";

export type ConversationStat =
  | "passRate"
  | "passed"
  | "failed"
  | "error"
  | "cancelled"
  | "unassessed"
  | "duration"
  | "meanDuration"
  | "cost"
  | "meanCost";
export type StatTrend = {
  delta: number;
  improvement: boolean | null;
  unit: "percent" | "count" | "duration" | "cost";
  currency?: string;
};
export function outcomeCount(side: ChangeSide, status: string) {
  return side.repetitions.filter((item) => item.status === status).length;
}
export function pricedConversationCost(side: ChangeSide) {
  const value = side.costs?.total;
  if (
    value?.status !== "complete" ||
    value.amount === null ||
    !value.currency ||
    value.costSummary?.complete === false
  )
    return undefined;
  return { amount: value.amount, currency: value.currency };
}
function value(side: ChangeSide, metric: ConversationStat): number | undefined {
  if (!side.total) return undefined;
  if (metric === "passRate") return (side.passed / side.total) * 100;
  if (metric === "passed") return side.passed;
  if (metric === "unassessed")
    return (
      side.total -
      ["passed", "failed", "error", "cancelled"].reduce(
        (sum, status) => sum + outcomeCount(side, status),
        0,
      )
    );
  if (metric === "duration" || metric === "meanDuration")
    return side.durationMs === undefined
      ? undefined
      : side.durationMs / (metric === "meanDuration" ? side.total : 1);
  if (metric === "cost" || metric === "meanCost")
    return pricedConversationCost(side) === undefined
      ? undefined
      : (pricedConversationCost(side)?.amount ?? 0) /
          (metric === "meanCost" ? side.total : 1);
  return outcomeCount(side, metric);
}
/** Totals/counts describe spend and volume; unequal repetition counts cannot imply better performance. */
export function conversationStatTrend(
  row: ConversationChange,
  metric: ConversationStat,
): StatTrend | undefined {
  if (row.kind === "review") return undefined;
  const a = value(row.earlier, metric),
    b = value(row.current, metric);
  if (a === undefined || b === undefined) return undefined;
  const currency = pricedConversationCost(row.current)?.currency;
  if (
    (metric === "cost" || metric === "meanCost") &&
    currency !== pricedConversationCost(row.earlier)?.currency
  )
    return undefined;
  const delta = Math.abs(b - a) < 1e-9 ? 0 : b - a;
  const normalized = ["passRate", "meanDuration", "meanCost"].includes(metric);
  const lowerIsBetter = !["passRate", "passed"].includes(metric);
  return {
    delta,
    improvement:
      !normalized && row.earlier.total !== row.current.total
        ? null
        : delta === 0
          ? null
          : lowerIsBetter
            ? delta < 0
            : delta > 0,
    unit:
      metric === "passRate"
        ? "percent"
        : metric === "duration" || metric === "meanDuration"
          ? "duration"
          : metric === "cost" || metric === "meanCost"
            ? "cost"
            : "count",
    ...(metric === "cost" || metric === "meanCost" ? { currency } : {}),
  };
}
