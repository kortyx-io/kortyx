import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { createGoogleGenerativeAI } from "../src/provider";
import type { GoogleGenerateContentRequest } from "../src/types";

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

describe("google public provider contract", () => {
  it("validates model ids on getModel and selector calls", () => {
    const provider = createGoogleGenerativeAI({ apiKey: "test-key" });

    expect(() => provider.getModel("not-a-model")).toThrow(
      "Unknown Google model: not-a-model.",
    );
    expect(() => provider("not-a-model" as never)).toThrow(
      "Unknown Google model: not-a-model.",
    );
    expect(provider("gemini-2.5-flash", { temperature: 0.2 })).toMatchObject({
      provider,
      modelId: "gemini-2.5-flash",
      options: { temperature: 0.2 },
    });
  });

  it("streams from the non-streaming invoke transport when streaming is disabled", async () => {
    const provider = createGoogleGenerativeAI({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as GoogleGenerateContentRequest;
        expect(body.generationConfig).toMatchObject({ temperature: 0.7 });
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "Hello from invoke" }] },
                finishReason: "MAX_TOKENS",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("gemini-2.5-flash", {
      streaming: false,
    });

    const parts = await collectStreamParts(
      model.stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toMatchObject([
      { type: "text-delta", delta: "Hello from invoke" },
      {
        type: "finish",
        finishReason: { unified: "length", raw: "MAX_TOKENS" },
      },
    ]);
  });

  it("normalizes Google function calls into Kortyx tool calls", async () => {
    const provider = createGoogleGenerativeAI({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as GoogleGenerateContentRequest;
        expect(body.tools).toEqual([
          {
            functionDeclarations: [
              {
                name: "lookup_order",
                description: "Look up an order.",
                parameters: { type: "object" },
              },
            ],
          },
        ]);
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: "lookup_order",
                        args: { orderId: "ord_1" },
                      },
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    const result = await provider
      .getModel("gemini-2.5-flash", {
        tools: [
          {
            name: "lookup_order",
            description: "Look up an order.",
            inputSchema: { type: "object" },
          },
        ],
      })
      .invoke([{ role: "user", content: "Check order ord_1" }]);

    expect(result.toolCalls).toEqual([
      {
        id: "google-tool-call-0",
        name: "lookup_order",
        input: { orderId: "ord_1" },
        raw: { name: "lookup_order", args: { orderId: "ord_1" } },
      },
    ]);
  });

  it("streams non-cumulative Google chunks as independent text deltas", async () => {
    const provider = createGoogleGenerativeAI({
      apiKey: "test-key",
      fetch: async () =>
        createSseResponse([
          {
            candidates: [{ content: { parts: [{ text: "Alpha" }] } }],
          },
          {
            candidates: [{ content: { parts: [{ text: "Beta" }] } }],
          },
          {
            candidates: [
              {
                content: { parts: [{ text: "Beta" }] },
                finishReason: "STOP",
              },
            ],
          },
        ]),
    });

    const parts = await collectStreamParts(
      provider
        .getModel("gemini-2.5-flash", { streaming: true })
        .stream([{ role: "user", content: "Hello" }]),
    );

    expect(
      parts
        .filter((part) => part.type === "text-delta")
        .map((part) => (part.type === "text-delta" ? part.delta : "")),
    ).toEqual(["Alpha", "Beta"]);
    expect(parts.at(-1)).toMatchObject({
      type: "finish",
      finishReason: { unified: "stop", raw: "STOP" },
    });
  });

  it("loads API keys from the environment and surfaces missing credentials", async () => {
    const previousGoogleKey = process.env.GOOGLE_API_KEY;
    const previousGeminiKey = process.env.GEMINI_API_KEY;
    const previousGoogleGenerativeKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const previousKortyxGoogleKey = process.env.KORTYX_GOOGLE_API_KEY;
    const previousKortyxGeminiKey = process.env.KORTYX_GEMINI_API_KEY;

    process.env.GOOGLE_API_KEY = "env-google-key";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.KORTYX_GOOGLE_API_KEY;
    delete process.env.KORTYX_GEMINI_API_KEY;

    try {
      const provider = createGoogleGenerativeAI({
        fetch: async (_input, init) => {
          expect(init?.headers).toMatchObject({
            "x-goog-api-key": "env-google-key",
          });
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: { parts: [{ text: "ok" }] },
                  finishReason: "STOP",
                },
              ],
            }),
            { headers: { "content-type": "application/json" } },
          );
        },
      });

      await expect(
        provider
          .getModel("gemini-2.5-flash")
          .invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({ content: "ok" });

      delete process.env.GOOGLE_API_KEY;

      await expect(
        createGoogleGenerativeAI()
          .getModel("gemini-2.5-flash")
          .invoke([{ role: "user", content: "Hello" }]),
      ).rejects.toThrow("Google provider failed to invoke content");
    } finally {
      if (previousGoogleKey === undefined) {
        delete process.env.GOOGLE_API_KEY;
      } else {
        process.env.GOOGLE_API_KEY = previousGoogleKey;
      }
      if (previousGeminiKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = previousGeminiKey;
      }
      if (previousGoogleGenerativeKey === undefined) {
        delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      } else {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousGoogleGenerativeKey;
      }
      if (previousKortyxGoogleKey === undefined) {
        delete process.env.KORTYX_GOOGLE_API_KEY;
      } else {
        process.env.KORTYX_GOOGLE_API_KEY = previousKortyxGoogleKey;
      }
      if (previousKortyxGeminiKey === undefined) {
        delete process.env.KORTYX_GEMINI_API_KEY;
      } else {
        process.env.KORTYX_GEMINI_API_KEY = previousKortyxGeminiKey;
      }
    }
  });

  it("surfaces warning contracts for unsupported Google options", async () => {
    const provider = createGoogleGenerativeAI({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "ok" }] },
                finishReason: "STOP",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    const model = provider.getModel("gemini-2.5-flash", {
      reasoning: {
        effort: "provider-custom",
        maxTokens: 64,
      },
      providerOptions: {
        experimental: true,
      },
    });

    const result = await model.invoke([{ role: "user", content: "Hello" }]);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "reasoning.effort" }),
        expect.objectContaining({ feature: "reasoning" }),
        expect.objectContaining({ feature: "providerOptions" }),
      ]),
    );
  });
});
