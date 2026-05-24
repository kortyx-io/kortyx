import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { createAnthropic } from "../src/provider";
import type { AnthropicMessagesRequest } from "../src/types";

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
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};

describe("anthropic public provider contract", () => {
  it("validates model ids on getModel and selector calls", () => {
    const provider = createAnthropic({ apiKey: "test-key" });

    expect(() => provider.getModel(" ")).toThrow(
      "Anthropic model id must be a non-empty string.",
    );
    expect(() => provider(" ")).toThrow(
      "Anthropic model id must be a non-empty string.",
    );
    expect(provider("claude-sonnet-4-5", { temperature: 0.2 })).toMatchObject({
      provider,
      modelId: "claude-sonnet-4-5",
      options: { temperature: 0.2 },
    });
  });

  it("streams from the non-streaming invoke transport when streaming is disabled", async () => {
    const provider = createAnthropic({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as AnthropicMessagesRequest;
        expect(body.stream).toBe(false);
        return new Response(
          JSON.stringify({
            id: "msg-1",
            content: [{ type: "text", text: "Hello from invoke" }],
            stop_reason: "tool_use",
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("claude-sonnet-4-5", {
      streaming: false,
    });

    const parts = await collectStreamParts(
      model.stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toMatchObject([
      { type: "text-delta", delta: "Hello from invoke" },
      {
        type: "finish",
        finishReason: { unified: "tool-calls", raw: "tool_use" },
      },
    ]);
  });

  it("reports provider stream error events without emitting a finish", async () => {
    const provider = createAnthropic({
      apiKey: "test-key",
      fetch: async () => createSseResponse([{ type: "error", error: {} }]),
    });

    const parts = await collectStreamParts(
      provider
        .getModel("claude-sonnet-4-5", { streaming: true })
        .stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      type: "error",
      error: expect.objectContaining({ message: "Anthropic stream error." }),
      raw: { type: "error", error: {} },
    });
  });

  it("surfaces warning contracts for unsupported Anthropic options", async () => {
    const provider = createAnthropic({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "ok" }],
            stop_reason: "end_turn",
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    const model = provider.getModel("claude-sonnet-4-5", {
      reasoning: { effort: "high" },
      providerOptions: {
        experimental: true,
        anthropic: {
          unsupported: true,
        },
      },
    });

    const result = await model.invoke([{ role: "user", content: "Hello" }]);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "reasoning.effort" }),
        expect.objectContaining({ feature: "providerOptions" }),
        expect.objectContaining({ feature: "providerOptions.anthropic" }),
      ]),
    );
  });

  it("loads auth tokens from the environment and maps finish reason variants", async () => {
    const previousApiKey = process.env.ANTHROPIC_API_KEY;
    const previousKortyxApiKey = process.env.KORTYX_ANTHROPIC_API_KEY;
    const previousAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
    const previousKortyxAuthToken = process.env.KORTYX_ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.KORTYX_ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = "env-anthropic-token";
    delete process.env.KORTYX_ANTHROPIC_AUTH_TOKEN;

    const stopReasons = ["model_context_window_exceeded", "refusal", "unknown"];
    const provider = createAnthropic({
      fetch: async (_input, init) => {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer env-anthropic-token",
        });
        const stopReason = stopReasons.shift();
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: "ok" }],
            stop_reason: stopReason,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("claude-sonnet-4-5");

    try {
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: {
          unified: "length",
          raw: "model_context_window_exceeded",
        },
      });
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: { unified: "content-filter", raw: "refusal" },
      });
      await expect(
        model.invoke([{ role: "user", content: "Hello" }]),
      ).resolves.toMatchObject({
        finishReason: { unified: "other", raw: "unknown" },
      });
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = previousApiKey;
      }
      if (previousKortyxApiKey === undefined) {
        delete process.env.KORTYX_ANTHROPIC_API_KEY;
      } else {
        process.env.KORTYX_ANTHROPIC_API_KEY = previousKortyxApiKey;
      }
      if (previousAuthToken === undefined) {
        delete process.env.ANTHROPIC_AUTH_TOKEN;
      } else {
        process.env.ANTHROPIC_AUTH_TOKEN = previousAuthToken;
      }
      if (previousKortyxAuthToken === undefined) {
        delete process.env.KORTYX_ANTHROPIC_AUTH_TOKEN;
      } else {
        process.env.KORTYX_ANTHROPIC_AUTH_TOKEN = previousKortyxAuthToken;
      }
    }
  });

  it("returns normalized tool calls from invoke responses", async () => {
    const provider = createAnthropic({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            content: [
              {
                type: "tool_use",
                id: "call-1",
                name: "lookup_order",
                input: { orderId: "ord_1" },
              },
            ],
            stop_reason: "tool_use",
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });

    const result = await provider
      .getModel("claude-sonnet-4-5", {
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
          type: "tool_use",
          id: "call-1",
          name: "lookup_order",
          input: { orderId: "ord_1" },
        },
      },
    ]);
    expect(result.finishReason).toEqual({
      unified: "tool-calls",
      raw: "tool_use",
    });
  });

  it("returns streamed tool calls assembled from input JSON deltas", async () => {
    const provider = createAnthropic({
      apiKey: "test-key",
      fetch: async () =>
        createSseResponse([
          {
            type: "message_start",
            message: { id: "msg-1", stop_reason: null },
          },
          {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "tool_use",
              id: "call-1",
              name: "lookup_order",
              input: {},
            },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "input_json_delta",
              partial_json: '{"orderId"',
            },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "input_json_delta",
              partial_json: ':"ord_1"}',
            },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "tool_use" },
          },
          { type: "message_stop" },
        ]),
    });

    const parts = await collectStreamParts(
      provider
        .getModel("claude-sonnet-4-5", { streaming: true })
        .stream([{ role: "user", content: "Check order ord_1" }]),
    );

    expect(parts).toEqual([
      {
        type: "finish",
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        toolCalls: [
          {
            id: "call-1",
            name: "lookup_order",
            input: { orderId: "ord_1" },
            raw: {
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "input_json_delta",
                partial_json: ':"ord_1"}',
              },
            },
          },
        ],
        providerMetadata: {
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          responseId: "msg-1",
        },
        raw: { type: "message_stop" },
      },
    ]);
  });

  it("surfaces invalid Anthropic credential combinations during invoke", async () => {
    await expect(
      createAnthropic({ apiKey: "test-key", authToken: "test-token" })
        .getModel("claude-sonnet-4-5")
        .invoke([{ role: "user", content: "Hello" }]),
    ).rejects.toThrow("Anthropic provider failed to invoke content");
  });
});
