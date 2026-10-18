import type { ProviderModelRef } from "@kortyx/providers";
import { describe, expect, it, vi } from "vitest";
import type { EvalGradeInput } from "../src/evals/index";
import { createEvalJudge, createEvals } from "../src/evals/index";

const input = (onUsage = vi.fn()): EvalGradeInput => ({
  criterion: { id: "accurate", text: "Accurate" },
  input: { message: "Product?" },
  observation: { type: "answer", text: "A", structured: [] },
  conversation: [],
  signal: new AbortController().signal,
  onUsage,
});
const model = (result: unknown, providerId = "openrouter") =>
  ({
    modelId: "test/model",
    provider: {
      id: providerId,
      getModel: () => ({ invoke: async () => result }),
    },
  }) as unknown as ProviderModelRef;
const response = {
  content: JSON.stringify({ passed: true, reason: "Accurate", evidence: [] }),
  usage: { input: 25, output: 10, raw: { secret: "PRIVATE_RAW" } },
  providerMetadata: {
    providerId: "openrouter",
    cost: 0.00035,
    credential: "PRIVATE_KEY",
  },
  finishReason: { unified: "stop" },
};

describe("judge billing capture", () => {
  it("reports billing independently of generated output and never persists raw metadata", async () => {
    const onUsage = vi.fn();
    await createEvalJudge({ model: model(response) }).grade(input(onUsage));
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openrouter",
        model: "test/model",
        usage: { input: 25, output: 10 },
        pricing: { source: "provider", currency: "USD", actualCostMicros: 350 },
      }),
    );
    expect(JSON.stringify(onUsage.mock.calls)).not.toMatch(
      /PRIVATE_RAW|PRIVATE_KEY/,
    );
  });
  it("retains the paid call when a response cannot be parsed as a verdict", async () => {
    const onUsage = vi.fn();
    await expect(
      createEvalJudge({
        model: model({ ...response, content: "invalid" }),
      }).grade(input(onUsage)),
    ).rejects.toThrow();
    expect(onUsage).toHaveBeenCalledOnce();
  });
  it("uses upstream inference charges for OpenRouter BYOK rather than the zero gateway charge", async () => {
    const onUsage = vi.fn();
    await createEvalJudge({
      model: model({
        ...response,
        providerMetadata: {
          isByok: true,
          cost: 0,
          costDetails: { upstreamInferenceCost: 0.003 },
        },
      }),
    }).grade(input(onUsage));
    expect(onUsage.mock.calls[0]?.[0].pricing.actualCostMicros).toBe(3000);
  });
  it("leaves missing BYOK upstream costs unknown rather than claiming a free call", async () => {
    const onUsage = vi.fn();
    await createEvalJudge({
      model: model({
        ...response,
        providerMetadata: { isByok: true, cost: 0 },
      }),
    }).grade(input(onUsage));
    expect(onUsage.mock.calls[0]?.[0].pricing).toBeUndefined();
  });
  it("does not accept a USD billing claim for an arbitrary compatible provider", async () => {
    const onUsage = vi.fn();
    await createEvalJudge({ model: model(response, "openai") }).grade(
      input(onUsage),
    );
    expect(onUsage.mock.calls[0]?.[0].pricing).toBeUndefined();
  });
  it("retains only supported pricing context and discards invalid usage without changing the verdict", async () => {
    const onUsage = vi.fn();
    await createEvalJudge({
      model: model({
        ...response,
        usage: {
          input: NaN,
          output: -10,
          total: Infinity,
          cacheRead: 20,
          outputIncludesReasoning: true,
          raw: { apiKey: "PRIVATE" },
        },
        providerMetadata: {
          cost: -1,
          serviceTier: "priority",
          inferenceGeo: "us",
          speed: "fast",
          apiKey: "PRIVATE",
        },
      }),
    }).grade(input(onUsage));
    expect(onUsage.mock.calls[0]?.[0]).toMatchObject({
      usage: { cacheRead: 20, outputIncludesReasoning: true },
      pricingContext: {
        serviceTier: "priority",
        inferenceGeo: "us",
        speed: "fast",
      },
    });
    expect(onUsage.mock.calls[0]?.[0].pricing).toBeUndefined();
    expect(JSON.stringify(onUsage.mock.calls)).not.toContain("PRIVATE");
  });
  it("does not persist late usage after cancellation", async () => {
    const controller = new AbortController();
    const onUsage = vi.fn();
    const lateModel = {
      modelId: "test/model",
      provider: {
        id: "openrouter",
        getModel: () => ({
          invoke: async () => {
            controller.abort();
            return response;
          },
        }),
      },
    } as unknown as ProviderModelRef;
    await expect(
      createEvalJudge({ model: lateModel }).grade({
        ...input(onUsage),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(onUsage).not.toHaveBeenCalled();
  });
  it("keeps usage through app execution progress and final results, including failed grading", async () => {
    const progress = vi.fn();
    const result = await createEvals({
      agent: { streamChat: vi.fn() },
      suites: [
        {
          id: "catalog",
          cases: [
            {
              id: "lookup",
              steps: [
                {
                  message: "Product?",
                  expect: { type: "answer", criteria: ["Accurate"] },
                },
              ],
            },
          ],
        },
      ],
      execute: () => ({ observation: input().observation }),
      judge: createEvalJudge({
        model: model({ ...response, content: "invalid" }),
      }),
    }).run({ suiteId: "catalog", onProgress: progress });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.steps[0]).toMatchObject({
      judgeCalls: 1,
      judgeUsage: [{ pricing: { actualCostMicros: 350 } }],
    });
    expect(JSON.stringify(progress.mock.calls)).toContain("actualCostMicros");
  });
  it("ignores a custom judge reporting usage after the run was cancelled", async () => {
    const controller = new AbortController();
    const result = await createEvals({
      agent: { streamChat: vi.fn() },
      suites: [
        {
          id: "catalog",
          cases: [
            {
              id: "lookup",
              steps: [
                {
                  message: "Product?",
                  expect: { type: "answer", criteria: ["Accurate"] },
                },
              ],
            },
          ],
        },
      ],
      execute: () => ({ observation: input().observation }),
      judge: {
        id: "custom",
        version: "1",
        grade: async ({ onUsage }) => {
          controller.abort();
          onUsage?.({
            provider: "openrouter",
            model: "test/model",
            occurredAt: new Date().toISOString(),
            pricing: {
              source: "provider",
              currency: "USD",
              actualCostMicros: 350,
            },
          });
          return { passed: true, reason: "Late result", evidence: [] };
        },
      },
    }).run({ suiteId: "catalog", signal: controller.signal });
    expect(result.status).toBe("cancelled");
    expect(result.cases[0]?.steps[0]?.judgeUsage).toBeUndefined();
  });
});
