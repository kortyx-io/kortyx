import { describe, expect, it } from "vitest";
import { createProvider as anthropic } from "../../../providers/anthropic/src";
import { createProvider as deepseek } from "../../../providers/deepseek/src";
import { createProvider as groq } from "../../../providers/groq/src";
import { createProvider as mistral } from "../../../providers/mistral/src";
import { createProvider as openai } from "../../../providers/openai/src";
import { calculateGenerationCost } from "../src/pricing/calculate-cost";
import { DEFAULT_MODEL_RATE_CARDS } from "../src/pricing/default-rates";
import type { ModelRateCard, TelemetryEventRecord } from "../src/schema";

describe("native provider usage pricing", () => {
  it.each([
    "anthropic",
    "deepseek",
    "groq",
  ] as const)("does not double-bill %s cache or reasoning subsets", async (vendor) => {
    const isAnthropic = vendor === "anthropic";
    const factory = { anthropic, deepseek, groq }[vendor];
    const native = isAnthropic
      ? {
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 10,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 30,
            output_tokens: 5,
            output_tokens_details: { thinking_tokens: 3 },
          },
        }
      : {
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            prompt_cache_hit_tokens: 20,
            prompt_tokens_details: { cached_tokens: 20 },
            completion_tokens_details: { reasoning_tokens: 30 },
          },
        };
    const result = await factory({
      apiKey: "fixture",
      fetch: async () => new Response(JSON.stringify(native)),
    })
      .getModel(
        isAnthropic
          ? "claude-sonnet-4-6"
          : vendor === "groq"
            ? "openai/gpt-oss-120b"
            : "deepseek-v4-pro",
      )
      .invoke([{ role: "user", content: "hi" }]);
    const cost = calculateGenerationCost(
      {
        type: "generation.completed",
        occurredAt: new Date(),
        payload: {
          provider: vendor,
          usage: result.usage,
          pricing: {
            source: "custom",
            currency: "USD",
            unitPrices: [
              "input",
              "output",
              "reasoning",
              "cache_read",
              "cache_write",
            ].map((usageType) => ({
              usageType,
              unit: "token",
              priceMicros: 1,
              unitQuantity: 1,
            })),
          },
        },
      } as TelemetryEventRecord,
      [],
    );
    expect(cost.costMicros).toBe(isAnthropic ? 65 : 150);
    expect(result.usage?.reasoning).toBe(isAnthropic ? 3 : 30);
    expect(result.usage?.outputIncludesReasoning).toBe(true);
    expect(result.usage?.inputIncludesCacheRead).toBe(true);
  });
});

it("preserves Anthropic one-hour writes through normalization and prices historical raw usage", async () => {
  const result = await anthropic({
    apiKey: "fixture",
    fetch: async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "ok" }],
          usage: {
            input_tokens: 700000,
            output_tokens: 100000,
            cache_read_input_tokens: 200000,
            cache_creation_input_tokens: 100000,
            cache_creation: {
              ephemeral_5m_input_tokens: 60000,
              ephemeral_1h_input_tokens: 40000,
            },
            service_tier: "standard",
            inference_geo: "global",
          },
        }),
      ),
  })
    .getModel("claude-haiku-4-5")
    .invoke([{ role: "user", content: "hi" }]);
  expect(result.usage).toMatchObject({
    input: 1000000,
    cacheWrite: 100000,
    cacheWrite1h: 40000,
  });
  if (!result.usage) throw new Error("Expected native usage.");
  const { cacheWrite1h: _, ...historical } = result.usage;
  const event = {
    type: "generation.completed",
    occurredAt: new Date("2026-07-04T00:00:00Z"),
    payload: {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      usage: historical,
    },
  } as TelemetryEventRecord;
  expect(
    calculateGenerationCost(event, DEFAULT_MODEL_RATE_CARDS as ModelRateCard[])
      .costMicros,
  ).toBe(1375000);
});

it("normalizes Mistral cached tokens without billing them again as input", async () => {
  const result = await mistral({
    apiKey: "fixture",
    fetch: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 1000000,
            completion_tokens: 100000,
            prompt_tokens_details: { cached_tokens: 200000 },
          },
        }),
      ),
  })
    .getModel("mistral-medium-3-5")
    .invoke([{ role: "user", content: "hi" }]);
  expect(result.usage).toMatchObject({
    cacheRead: 200000,
    inputIncludesCacheRead: true,
  });
  expect(
    calculateGenerationCost(
      {
        type: "generation.completed",
        occurredAt: new Date("2026-09-17T08:00:00Z"),
        payload: {
          provider: "mistral",
          model: "mistral-medium-3-5",
          usage: result.usage,
        },
      } as TelemetryEventRecord,
      DEFAULT_MODEL_RATE_CARDS as ModelRateCard[],
    ).costMicros,
  ).toBe(1980000);
});

it.each([
  "openai",
  "groq",
] as const)("preserves the actual %s service tier in invoke and stream", async (vendor) => {
  const native = {
    service_tier: "flex",
    choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 10 },
  };
  const stream = [
    {
      service_tier: "flex",
      choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
    },
    { choices: [], usage: native.usage },
  ];
  const factory = { openai, groq }[vendor];
  const provider = factory({
    apiKey: "fixture",
    fetch: async (_, init) => {
      const request = JSON.parse(String(init?.body));
      return request.stream
        ? new Response(
            `${stream
              .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
              .join("")}data: [DONE]\n\n`,
            { headers: { "content-type": "text/event-stream" } },
          )
        : new Response(JSON.stringify(native));
    },
  });
  const model = provider.getModel(
    vendor === "openai" ? "gpt-4.1-mini" : "openai/gpt-oss-120b",
    {
      providerOptions:
        vendor === "openai" ? { openai: { api: "chat-completions" } } : {},
    },
  );
  expect(
    (await model.invoke([{ role: "user", content: "hi" }])).providerMetadata
      ?.serviceTier,
  ).toBe("flex");
  const parts = [];
  for await (const part of model.stream([{ role: "user", content: "hi" }]))
    parts.push(part);
  expect(
    parts.find((part) => part.type === "finish")?.providerMetadata?.serviceTier,
  ).toBe("flex");
});
