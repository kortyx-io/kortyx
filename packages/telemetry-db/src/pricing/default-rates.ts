import type { TelemetryUnitPrice } from "@kortyx/telemetry-contracts";

export type DefaultModelRateCard = {
  provider: string;
  model: string;
  modality: string;
  currency: string;
  source: "default-rate-card";
  pricingRef: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  unitPrices: TelemetryUnitPrice[];
  metadata?: Record<string, unknown>;
};

const textTokenPrices = (args: {
  inputMicrosPer1M: number;
  outputMicrosPer1M: number;
  reasoningMicrosPer1M?: number;
  cacheReadMicrosPer1M?: number;
  cacheWriteMicrosPer1M?: number;
  cacheWrite1hMicrosPer1M?: number;
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
  ...(args.cacheWriteMicrosPer1M !== undefined
    ? [
        {
          usageType: "cache_write" as const,
          unit: "token" as const,
          unitQuantity: 1_000_000,
          priceMicros: args.cacheWriteMicrosPer1M,
        },
      ]
    : []),
  ...(args.cacheWrite1hMicrosPer1M !== undefined
    ? [
        {
          usageType: "cache_write" as const,
          unit: "token" as const,
          label: "1h",
          unitQuantity: 1_000_000,
          priceMicros: args.cacheWrite1hMicrosPer1M,
        },
      ]
    : []),
];

export const LEGACY_MODEL_RATE_CARDS: DefaultModelRateCard[] = [
  {
    provider: "openai",
    model: "gpt-5.6-luna",
    modality: "text",
    currency: "USD",
    source: "default-rate-card",
    pricingRef: "openai-gpt-5.6-luna-standard-short-context-2026-09-11",
    effectiveFrom: new Date("2026-09-11T00:00:00.000Z"),
    unitPrices: [
      ...textTokenPrices({
        inputMicrosPer1M: 200_000,
        outputMicrosPer1M: 1_200_000,
        cacheReadMicrosPer1M: 20_000,
      }),
      {
        usageType: "cache_write",
        unit: "token",
        unitQuantity: 1_000_000,
        priceMicros: 250_000,
      },
    ],
    metadata: {
      sourceUrl: "https://developers.openai.com/api/docs/pricing",
      maxInputTokens: 272_000,
      serviceTiers: ["default", "auto"],
      note: "Standard short-context pricing. Other tiers and long context require a project rate card.",
    },
  },
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
      cacheReadMicrosPer1M: 100_000,
      cacheWriteMicrosPer1M: 1_250_000,
      cacheWrite1hMicrosPer1M: 2_000_000,
    }),
    metadata: {
      sourceUrl: "https://www.anthropic.com/news/claude-haiku-4-5",
    },
  },
];

// New observations begin on the verification date, not an assumed launch date.
const VERIFIED_FROM = new Date("2026-09-17T00:00:00Z");
const SOURCES = {
  openai: "https://developers.openai.com/api/docs/pricing",
  anthropic: "https://platform.claude.com/docs/en/about-claude/pricing",
  google: "https://ai.google.dev/gemini-api/docs/pricing",
  deepseek: "https://api-docs.deepseek.com/quick_start/pricing/",
  mistral: "https://docs.mistral.ai/inference/pricing",
  groq: "https://console.groq.com/docs/models",
};

type Provider = keyof typeof SOURCES;
type TokenRates = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
};

const cards = (
  provider: Provider,
  models: string[],
  rates: TokenRates,
  variant = "standard",
  metadata: Record<string, unknown> = {},
  effectiveFrom = VERIFIED_FROM,
  effectiveTo?: Date,
): DefaultModelRateCard[] =>
  models.map((model) => ({
    provider,
    model,
    modality: "text",
    currency: "USD",
    source: "default-rate-card",
    pricingRef: `${provider}-${model}-${variant}-${effectiveFrom.toISOString().slice(0, 10)}`,
    effectiveFrom,
    ...(effectiveTo ? { effectiveTo } : {}),
    unitPrices: textTokenPrices({
      inputMicrosPer1M: Math.round(rates.input * 1_000_000),
      outputMicrosPer1M: Math.round(rates.output * 1_000_000),
      ...(provider === "google"
        ? { reasoningMicrosPer1M: Math.round(rates.output * 1_000_000) }
        : {}),
      ...(rates.cacheRead !== undefined
        ? { cacheReadMicrosPer1M: Math.round(rates.cacheRead * 1_000_000) }
        : {}),
      ...(rates.cacheWrite !== undefined
        ? { cacheWriteMicrosPer1M: Math.round(rates.cacheWrite * 1_000_000) }
        : {}),
      ...(rates.cacheWrite1h !== undefined
        ? {
            cacheWrite1hMicrosPer1M: Math.round(rates.cacheWrite1h * 1_000_000),
          }
        : {}),
    }),
    metadata: {
      sourceUrl:
        provider === "openai"
          ? `https://developers.openai.com/api/docs/models/${model === "gpt-5.6" ? "gpt-5.6-sol" : model}`
          : SOURCES[provider],
      verifiedAt: "2026-09-17",
      serviceTiers: ["default", "standard", "on_demand", "auto"],
      ...metadata,
    },
  }));

const contextCards = (
  provider: Provider,
  models: string[],
  rates: TokenRates,
  threshold: number,
) => [
  ...cards(provider, models, rates, "standard-short-context", {
    maxInputTokens: threshold,
  }),
  ...cards(
    provider,
    models,
    {
      input: rates.input * 2,
      output: rates.output * 1.5,
      ...(rates.cacheRead !== undefined
        ? { cacheRead: rates.cacheRead * 2 }
        : {}),
      ...(rates.cacheWrite !== undefined
        ? { cacheWrite: rates.cacheWrite * 2 }
        : {}),
    },
    "standard-long-context",
    { minInputTokens: threshold + 1 },
  ),
];

const claudeCards = (
  models: string[],
  input: number,
  output: number,
  maxInputTokens?: number,
  cacheRead = input * 0.1,
) =>
  cards(
    "anthropic",
    models,
    {
      input,
      output,
      cacheRead,
      cacheWrite: input * 1.25,
      cacheWrite1h: input * 2,
    },
    "standard",
    maxInputTokens ? { maxInputTokens } : {},
  );

const flashPromotion = (models: string[]) => [
  ...cards(
    "google",
    models,
    { input: 0.75, output: 3.75, cacheRead: 0.075 },
    "standard-promotion",
    {},
    VERIFIED_FROM,
    new Date("2027-01-01T00:00:00Z"),
  ),
  ...cards(
    "google",
    models,
    { input: 1.5, output: 7.5, cacheRead: 0.15 },
    "standard",
    {},
    new Date("2027-01-01T00:00:00Z"),
  ),
];

const deepseekCards = (
  models: string[],
  input: number,
  output: number,
  cacheRead: number,
) => [
  ...cards("deepseek", models, { input, output, cacheRead }, "peak", {
    utcSchedule: "deepseek-peak",
  }),
  ...cards(
    "deepseek",
    models,
    { input: input / 2, output: output / 2, cacheRead: cacheRead / 2 },
    "off-peak",
    { utcSchedule: "deepseek-off-peak" },
  ),
];

export const DEFAULT_MODEL_RATE_CARDS: DefaultModelRateCard[] = [
  ...LEGACY_MODEL_RATE_CARDS,
  ...contextCards(
    "openai",
    ["gpt-6-astra"],
    { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    272_000,
  ),
  ...contextCards(
    "openai",
    ["gpt-5.6", "gpt-5.6-sol"],
    { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
    272_000,
  ),
  ...contextCards(
    "openai",
    ["gpt-5.6-terra"],
    { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 },
    272_000,
  ),
  ...contextCards(
    "openai",
    ["gpt-5.6-luna"],
    { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
    272_000,
  ),
  ...contextCards(
    "openai",
    ["gpt-5.4"],
    { input: 2.5, output: 15, cacheRead: 0.25 },
    272_000,
  ),
  ...contextCards(
    "openai",
    ["gpt-5.4-pro"],
    { input: 30, output: 180 },
    272_000,
  ),
  ...cards("openai", ["gpt-5.4-mini"], {
    input: 0.75,
    output: 4.5,
    cacheRead: 0.075,
  }),
  ...cards("openai", ["gpt-5.4-nano"], {
    input: 0.2,
    output: 1.25,
    cacheRead: 0.02,
  }),
  ...cards("openai", ["gpt-4.1"], { input: 2, output: 8, cacheRead: 0.5 }),
  ...cards("openai", ["gpt-4.1-mini"], {
    input: 0.4,
    output: 1.6,
    cacheRead: 0.1,
  }),
  ...cards("openai", ["gpt-4o"], { input: 2.5, output: 10, cacheRead: 1.25 }),
  ...cards("openai", ["gpt-4o-mini"], {
    input: 0.15,
    output: 0.6,
    cacheRead: 0.075,
  }),
  ...cards("openai", ["o4-mini"], {
    input: 1.1,
    output: 4.4,
    cacheRead: 0.275,
  }),
  ...claudeCards(["claude-fable-5-1"], 10, 50, undefined, 0.25),
  ...claudeCards(
    [
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-opus-4-5",
      "claude-opus-4-5-20251101",
    ],
    5,
    25,
  ),
  ...claudeCards(["claude-sonnet-5"], 2, 10),
  ...claudeCards(["claude-sonnet-4-6"], 3, 15),
  ...claudeCards(
    ["claude-sonnet-4-5", "claude-sonnet-4-5-20250929"],
    3,
    15,
    200_000,
  ),
  ...claudeCards(["claude-haiku-4-5", "claude-haiku-4-5-20251001"], 1, 5),
  ...flashPromotion([
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
  ]),
  ...cards("google", ["gemini-3.5-flash"], {
    input: 1.5,
    output: 9,
    cacheRead: 0.15,
  }),
  ...cards("google", ["gemini-3.5-flash-lite"], {
    input: 0.3,
    output: 2.5,
    cacheRead: 0.03,
  }),
  ...cards("google", ["gemini-3.1-flash-lite"], {
    input: 0.25,
    output: 1.5,
    cacheRead: 0.025,
  }),
  ...contextCards(
    "google",
    ["gemini-3.1-pro-preview"],
    { input: 2, output: 12, cacheRead: 0.2 },
    200_000,
  ),
  ...cards("google", ["gemini-3-flash-preview"], {
    input: 0.5,
    output: 3,
    cacheRead: 0.05,
  }),
  ...contextCards(
    "google",
    ["gemini-2.5-pro"],
    { input: 1.25, output: 10, cacheRead: 0.125 },
    200_000,
  ),
  ...cards("google", ["gemini-2.5-flash"], {
    input: 0.3,
    output: 2.5,
    cacheRead: 0.03,
  }),
  ...cards("google", ["gemini-2.5-flash-lite"], {
    input: 0.1,
    output: 0.4,
    cacheRead: 0.01,
  }),
  ...deepseekCards(["deepseek-flash", "deepseek-v4-flash"], 0.3, 1.2, 0.006),
  ...deepseekCards(["deepseek-v4-pro"], 1.32, 3.96, 0.044),
  ...cards("mistral", ["mistral-medium-3-5", "mistral-medium-latest"], {
    input: 1.5,
    output: 7.5,
    cacheRead: 0.15,
  }),
  ...cards("mistral", ["mistral-large-latest", "mistral-large-2512"], {
    input: 0.5,
    output: 1.5,
    cacheRead: 0.05,
  }),
  ...cards("mistral", ["mistral-small-latest", "mistral-small-2603"], {
    input: 0.15,
    output: 0.6,
    cacheRead: 0.015,
  }),
  ...cards("mistral", ["ministral-3b-latest"], {
    input: 0.1,
    output: 0.1,
    cacheRead: 0.01,
  }),
  ...cards("mistral", ["ministral-8b-latest"], {
    input: 0.15,
    output: 0.15,
    cacheRead: 0.015,
  }),
  ...cards("mistral", ["ministral-14b-latest"], {
    input: 0.2,
    output: 0.2,
    cacheRead: 0.02,
  }),
  ...cards("groq", ["openai/gpt-oss-120b"], {
    input: 0.15,
    output: 0.6,
    cacheRead: 0.075,
  }),
  ...cards(
    "groq",
    ["openai/gpt-oss-20b"],
    { input: 0.075, output: 0.3, cacheRead: 0.0375 },
    "standard",
    {
      sourceUrl: "https://console.groq.com/docs/prompt-caching",
      note: "50% cache discount; model page rounds cached input to $0.037.",
    },
  ),
  ...cards("groq", ["qwen/qwen3.6-27b"], { input: 0.6, output: 3 }),
  ...cards("groq", ["qwen/qwen3.8-27b"], { input: 0.8, output: 4 }),
];
