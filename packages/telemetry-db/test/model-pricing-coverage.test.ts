import { describe, expect, it } from "vitest";
import { MODELS as anthropic } from "../../../providers/anthropic/src/models";
import { MODELS as deepseek } from "../../../providers/deepseek/src/models";
import { MODELS as google } from "../../../providers/google/src/models";
import { MODELS as groq } from "../../../providers/groq/src/models";
import { MODELS as mistral } from "../../../providers/mistral/src/models";
import { MODELS as openai } from "../../../providers/openai/src/models";
import { calculateGenerationCost } from "../src/pricing/calculate-cost";
import { DEFAULT_MODEL_RATE_CARDS } from "../src/pricing/default-rates";
import type { ModelRateCard, TelemetryEventRecord } from "../src/schema";

const rates = DEFAULT_MODEL_RATE_CARDS as ModelRateCard[];
const cost = (
  provider: string,
  model: string,
  usage: Record<string, unknown>,
  at = "2026-09-17T08:00:00Z",
  providerMetadata = {},
) =>
  calculateGenerationCost(
    {
      type: "generation.completed",
      occurredAt: new Date(at),
      payload: { provider, model, usage, providerMetadata },
    } as TelemetryEventRecord,
    rates,
  );

describe("advertised model pricing coverage", () => {
  for (const [provider, models] of Object.entries({
    openai,
    anthropic,
    google,
    deepseek,
    mistral,
    groq,
  })) {
    it.each(
      models,
    )(`${provider}/%s has verified applicable public pricing`, (model) => {
      const result = cost(provider, model, { input: 1000, output: 100 });
      expect(result.pricingStatus).toBe("priced");
      const rate = DEFAULT_MODEL_RATE_CARDS.find(
        (rate) => rate.pricingRef === result.pricingRef,
      );
      expect(rate?.metadata?.sourceUrl).toMatch(/^https:\/\//);
      expect(rate?.metadata?.verifiedAt).toBe("2026-09-17");
    });
  }
  it.each([
    ["openai", "gpt-6-astra", 6000000],
    ["openai", "gpt-5.6-sol", 2400000],
    ["anthropic", "claude-fable-5-1", 6000000],
    ["anthropic", "claude-sonnet-5", 1200000],
    ["google", "gemini-3.8-flash", 450000],
    ["mistral", "mistral-medium-3-5", 900000],
    ["groq", "qwen/qwen3.8-27b", 480000],
  ] as const)("%s/%s uses the published standard token prices", (provider, model, expected) => {
    // Keep context below the surcharge threshold.
    expect(
      cost(provider, model, { input: 100000, output: 100000 }).costMicros,
    ).toBe(expected);
  });
  it("selects long-context rates using full input, including cached tokens", () => {
    expect(
      cost("openai", "gpt-5.6-sol", { input: 272000, output: 1000 }).costMicros,
    ).toBe(1108000);
    expect(
      cost("openai", "gpt-5.6-sol", {
        input: 272001,
        cacheRead: 200000,
        output: 1000,
      }).costMicros,
    ).toBe(766008);
    expect(
      cost("google", "gemini-2.5-pro", {
        input: 200001,
        output: 1000,
        reasoning: 1000,
      }).costMicros,
    ).toBe(530003);
  });
  it("bills both Anthropic cache-write TTLs and cache reads", () => {
    expect(
      cost("anthropic", "claude-haiku-4-5", {
        input: 1000000,
        output: 100000,
        cacheRead: 200000,
        cacheWrite: 100000,
        cacheWrite1h: 40000,
        inputIncludesCacheRead: true,
        inputIncludesCacheWrite: true,
      }).costMicros,
    ).toBe(1375000);
  });
  it.each([
    ["2026-09-17T00:59:59Z", 135000],
    ["2026-09-17T01:00:00Z", 270000],
    ["2026-09-17T04:00:00Z", 135000],
    ["2026-09-17T06:00:00Z", 270000],
    ["2026-09-17T10:00:00Z", 135000],
    ["2026-09-19T08:00:00Z", 135000],
  ])("uses DeepSeek's UTC schedule at %s", (at, expected) => {
    expect(
      cost(
        "deepseek",
        "deepseek-flash",
        { input: 100000, output: 200000 },
        String(at),
      ).costMicros,
    ).toBe(expected);
  });
  it("expires Google's promotion at the published boundary", () => {
    expect(
      cost(
        "google",
        "gemini-3.8-flash",
        { input: 1000000, output: 100000 },
        "2026-12-31T23:59:59Z",
      ).costMicros,
    ).toBe(1125000);
    expect(
      cost(
        "google",
        "gemini-3.8-flash",
        { input: 1000000, output: 100000 },
        "2027-01-01T00:00:00Z",
      ).costMicros,
    ).toBe(2250000);
  });
  it.each([
    "flex",
    "fast",
    "priority",
    "batch",
    "performance",
  ])("does not use standard pricing for %s", (serviceTier) => {
    expect(
      cost("openai", "gpt-4.1-mini", { input: 1000, output: 100 }, undefined, {
        serviceTier,
      }).pricingStatus,
    ).toBe("unpriced");
  });
  it("does not assume prices for extra usage, audio, geography, or server tools", () => {
    expect(
      cost("groq", "qwen/qwen3.8-27b", {
        input: 1000,
        output: 100,
        cacheWrite: 10,
      }).pricingStatus,
    ).toBe("unpriced");
    expect(
      cost("google", "gemini-2.5-flash", {
        input: 1000,
        output: 100,
        raw: { promptTokensDetails: [{ modality: "AUDIO", tokenCount: 1000 }] },
      }).pricingStatus,
    ).toBe("unpriced");
    expect(
      cost("anthropic", "claude-sonnet-5", {
        input: 1000,
        output: 100,
        raw: { inference_geo: "us" },
      }).pricingStatus,
    ).toBe("unpriced");
    expect(
      cost("anthropic", "claude-sonnet-5", {
        input: 1000,
        output: 100,
        raw: { server_tool_use: { web_search_requests: 1 } },
      }).pricingStatus,
    ).toBe("unpriced");
  });
  it("does not apply newly observed rates before their verification date", () => {
    expect(
      cost(
        "openai",
        "gpt-6-astra",
        { input: 1000, output: 100 },
        "2026-09-16T23:59:59Z",
      ).pricingStatus,
    ).toBe("unpriced");
    expect(
      cost(
        "openai",
        "gpt-4.1-mini",
        { input: 1000000, output: 100000 },
        "2026-07-04T00:00:00Z",
      ).costMicros,
    ).toBe(560000);
  });
});
