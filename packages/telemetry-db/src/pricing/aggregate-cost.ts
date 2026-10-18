import type {
  StudioCostSummary,
  StudioPricingSource,
  StudioPricingStatus,
} from "@kortyx/telemetry-contracts";

export type Cost = {
  cost: number | null;
  currency: string | null;
  pricingStatus: StudioPricingStatus;
  pricingSource: StudioPricingSource;
  costSummary?: StudioCostSummary | undefined;
};
export type AggregatedCost = Cost & { costSummary: StudioCostSummary };

export const ZERO_MODEL_COST: AggregatedCost = {
  cost: 0,
  currency: null,
  pricingStatus: "priced",
  pricingSource: null,
  costSummary: { amounts: [{ amount: 0, currency: null }], complete: true },
};
export const UNKNOWN_COST: AggregatedCost = {
  cost: null,
  currency: null,
  pricingStatus: "unknown",
  pricingSource: null,
  costSummary: { amounts: [], complete: false },
};

/** Preserve known subtotals through nested aggregation without counting them twice. */
export const aggregateCost = (costs: Cost[]): AggregatedCost => {
  if (costs.length === 0) return UNKNOWN_COST;
  const amounts = new Map<string | null, number>();
  let complete = true;
  for (const cost of costs) {
    const summary = cost.costSummary ?? {
      amounts:
        cost.cost !== null && (cost.currency !== null || cost.cost === 0)
          ? [{ amount: cost.cost, currency: cost.currency }]
          : [],
      complete:
        cost.pricingStatus === "priced" &&
        cost.cost !== null &&
        (cost.currency !== null || cost.cost === 0),
    };
    complete &&= summary.complete;
    for (const value of summary.amounts) {
      amounts.set(
        value.currency,
        (amounts.get(value.currency) ?? 0) +
          Math.round(value.amount * 1_000_000),
      );
    }
  }
  // A confirmed zero needs no currency and can join any monetary subtotal.
  if (amounts.size > 1 && amounts.get(null) === 0) amounts.delete(null);
  const costSummary: StudioCostSummary = {
    amounts: [...amounts]
      .sort(([left], [right]) => (left ?? "").localeCompare(right ?? ""))
      .map(([currency, micros]) => ({ currency, amount: micros / 1_000_000 })),
    complete,
  };
  const single =
    costSummary.amounts.length === 1 ? costSummary.amounts[0] : undefined;
  const sources = [
    ...new Set(
      costs.flatMap((cost) => (cost.pricingSource ? [cost.pricingSource] : [])),
    ),
  ];
  const fullyPriced = complete && single !== undefined;
  return {
    // Preserve the legacy complete-total contract for older Studio consumers.
    cost: fullyPriced ? single.amount : null,
    currency: fullyPriced ? single.currency : null,
    pricingStatus: fullyPriced
      ? "priced"
      : amounts.size > 0 ||
          costs.some((cost) => cost.pricingStatus === "unpriced")
        ? "unpriced"
        : "unknown",
    pricingSource:
      fullyPriced && sources.length === 1 ? (sources[0] ?? null) : null,
    costSummary,
  };
};

export const averageCostSummary = (
  summary: StudioCostSummary,
  runCount: number,
): StudioCostSummary => ({
  amounts:
    runCount > 0
      ? summary.amounts.map((value) => ({
          ...value,
          amount: value.amount / runCount,
        }))
      : [],
  complete: runCount > 0 && summary.complete,
});
