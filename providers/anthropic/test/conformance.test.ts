import { expect } from "vitest";
import { describeProviderConformance } from "../../../packages/providers/test/conformance";
import { createAnthropic } from "../src/provider";
import type { AnthropicMessagesRequest } from "../src/types";

const createJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });

const createSseResponse = (events: unknown[]): Response => {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          const eventType =
            event && typeof event === "object" && "type" in event
              ? String(event.type)
              : "message";
          controller.enqueue(
            encoder.encode(
              `event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
      },
    },
  );
};

describeProviderConformance({
  providerName: "anthropic",
  invoke: {
    createModel: () => {
      const provider = createAnthropic({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const headers = init?.headers as Record<string, string>;
          expect(headers["anthropic-version"]).toBe("2023-06-01");
          expect(headers["x-api-key"]).toBe("test-key");

          const requestBody = JSON.parse(
            String(init?.body),
          ) as AnthropicMessagesRequest;
          expect(requestBody).toMatchObject({
            model: "claude-sonnet-4-5",
            max_tokens: 256,
            stop_sequences: ["END"],
            stream: false,
            top_k: 40,
            top_p: 0.9,
            system:
              'Return JSON. Return JSON that conforms to this schema: {"type":"object"}\n\nYou are a concise assistant.',
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: "Say hello." }],
              },
            ],
          });

          return createJsonResponse({
            id: "msg-invoke",
            type: "message",
            role: "assistant",
            model: "claude-sonnet-4-5",
            content: [
              {
                type: "text",
                text: '{"message":"Hello from Anthropic"}',
              },
            ],
            stop_reason: "end_turn",
            usage: {
              input_tokens: 10,
              output_tokens: 4,
              cache_creation_input_tokens: 1,
              cache_read_input_tokens: 2,
            },
          });
        },
      });

      return provider.getModel("claude-sonnet-4-5", {
        maxOutputTokens: 256,
        stopSequences: ["END"],
        responseFormat: {
          type: "json",
          schema: {
            type: "object",
          },
        },
        providerOptions: {
          topK: 40,
          topP: 0.9,
        },
      });
    },
    assert: async (result) => {
      expect(result.role).toBe("assistant");
      expect(result.content).toBe('{"message":"Hello from Anthropic"}');
      expect(result.finishReason).toEqual({
        unified: "stop",
        raw: "end_turn",
      });
      expect(result.usage).toMatchObject({
        input: 13,
        output: 4,
        total: 17,
        cacheRead: 2,
        cacheWrite: 1,
      });
      expect(result.providerMetadata).toMatchObject({
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        responseId: "msg-invoke",
        responseModel: "claude-sonnet-4-5",
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
      });
      expect(result.warnings).toEqual([
        {
          type: "compatibility",
          feature: "responseFormat",
          details:
            "Anthropic does not expose a provider-native JSON schema response format in this provider. Kortyx maps JSON mode through system instructions.",
        },
      ]);
    },
  },
  stream: {
    createModel: () => {
      const provider = createAnthropic({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(
            String(init?.body),
          ) as AnthropicMessagesRequest;
          expect(requestBody).toMatchObject({
            model: "claude-sonnet-4-5",
            max_tokens: 1328,
            stream: true,
            thinking: {
              type: "enabled",
              budget_tokens: 1200,
            },
          });
          expect(requestBody).not.toHaveProperty("temperature");
          expect(requestBody.system).toBe("You are a concise assistant.");

          return createSseResponse([
            {
              type: "message_start",
              message: {
                id: "msg-stream",
                type: "message",
                role: "assistant",
                model: "claude-sonnet-4-5",
                content: [],
                usage: {
                  input_tokens: 7,
                },
              },
            },
            {
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "text_delta",
                text: "Hello",
              },
            },
            {
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "text_delta",
                text: " world",
              },
            },
            {
              type: "message_delta",
              delta: {
                stop_reason: "end_turn",
                stop_sequence: null,
              },
              usage: {
                output_tokens: 2,
              },
            },
            {
              type: "message_stop",
            },
          ]);
        },
      });

      return provider.getModel("claude-sonnet-4-5", {
        streaming: true,
        temperature: 0.2,
        maxOutputTokens: 128,
        reasoning: { maxTokens: 1200 },
      });
    },
    assert: async ({ parts, text, finishPart }) => {
      expect(text).toBe("Hello world");
      expect(
        parts
          .filter((part) => part.type === "text-delta")
          .map((part) =>
            part.type === "text-delta" ? part.delta : "<unexpected>",
          ),
      ).toEqual(["Hello", " world"]);
      expect(finishPart).toMatchObject({
        type: "finish",
        finishReason: {
          unified: "stop",
          raw: "end_turn",
        },
        usage: {
          input: 7,
          output: 2,
          total: 9,
        },
        providerMetadata: {
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          responseId: "msg-stream",
          responseModel: "claude-sonnet-4-5",
        },
      });
      expect(finishPart?.warnings).toEqual([
        {
          type: "unsupported",
          feature: "temperature",
          details:
            "Anthropic extended thinking does not support temperature. Kortyx omits temperature when thinking is enabled.",
        },
      ]);
    },
  },
  abort: {
    createModel: (signal) => {
      const provider = createAnthropic({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const receivedSignal = init?.signal as AbortSignal | undefined;
          expect(receivedSignal).toBe(signal);

          return await new Promise<Response>((_resolve, reject) => {
            receivedSignal?.addEventListener(
              "abort",
              () => {
                reject(
                  new DOMException("The operation was aborted.", "AbortError"),
                );
              },
              { once: true },
            );
          });
        },
      });

      return provider.getModel("claude-haiku-4-5", {
        abortSignal: signal,
      });
    },
    mode: "invoke",
    afterStart: (controller) => {
      controller.abort();
    },
    assert: async (error) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Anthropic provider failed to invoke content",
      );
    },
  },
});
