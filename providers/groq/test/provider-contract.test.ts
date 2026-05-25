import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { createGroq } from "../src/provider";
import type { GroqChatCompletionRequest } from "../src/types";

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

describe("groq public provider contract", () => {
  it("validates model ids on getModel and selector calls", () => {
    const provider = createGroq({ apiKey: "test-key" });

    expect(() => provider.getModel(" ")).toThrow(
      "Groq model id must be a non-empty string.",
    );
    expect(() => provider(" ")).toThrow(
      "Groq model id must be a non-empty string.",
    );
    expect(
      provider("llama-3.3-70b-versatile", { temperature: 0.2 }),
    ).toMatchObject({
      provider,
      modelId: "llama-3.3-70b-versatile",
      options: { temperature: 0.2 },
    });
  });

  it("streams from the non-streaming invoke transport when streaming is disabled", async () => {
    const provider = createGroq({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as GroqChatCompletionRequest;
        expect(body.stream).toBe(false);
        return new Response(
          JSON.stringify({
            id: "resp-1",
            choices: [
              {
                message: { content: "Hello from invoke" },
                finish_reason: "content_filter",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("llama-3.3-70b-versatile", {
      streaming: false,
    });

    const parts = await collectStreamParts(
      model.stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toMatchObject([
      { type: "text-delta", delta: "Hello from invoke" },
      {
        type: "finish",
        finishReason: { unified: "content-filter", raw: "content_filter" },
      },
    ]);
  });

  it("reports provider stream error chunks without emitting a finish", async () => {
    const provider = createGroq({
      apiKey: "test-key",
      fetch: async () =>
        createSseResponse([{ error: { message: "provider overloaded" } }]),
    });

    const parts = await collectStreamParts(
      provider
        .getModel("llama-3.3-70b-versatile", { streaming: true })
        .stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      type: "error",
      error: expect.objectContaining({ message: "provider overloaded" }),
      raw: { error: { message: "provider overloaded" } },
    });
  });

  it("surfaces warning contracts for unsupported Groq options", async () => {
    const provider = createGroq({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    const model = provider.getModel("llama-3.3-70b-versatile", {
      reasoning: {
        effort: "provider-custom",
        maxTokens: 32,
      },
      responseFormat: {
        type: "json",
        schema: { type: "object" },
      },
      providerOptions: {
        structuredOutputs: false,
        experimental: true,
      },
    });

    const result = await model.invoke([{ role: "user", content: "Hello" }]);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "responseFormat" }),
        expect.objectContaining({ feature: "reasoning.effort" }),
        expect.objectContaining({ feature: "reasoning.maxTokens" }),
        expect.objectContaining({ feature: "providerOptions" }),
      ]),
    );
  });

  it("loads API keys from the environment and maps finish reason variants", async () => {
    const previousGroqKey = process.env.GROQ_API_KEY;
    const previousKortyxKey = process.env.KORTYX_GROQ_API_KEY;
    process.env.GROQ_API_KEY = "env-groq-key";
    delete process.env.KORTYX_GROQ_API_KEY;

    const finishReasons = ["content_filter", "tool_calls", "unexpected"];
    const provider = createGroq({
      fetch: async (_input, init) => {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer env-groq-key",
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
    const model = provider.getModel("llama-3.3-70b-versatile");

    try {
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: { unified: "content-filter", raw: "content_filter" },
      });
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
      });
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: { unified: "other", raw: "unexpected" },
      });
    } finally {
      if (previousGroqKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = previousGroqKey;
      }
      if (previousKortyxKey === undefined) {
        delete process.env.KORTYX_GROQ_API_KEY;
      } else {
        process.env.KORTYX_GROQ_API_KEY = previousKortyxKey;
      }
    }
  });

  it("returns normalized tool calls from invoke responses", async () => {
    const provider = createGroq({
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
      .getModel("llama-3.3-70b-versatile", {
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
    const previousGroqKey = process.env.GROQ_API_KEY;
    const previousKortyxKey = process.env.KORTYX_GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.KORTYX_GROQ_API_KEY;

    try {
      await expect(
        createGroq()
          .getModel("llama-3.3-70b-versatile")
          .invoke([{ role: "user", content: "Hello" }]),
      ).rejects.toThrow("Groq provider failed to invoke content");
    } finally {
      if (previousGroqKey !== undefined) {
        process.env.GROQ_API_KEY = previousGroqKey;
      }
      if (previousKortyxKey !== undefined) {
        process.env.KORTYX_GROQ_API_KEY = previousKortyxKey;
      }
    }
  });
});
