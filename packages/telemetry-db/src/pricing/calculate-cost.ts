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
): TelemetryUsageItem[] | null => {
  const usage = isRecord(payload.usage) ? { ...payload.usage } : undefined;
  if (!usage) return [];
  const includesReasoning =
    usage.outputIncludesReasoning ?? payload.provider === "openai";
  // Reasoning is billed through output when already included in that count.
  if (includesReasoning) delete usage.reasoning;
  if (
    asNumber(usage.input) !== null &&
    (usage.inputIncludesCacheRead ??
      ["openai", "google", "mistral"].includes(String(payload.provider)))
  ) {
    usage.input = Math.max(
      0,
      (asNumber(usage.input) ?? 0) - (asNumber(usage.cacheRead) ?? 0),
    );
  }
  if (usage.inputIncludesCacheWrite && asNumber(usage.input) !== null)
    usage.input = Math.max(
      0,
      (asNumber(usage.input) ?? 0) - (asNumber(usage.cacheWrite) ?? 0),
    );
  // Anthropic reports TTL-specific writes in addition to the total.
  const raw = isRecord(usage.raw) ? usage.raw : {};
  const creation = isRecord(raw.cache_creation) ? raw.cache_creation : {};
  const write1h =
    asNumber(usage.cacheWrite1h) ??
    asNumber(creation.ephemeral_1h_input_tokens) ??
    0;
  const writeTotal = asNumber(usage.cacheWrite) ?? 0;
  if (write1h > writeTotal) return null;
  if (asNumber(usage.cacheWrite) !== null)
    usage.cacheWrite = writeTotal - write1h;
  const mapping: Array<[keyof typeof usage, TelemetryPricingUsageType]> = [
    ["input", "input"],
    ["output", "output"],
    ["reasoning", "reasoning"],
    ["cacheRead", "cache_read"],
    ["cacheWrite", "cache_write"],
  ];
  const items: TelemetryUsageItem[] = mapping.flatMap(([key, usageType]) => {
    const quantity = asNumber(usage[key]);
    return quantity !== null && quantity >= 0
      ? [{ usageType, quantity, unit: "token" as const }]
      : [];
  });
  if (write1h > 0)
    items.push({
      usageType: "cache_write",
      quantity: write1h,
      unit: "token",
      label: "1h",
    });
  return items;
};

const usageItemsFrom = (
  payload: Record<string, unknown>,
  hintUsageItems: TelemetryUsageItem[] | undefined,
): TelemetryUsageItem[] | null => {
  const standard = standardUsageItems(payload);
  return standard ? [...standard, ...(hintUsageItems ?? [])] : null;
};

const unitPriceMatches = (
  usage: TelemetryUsageItem,
  price: TelemetryUnitPrice,
): boolean =>
  usage.usageType === price.usageType &&
  usage.unit === price.unit &&
  usage.label === price.label;

const costFromUnitPrices = (
  usageItems: TelemetryUsageItem[],
  unitPrices: TelemetryUnitPrice[] | undefined,
): number | null => {
  if (!usageItems.length || !unitPrices?.length) return null;

  let total = 0;
  for (const usage of usageItems) {
    const price = unitPrices.find((candidate) =>
      unitPriceMatches(usage, candidate),
    );
    if (usage.quantity === 0) continue;
    if (!price) return null;
    total += Math.round(
      (usage.quantity / (price.unitQuantity ?? 1)) * price.priceMicros,
    );
  }

  return total;
};

const findRateCard = (
  event: TelemetryEventRecord,
  rateCards: ModelRateCard[],
): ModelRateCard | undefined => {
  const provider = asString(event.payload.provider);
  const model = asString(event.payload.model);
  if (!provider || !model) return undefined;

  const usage = isRecord(event.payload.usage) ? event.payload.usage : {};
  const raw = isRecord(usage.raw) ? usage.raw : {};
  const metadata = isRecord(event.payload.providerMetadata)
    ? event.payload.providerMetadata
    : {};
  const providerUsage = isRecord(metadata.usage) ? metadata.usage : raw;
  const tier = metadata.serviceTier ?? providerUsage.service_tier;
  const geography =
    metadata.inferenceGeo ?? providerUsage.inference_geo ?? metadata.region;
  const speed = metadata.speed ?? providerUsage.speed;
  const details = raw.promptTokensDetails;
  const hasAudio =
    Array.isArray(details) &&
    details.some(
      (detail) =>
        isRecord(detail) &&
        detail.modality === "AUDIO" &&
        (asNumber(detail.tokenCount) ?? 0) > 0,
    );
  const serverTools = isRecord(providerUsage.server_tool_use)
    ? providerUsage.server_tool_use
    : {};
  const hasServerTools = Object.values(serverTools).some(
    (value) => (asNumber(value) ?? 0) > 0,
  );

  return rateCards
    .filter((rate) => {
      if (
        normalize(rate.provider) !== normalize(provider) ||
        normalize(rate.model) !== normalize(model) ||
        rate.effectiveFrom > event.occurredAt ||
        (rate.effectiveTo && rate.effectiveTo <= event.occurredAt)
      )
        return false;
      const rules = isRecord(rate.metadata) ? rate.metadata : {};
      const allowedTiers = Array.isArray(rules.serviceTiers)
        ? rules.serviceTiers
        : undefined;
      if (allowedTiers && tier && !allowedTiers.includes(tier)) return false;
      // Default cards cover public, global, standard text inference only.
      if (!rate.projectId) {
        const tiers = allowedTiers ?? [
          "default",
          "standard",
          "on_demand",
          "auto",
        ];
        if (tier && !tiers.includes(tier)) return false;
        if (
          (geography && geography !== "global") ||
          (speed && speed !== "standard") ||
          hasAudio ||
          hasServerTools
        )
          return false;
      }
      const input = asNumber(usage.input);
      if (
        typeof rules.maxInputTokens === "number" &&
        (input === null || input > rules.maxInputTokens)
      )
        return false;
      if (
        typeof rules.minInputTokens === "number" &&
        (input === null || input < rules.minInputTokens)
      )
        return false;
      if (rules.utcSchedule) {
        const day = event.occurredAt.getUTCDay();
        const hour = event.occurredAt.getUTCHours();
        const peak =
          day >= 1 &&
          day <= 5 &&
          ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
        if (
          rules.utcSchedule !== (peak ? "deepseek-peak" : "deepseek-off-peak")
        )
          return false;
      }
      return true;
    })
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
  if (usageItems === null) return EMPTY_UNPRICED;
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
