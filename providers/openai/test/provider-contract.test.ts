import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { createOpenAI } from "../src/provider";
import type { OpenAIChatCompletionRequest } from "../src/types";

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

describe("openai public provider contract", () => {
  it("validates model ids on getModel and selector calls", () => {
    const provider = createOpenAI({ apiKey: "test-key" });

    expect(() => provider.getModel(" ")).toThrow(
      "OpenAI model id must be a non-empty string.",
    );
    expect(() => provider(" ")).toThrow(
      "OpenAI model id must be a non-empty string.",
    );
    expect(provider("gpt-4.1-mini", { temperature: 0.2 })).toMatchObject({
      provider,
      modelId: "gpt-4.1-mini",
      options: { temperature: 0.2 },
    });
  });

  it("streams from the non-streaming invoke transport when streaming is disabled", async () => {
    const provider = createOpenAI({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as OpenAIChatCompletionRequest;
        expect(body.stream).toBe(false);
        return new Response(
          JSON.stringify({
            id: "resp-1",
            choices: [
              {
                message: { content: "Hello from invoke" },
                finish_reason: "length",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("gpt-4.1-mini", { streaming: false });

    const parts = await collectStreamParts(
      model.stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toMatchObject([
      { type: "text-delta", delta: "Hello from invoke" },
      {
        type: "finish",
        finishReason: { unified: "length", raw: "length" },
      },
    ]);
  });

  it("reports provider stream error chunks without emitting a finish", async () => {
    const provider = createOpenAI({
      apiKey: "test-key",
      fetch: async () =>
        createSseResponse([{ error: { message: "provider overloaded" } }]),
    });

    const parts = await collectStreamParts(
      provider
        .getModel("gpt-4.1-mini", { streaming: true })
        .stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      type: "error",
      error: expect.objectContaining({ message: "provider overloaded" }),
      raw: { error: { message: "provider overloaded" } },
    });
  });

  it("surfaces warning contracts for unsupported OpenAI options", async () => {
    const provider = createOpenAI({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    const model = provider.getModel("o3-mini", {
      temperature: 0.3,
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
        expect.objectContaining({ feature: "temperature" }),
        expect.objectContaining({ feature: "responseFormat" }),
        expect.objectContaining({ feature: "reasoning.effort" }),
        expect.objectContaining({ feature: "reasoning.maxTokens" }),
        expect.objectContaining({ feature: "providerOptions" }),
      ]),
    );
  });

  it("loads API keys from the environment and maps finish reason variants", async () => {
    const previousOpenAIKey = process.env.OPENAI_API_KEY;
    const previousKortyxKey = process.env.KORTYX_OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "env-openai-key";
    delete process.env.KORTYX_OPENAI_API_KEY;

    const finishReasons = ["content_filter", "function_call", "unexpected"];
    const provider = createOpenAI({
      fetch: async (_input, init) => {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer env-openai-key",
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
    const model = provider.getModel("gpt-4.1-mini");

    try {
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: { unified: "content-filter", raw: "content_filter" },
      });
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: { unified: "tool-calls", raw: "function_call" },
      });
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: { unified: "other", raw: "unexpected" },
      });
    } finally {
      if (previousOpenAIKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAIKey;
      }
      if (previousKortyxKey === undefined) {
        delete process.env.KORTYX_OPENAI_API_KEY;
      } else {
        process.env.KORTYX_OPENAI_API_KEY = previousKortyxKey;
      }
    }
  });

  it("surfaces missing environment credentials during invoke", async () => {
    const previousOpenAIKey = process.env.OPENAI_API_KEY;
    const previousKortyxKey = process.env.KORTYX_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.KORTYX_OPENAI_API_KEY;

    try {
      await expect(
        createOpenAI()
          .getModel("gpt-4.1-mini")
          .invoke([{ role: "user", content: "Hello" }]),
      ).rejects.toThrow("OpenAI provider failed to invoke content");
    } finally {
      if (previousOpenAIKey !== undefined) {
        process.env.OPENAI_API_KEY = previousOpenAIKey;
      }
      if (previousKortyxKey !== undefined) {
        process.env.KORTYX_OPENAI_API_KEY = previousKortyxKey;
      }
    }
  });
});
