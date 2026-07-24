import type { TelemetryUnitPrice } from "@kortyx/telemetry-contracts";

export type DefaultModelRateCard = {
  provider: string;
  model: string;
  modality: string;
  currency: string;
  source: "default-rate-card";
  pricingRef: string;
  effectiveFrom: Date;
  unitPrices: TelemetryUnitPrice[];
  metadata?: Record<string, unknown>;
};

const textTokenPrices = (args: {
  inputMicrosPer1M: number;
  outputMicrosPer1M: number;
  reasoningMicrosPer1M?: number;
  cacheReadMicrosPer1M?: number;
}): TelemetryUnitPrice[] => [
  {
    usageType: "input",
    unit: "token",
    unitQuantity: 1_000_000,
    priceMicros: args.inputMicrosPer1M,
  },
  {
    usageType: "output",
    unit: "token",
    unitQuantity: 1_000_000,
    priceMicros: args.outputMicrosPer1M,
  },
  ...(args.reasoningMicrosPer1M !== undefined
    ? [
        {
          usageType: "reasoning" as const,
          unit: "token" as const,
          unitQuantity: 1_000_000,
          priceMicros: args.reasoningMicrosPer1M,
        },
      ]
    : []),
  ...(args.cacheReadMicrosPer1M !== undefined
    ? [
        {
          usageType: "cache_read" as const,
          unit: "token" as const,
          unitQuantity: 1_000_000,
          priceMicros: args.cacheReadMicrosPer1M,
        },
      ]
    : []),
];

export const DEFAULT_MODEL_RATE_CARDS: DefaultModelRateCard[] = [
  {
    provider: "google",
    model: "gemini-2.5-flash",
    modality: "text",
    currency: "USD",
    source: "default-rate-card",
    pricingRef: "google-gemini-2.5-flash-standard-pricing-2026-07",
    effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    unitPrices: textTokenPrices({
      inputMicrosPer1M: 300_000,
      outputMicrosPer1M: 2_500_000,
      reasoningMicrosPer1M: 2_500_000,
      cacheReadMicrosPer1M: 30_000,
    }),
    metadata: {
      sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
      note: "Gemini 2.5 Flash standard paid-tier text/image/video input and output pricing. Output pricing includes thinking tokens.",
    },
  },
  {
    provider: "openai",
    model: "gpt-4.1-mini",
    modality: "text",
    currency: "USD",
    source: "default-rate-card",
    pricingRef: "openai-pricing-gpt-4.1-mini-2026-07",
    effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    unitPrices: textTokenPrices({
      inputMicrosPer1M: 400_000,
      outputMicrosPer1M: 1_600_000,
      cacheReadMicrosPer1M: 100_000,
    }),
    metadata: {
      sourceUrl: "https://developers.openai.com/api/docs/models/gpt-4.1-mini",
    },
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    modality: "text",
    currency: "USD",
    source: "default-rate-card",
    pricingRef: "anthropic-haiku-4-5-launch-pricing-2026-07",
    effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    unitPrices: textTokenPrices({
      inputMicrosPer1M: 1_000_000,
      outputMicrosPer1M: 5_000_000,
    }),
    metadata: {
      sourceUrl: "https://www.anthropic.com/news/claude-haiku-4-5",
    },
  },
];
