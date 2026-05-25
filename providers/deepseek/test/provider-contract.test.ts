import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { createDeepSeek } from "../src/provider";
import type { DeepSeekChatCompletionRequest } from "../src/types";

const collectStreamParts = async (
  stream:
    | AsyncIterable<KortyxStreamPart>
    | Promise<AsyncIterable<KortyxStreamPart>>,
): Promise<KortyxStreamPart[]> => {
  const parts: KortyxStreamPart[] = [];
  for await (const part of await stream) {
    parts.push(part);
  }
  return parts;
};

const createSseResponse = (events: unknown[]): Response => {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};

describe("deepseek public provider contract", () => {
  it("validates model ids on getModel and selector calls", () => {
    const provider = createDeepSeek({ apiKey: "test-key" });

    expect(() => provider.getModel(" ")).toThrow(
      "DeepSeek model id must be a non-empty string.",
    );
    expect(() => provider(" ")).toThrow(
      "DeepSeek model id must be a non-empty string.",
    );
    expect(provider("deepseek-chat", { temperature: 0.2 })).toMatchObject({
      provider,
      modelId: "deepseek-chat",
      options: { temperature: 0.2 },
    });
  });

  it("streams from the non-streaming invoke transport when streaming is disabled", async () => {
    const provider = createDeepSeek({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as DeepSeekChatCompletionRequest;
        expect(body.stream).toBe(false);
        return new Response(
          JSON.stringify({
            id: "resp-1",
            choices: [
              {
                message: { content: "Hello from invoke" },
                finish_reason: "tool_calls",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("deepseek-chat", { streaming: false });

    const parts = await collectStreamParts(
      model.stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toMatchObject([
      { type: "text-delta", delta: "Hello from invoke" },
      {
        type: "finish",
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
      },
    ]);
  });

  it("reports provider stream error chunks without emitting a finish", async () => {
    const provider = createDeepSeek({
      apiKey: "test-key",
      fetch: async () =>
        createSseResponse([{ error: { message: "provider overloaded" } }]),
    });

    const parts = await collectStreamParts(
      provider
        .getModel("deepseek-chat", { streaming: true })
        .stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      type: "error",
      error: expect.objectContaining({ message: "provider overloaded" }),
      raw: { error: { message: "provider overloaded" } },
    });
  });

  it("surfaces warning contracts for unsupported DeepSeek options", async () => {
    const provider = createDeepSeek({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    const model = provider.getModel("deepseek-chat", {
      reasoning: {
        effort: "provider-custom",
        maxTokens: 32,
      },
      responseFormat: {
        type: "json",
        schema: { type: "object" },
      },
      providerOptions: {
        experimental: true,
        deepseek: {
          unsupported: true,
        },
      },
    });

    const result = await model.invoke([{ role: "user", content: "Hello" }]);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "responseFormat.schema" }),
        expect.objectContaining({ feature: "reasoning.effort" }),
        expect.objectContaining({ feature: "reasoning.maxTokens" }),
        expect.objectContaining({ feature: "providerOptions" }),
        expect.objectContaining({ feature: "providerOptions.deepseek" }),
      ]),
    );
  });

  it("loads API keys from the environment and maps finish reason variants", async () => {
    const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const previousKortyxKey = process.env.KORTYX_DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "env-deepseek-key";
    delete process.env.KORTYX_DEEPSEEK_API_KEY;

    const finishReasons = [
      "content_filter",
      "insufficient_system_resource",
      "unexpected",
    ];
    const provider = createDeepSeek({
      fetch: async (_input, init) => {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer env-deepseek-key",
        });
        const finishReason = finishReasons.shift();
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: "ok" },
                finish_reason: finishReason,
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("deepseek-chat");

    try {
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: { unified: "content-filter", raw: "content_filter" },
      });
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: {
          unified: "error",
          raw: "insufficient_system_resource",
        },
      });
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: { unified: "other", raw: "unexpected" },
      });
    } finally {
      if (previousDeepSeekKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
      }
      if (previousKortyxKey === undefined) {
        delete process.env.KORTYX_DEEPSEEK_API_KEY;
      } else {
        process.env.KORTYX_DEEPSEEK_API_KEY = previousKortyxKey;
      }
    }
  });

  it("returns normalized tool calls from invoke responses", async () => {
    const provider = createDeepSeek({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "",
                  tool_calls: [
                    {
                      id: "call-1",
                      type: "function",
                      function: {
                        name: "lookup_order",
                        arguments: '{"orderId":"ord_1"}',
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });

    const result = await provider
      .getModel("deepseek-chat", {
        tools: [
          {
            name: "lookup_order",
            inputSchema: { type: "object" },
          },
        ],
      })
      .invoke([{ role: "user", content: "Check order ord_1" }]);

    expect(result.toolCalls).toEqual([
      {
        id: "call-1",
        name: "lookup_order",
        input: { orderId: "ord_1" },
        raw: {
          id: "call-1",
          type: "function",
          function: {
            name: "lookup_order",
            arguments: '{"orderId":"ord_1"}',
          },
        },
      },
    ]);
    expect(result.finishReason).toEqual({
      unified: "tool-calls",
      raw: "tool_calls",
    });
  });

  it("surfaces missing environment credentials during invoke", async () => {
    const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const previousKortyxKey = process.env.KORTYX_DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.KORTYX_DEEPSEEK_API_KEY;

    try {
      await expect(
        createDeepSeek()
          .getModel("deepseek-chat")
          .invoke([{ role: "user", content: "Hello" }]),
      ).rejects.toThrow("DeepSeek provider failed to invoke content");
    } finally {
      if (previousDeepSeekKey !== undefined) {
        process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
      }
      if (previousKortyxKey !== undefined) {
        process.env.KORTYX_DEEPSEEK_API_KEY = previousKortyxKey;
      }
    }
  });
});
