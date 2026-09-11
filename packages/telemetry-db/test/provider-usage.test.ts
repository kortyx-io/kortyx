import { describe, expect, it } from "vitest";
import { createProvider as anthropic } from "../../../providers/anthropic/src";
import { createProvider as deepseek } from "../../../providers/deepseek/src";
import { createProvider as groq } from "../../../providers/groq/src";
import { calculateGenerationCost } from "../src/pricing/calculate-cost";
import type { TelemetryEventRecord } from "../src/schema";

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
