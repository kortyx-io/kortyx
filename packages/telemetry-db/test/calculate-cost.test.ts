import { describe, expect, it } from "vitest";
import { calculateGenerationCost } from "../src/pricing/calculate-cost";
import { DEFAULT_MODEL_RATE_CARDS } from "../src/pricing/default-rates";
import type { ModelRateCard, TelemetryEventRecord } from "../src/schema";

const baseEvent = (payload: Record<string, unknown>): TelemetryEventRecord =>
  ({
    type: "generation.completed",
    occurredAt: new Date("2026-07-04T00:00:00.000Z"),
    payload,
  }) as TelemetryEventRecord;

describe("calculateGenerationCost", () => {
  it("uses SDK/provider actual cost when supplied", () => {
    const result = calculateGenerationCost(
      baseEvent({
        pricing: {
          source: "provider",
          currency: "USD",
          actualCostMicros: 12_345,
          pricingRef: "provider-bill",
        },
      }),
      [],
    );

    expect(result).toMatchObject({
      costMicros: 12_345,
      cost: 0.012345,
      currency: "USD",
      pricingStatus: "priced",
      pricingSource: "provider",
      pricingRef: "provider-bill",
    });
  });

  it("uses OpenRouter's reported cost from existing provider metadata", () => {
    const result = calculateGenerationCost(
      baseEvent({
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4.6",
        usage: { input: 468, output: 10, total: 478 },
        providerMetadata: { cost: 0.001554 },
      }),
      [],
    );

    expect(result).toMatchObject({
      costMicros: 1_554,
      cost: 0.001554,
      currency: "USD",
      pricingStatus: "priced",
      pricingSource: "provider",
    });
  });

  it("uses custom SDK unit prices for non-token usage", () => {
    const result = calculateGenerationCost(
      baseEvent({
        pricing: {
          source: "custom",
          currency: "USD",
          usageItems: [
            { usageType: "image_output", quantity: 2, unit: "image" },
          ],
          unitPrices: [
            {
              usageType: "image_output",
              unit: "image",
              unitQuantity: 1,
              priceMicros: 40_000,
            },
          ],
        },
      }),
      [],
    );

    expect(result).toMatchObject({
      costMicros: 80_000,
      cost: 0.08,
      pricingSource: "custom",
    });
  });

  it("falls back to matching DB rate cards for token usage", () => {
    const result = calculateGenerationCost(
      baseEvent({
        provider: "openai",
        model: "gpt-4.1-mini",
        usage: { input: 1_000_000, output: 500_000 },
      }),
      [
        {
          projectId: null,
          provider: "openai",
          model: "gpt-4.1-mini",
          currency: "USD",
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          effectiveTo: null,
          pricingRef: "default",
          unitPrices: [
            {
              usageType: "input",
              unit: "token",
              unitQuantity: 1_000_000,
              priceMicros: 400_000,
            },
            {
              usageType: "output",
              unit: "token",
              unitQuantity: 1_000_000,
              priceMicros: 1_600_000,
            },
          ],
        } as ModelRateCard,
      ],
    );

    expect(result).toMatchObject({
      costMicros: 1_200_000,
      cost: 1.2,
      pricingStatus: "priced",
      pricingSource: "default-rate-card",
    });
  });

  it("prices Gemini 2.5 Flash standard text usage with reasoning tokens", () => {
    const result = calculateGenerationCost(
      baseEvent({
        provider: "google",
        model: "gemini-2.5-flash",
        usage: { input: 1_000_000, output: 500_000, reasoning: 100_000 },
      }),
      DEFAULT_MODEL_RATE_CARDS as ModelRateCard[],
    );

    expect(result).toMatchObject({
      costMicros: 1_800_000,
      cost: 1.8,
      currency: "USD",
      pricingStatus: "priced",
      pricingSource: "default-rate-card",
      pricingRef: "google-gemini-2.5-flash-standard-pricing-2026-07",
    });
  });
});

it("does not double bill cached input or reasoning already included in OpenAI output", () => {
  const event = baseEvent({
    provider: "openai",
    model: "gpt-4.1-mini",
    usage: {
      input: 1_000_000,
      output: 500_000,
      reasoning: 100_000,
      cacheRead: 250_000,
    },
  });
  expect(
    calculateGenerationCost(event, DEFAULT_MODEL_RATE_CARDS as ModelRateCard[]),
  ).toMatchObject({ costMicros: 1_125_000 });
});

it("prices Luna cache writes separately and leaves unsupported tiers unpriced", () => {
  const event = {
    ...baseEvent({
      provider: "openai",
      model: "gpt-5.6-luna",
      usage: {
        input: 100_000,
        output: 10_000,
        reasoning: 5_000,
        cacheRead: 20_000,
        cacheWrite: 10_000,
        inputIncludesCacheWrite: true,
        outputIncludesReasoning: true,
      },
    }),
    occurredAt: new Date("2026-09-11T00:00:00Z"),
  };
  expect(
    calculateGenerationCost(event, DEFAULT_MODEL_RATE_CARDS as ModelRateCard[]),
  ).toMatchObject({ costMicros: 28_900 });
  expect(
    calculateGenerationCost(
      {
        ...event,
        payload: {
          ...event.payload,
          providerMetadata: { serviceTier: "priority" },
        },
      },
      DEFAULT_MODEL_RATE_CARDS as ModelRateCard[],
    ),
  ).toMatchObject({ pricingStatus: "unpriced" });
});

it("requires unit prices for every positive usage item and matches labels exactly", () => {
  const event = baseEvent({
    usage: { input: 100, output: 10 },
    pricing: {
      source: "custom",
      currency: "USD",
      unitPrices: [{ usageType: "input", unit: "token", priceMicros: 1 }],
    },
  });
  expect(calculateGenerationCost(event, []).pricingStatus).toBe("unpriced");
  const labelled = baseEvent({
    pricing: {
      source: "custom",
      currency: "USD",
      usageItems: [
        { usageType: "cache_write", unit: "token", quantity: 20, label: "1h" },
      ],
      unitPrices: [
        { usageType: "cache_write", unit: "token", priceMicros: 1 },
        {
          usageType: "cache_write",
          unit: "token",
          priceMicros: 2,
          label: "1h",
        },
      ],
    },
  });
  expect(calculateGenerationCost(labelled, []).costMicros).toBe(40);
});

it("keeps project rate cards ahead of default cards for custom tiers", () => {
  const rate = DEFAULT_MODEL_RATE_CARDS.find(
    (rate) => rate.model === "gpt-4.1-mini",
  );
  const event = baseEvent({
    provider: "openai",
    model: "gpt-4.1-mini",
    usage: { input: 1000000 },
    providerMetadata: { serviceTier: "priority" },
  });
  expect(
    calculateGenerationCost(event, [
      ...DEFAULT_MODEL_RATE_CARDS,
      { ...rate, projectId: "project", pricingRef: "contract" },
    ] as ModelRateCard[]),
  ).toMatchObject({
    costMicros: 400000,
    pricingSource: "project-rate-card",
    pricingRef: "contract",
  });
});

it("distinguishes known zero usage from absent usage", () => {
  const rateCards = DEFAULT_MODEL_RATE_CARDS as ModelRateCard[];
  const payload = { provider: "openai", model: "gpt-4.1-mini" };
  expect(
    calculateGenerationCost(
      baseEvent({ ...payload, usage: { input: 0, output: 0 } }),
      rateCards,
    ),
  ).toMatchObject({ costMicros: 0, pricingStatus: "priced" });
  expect(
    calculateGenerationCost(baseEvent({ ...payload, usage: {} }), rateCards)
      .pricingStatus,
  ).toBe("unknown");
});
