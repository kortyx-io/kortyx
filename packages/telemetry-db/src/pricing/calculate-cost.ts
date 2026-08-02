import {
  TelemetryPricingHintSchema,
  type TelemetryPricingLineItem,
  type TelemetryPricingSource,
  type TelemetryPricingUsageType,
  type TelemetryUnitPrice,
  type TelemetryUsageItem,
} from "@kortyx/telemetry-contracts";
import type { ModelRateCard, TelemetryEventRecord } from "../schema";

export type CalculatedCost = {
  costMicros: number | null;
  cost: number | null;
  currency: string | null;
  pricingStatus: "priced" | "unpriced" | "unknown";
  pricingSource: TelemetryPricingSource | null;
  pricingRef: string | null;
};

const EMPTY_UNKNOWN: CalculatedCost = {
  costMicros: null,
  cost: null,
  currency: null,
  pricingStatus: "unknown",
  pricingSource: null,
  pricingRef: null,
};

const EMPTY_UNPRICED: CalculatedCost = {
  costMicros: null,
  cost: null,
  currency: null,
  pricingStatus: "unpriced",
  pricingSource: null,
  pricingRef: null,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const normalize = (value: string): string => value.trim().toLowerCase();

const toCost = (args: {
  costMicros: number;
  currency: string;
  pricingSource: TelemetryPricingSource;
  pricingRef?: string | null | undefined;
}): CalculatedCost => ({
  costMicros: args.costMicros,
  cost: args.costMicros / 1_000_000,
  currency: args.currency,
  pricingStatus: "priced",
  pricingSource: args.pricingSource,
  pricingRef: args.pricingRef ?? null,
});

const lineItemCostMicros = (item: TelemetryPricingLineItem): number =>
  item.totalCostMicros ??
  Math.round(
    (item.quantity / (item.unitQuantity ?? 1)) * (item.unitPriceMicros ?? 0),
  );

const lineItemsCostMicros = (
  lineItems: TelemetryPricingLineItem[] | undefined,
): number | null => {
  if (!lineItems?.length) return null;
  return lineItems.reduce((sum, item) => sum + lineItemCostMicros(item), 0);
};

const standardUsageItems = (
  payload: Record<string, unknown>,
): TelemetryUsageItem[] => {
  const usage = isRecord(payload.usage) ? payload.usage : undefined;
  if (!usage) return [];
  const mapping: Array<[keyof typeof usage, TelemetryPricingUsageType]> = [
    ["input", "input"],
    ["output", "output"],
    ["reasoning", "reasoning"],
    ["cacheRead", "cache_read"],
    ["cacheWrite", "cache_write"],
  ];
  return mapping.flatMap(([key, usageType]) => {
    const quantity = asNumber(usage[key]);
    return quantity && quantity > 0
      ? [{ usageType, quantity, unit: "token" as const }]
      : [];
  });
};

const usageItemsFrom = (
  payload: Record<string, unknown>,
  hintUsageItems: TelemetryUsageItem[] | undefined,
): TelemetryUsageItem[] => [
  ...standardUsageItems(payload),
  ...(hintUsageItems ?? []),
];

const unitPriceMatches = (
  usage: TelemetryUsageItem,
  price: TelemetryUnitPrice,
): boolean => usage.usageType === price.usageType && usage.unit === price.unit;

const costFromUnitPrices = (
  usageItems: TelemetryUsageItem[],
  unitPrices: TelemetryUnitPrice[] | undefined,
): number | null => {
  if (!usageItems.length || !unitPrices?.length) return null;

  let total = 0;
  let matched = false;
  for (const usage of usageItems) {
    const price = unitPrices.find((candidate) =>
      unitPriceMatches(usage, candidate),
    );
    if (!price) continue;
    matched = true;
    total += Math.round(
      (usage.quantity / (price.unitQuantity ?? 1)) * price.priceMicros,
    );
  }

  return matched ? total : null;
};

const findRateCard = (
  event: TelemetryEventRecord,
  rateCards: ModelRateCard[],
): ModelRateCard | undefined => {
  const provider = asString(event.payload.provider);
  const model = asString(event.payload.model);
  if (!provider || !model) return undefined;

  return rateCards
    .filter(
      (rate) =>
        normalize(rate.provider) === normalize(provider) &&
        normalize(rate.model) === normalize(model) &&
        rate.effectiveFrom <= event.occurredAt &&
        (!rate.effectiveTo || rate.effectiveTo > event.occurredAt),
    )
    .sort((a, b) => {
      if (a.projectId && !b.projectId) return -1;
      if (!a.projectId && b.projectId) return 1;
      return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
    })[0];
};

export const calculateGenerationCost = (
  event: TelemetryEventRecord,
  rateCards: ModelRateCard[],
): CalculatedCost => {
  if (event.type !== "generation.completed") return EMPTY_UNKNOWN;

  const hintResult = TelemetryPricingHintSchema.safeParse(
    event.payload.pricing,
  );
  const hint = hintResult.success ? hintResult.data : undefined;

  if (hint?.actualCostMicros !== undefined) {
    return toCost({
      costMicros: hint.actualCostMicros,
      currency: hint.currency,
      pricingSource: hint.source,
      pricingRef: hint.pricingRef,
    });
  }

  const hintLineItemsCost = lineItemsCostMicros(hint?.lineItems);
  if (hint && hintLineItemsCost !== null) {
    return toCost({
      costMicros: hintLineItemsCost,
      currency: hint.currency,
      pricingSource: hint.source,
      pricingRef: hint.pricingRef,
    });
  }

  const usageItems = usageItemsFrom(event.payload, hint?.usageItems);
  const hintUnitPriceCost = costFromUnitPrices(usageItems, hint?.unitPrices);
  if (hint && hintUnitPriceCost !== null) {
    return toCost({
      costMicros: hintUnitPriceCost,
      currency: hint.currency,
      pricingSource: hint.source,
      pricingRef: hint.pricingRef,
    });
  }

  const rateCard = findRateCard(event, rateCards);
  if (rateCard) {
    const rateCardCost = costFromUnitPrices(usageItems, rateCard.unitPrices);
    if (rateCardCost !== null) {
      return toCost({
        costMicros: rateCardCost,
        currency: rateCard.currency,
        pricingSource: rateCard.projectId
          ? "project-rate-card"
          : "default-rate-card",
        pricingRef: rateCard.pricingRef,
      });
    }
  }

  return usageItems.length > 0 || hint ? EMPTY_UNPRICED : EMPTY_UNKNOWN;
};
