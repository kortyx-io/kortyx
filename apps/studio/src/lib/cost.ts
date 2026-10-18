import type {
  StudioCostSummary,
  StudioPricingStatus,
} from "@kortyx/telemetry-contracts";
import { formatCurrency } from "./format";

export type CostDisplayValue = {
  cost?: number | null;
  currency?: string | null;
  pricingStatus?: StudioPricingStatus;
  costSummary?: StudioCostSummary;
};

export function costDisplay(value: CostDisplayValue) {
  const summary = value.costSummary ?? {
    amounts:
      value.cost == null
        ? []
        : [{ amount: value.cost, currency: value.currency ?? null }],
    complete:
      value.cost != null &&
      (!value.pricingStatus || value.pricingStatus === "priced"),
  };
  const amounts = summary.amounts.length
    ? summary.amounts
    : [{ amount: 0, currency: null }];
  const label = amounts
    .map(
      ({ amount, currency }) =>
        `${formatCurrency(amount, { currency })}${summary.complete ? "" : "+"}`,
    )
    .join(" / ");
  const note = summary.complete
    ? "Recorded model cost."
    : summary.amounts.length
      ? "Only model calls with known prices are included; the actual cost may be higher."
      : "No model call has a known price yet. $0.00+ does not mean free; the actual cost is unknown.";
  return {
    label,
    note: `${note}${amounts.length > 1 ? " Currencies are shown separately without conversion." : ""}`,
  };
}

export const averageCostDisplayValue = (metrics: {
  averageCost?: number | null;
  currency?: string | null;
  averageCostSummary?: StudioCostSummary;
}): CostDisplayValue => ({
  cost: metrics.averageCost,
  currency: metrics.currency,
  costSummary: metrics.averageCostSummary,
});
