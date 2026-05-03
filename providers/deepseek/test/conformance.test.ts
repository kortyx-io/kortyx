import { expect, it } from "vitest";
import { describeProviderConformance } from "../../../packages/providers/test/conformance";
import { createDeepSeek } from "../src/provider";
import type { DeepSeekChatCompletionRequest } from "../src/types";

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
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
  providerName: "deepseek",
  invoke: {
    createModel: () => {
      const provider = createDeepSeek({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(
            String(init?.body),
          ) as DeepSeekChatCompletionRequest;
          expect(requestBody).toMatchObject({
            model: "deepseek-chat",
            temperature: 0.2,
            max_tokens: 256,
            stop: ["END"],
            response_format: { type: "json_object" },
            thinking: { type: "enabled" },
            stream: false,
          });
          expect(requestBody.messages[0]).toMatchObject({
            role: "system",
            content: expect.stringContaining("Return JSON"),
          });
          return createJsonResponse({
            id: "resp-invoke",
            model: "deepseek-chat",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: '{"message":"Hello from DeepSeek"}',
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 4,
              total_tokens: 14,
              prompt_cache_hit_tokens: 2,
              prompt_cache_miss_tokens: 8,
              completion_tokens_details: {
                reasoning_tokens: 1,
              },
            },
          });
        },
      });

      return provider.getModel("deepseek-chat", {
        temperature: 0.2,
        maxOutputTokens: 256,
        stopSequences: ["END"],
        reasoning: { effort: "medium" },
        responseFormat: {
          type: "json",
          schema: {
            type: "object",
          },
        },
      });
    },
    assert: async (result) => {
      expect(result.role).toBe("assistant");
      expect(result.content).toBe('{"message":"Hello from DeepSeek"}');
      expect(result.finishReason).toEqual({
        unified: "stop",
        raw: "stop",
      });
      expect(result.usage).toMatchObject({
        input: 10,
        output: 4,
        total: 14,
        reasoning: 1,
        cacheRead: 2,
      });
      expect(result.providerMetadata).toMatchObject({
        providerId: "deepseek",
        modelId: "deepseek-chat",
        responseId: "resp-invoke",
        responseModel: "deepseek-chat",
        promptCacheHitTokens: 2,
        promptCacheMissTokens: 8,
      });
      expect(result.warnings).toEqual([
        {
          type: "compatibility",
          feature: "responseFormat.schema",
          details:
            "DeepSeek supports JSON mode but not generic JSON schema enforcement. Kortyx injects the schema into a system message.",
        },
      ]);
    },
  },
  stream: {
    createModel: () => {
      const provider = createDeepSeek({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(
            String(init?.body),
          ) as DeepSeekChatCompletionRequest;
          expect(requestBody).toMatchObject({
            model: "deepseek-reasoner",
            stream: true,
            stream_options: { include_usage: true },
          });
          return createSseResponse([
            {
              id: "resp-stream",
              model: "deepseek-reasoner",
              choices: [
                {
                  delta: {
                    content: "Hello",
                  },
                },
              ],
            },
            {
              id: "resp-stream",
              model: "deepseek-reasoner",
              choices: [
                {
                  delta: {
                    content: " world",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 7,
                completion_tokens: 2,
                total_tokens: 9,
              },
            },
          ]);
        },
      });

      return provider.getModel("deepseek-reasoner", {
        streaming: true,
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
          raw: "stop",
        },
        usage: {
          input: 7,
          output: 2,
          total: 9,
        },
        providerMetadata: {
          providerId: "deepseek",
          modelId: "deepseek-reasoner",
          responseId: "resp-stream",
          responseModel: "deepseek-reasoner",
        },
      });
    },
  },
  abort: {
    createModel: (signal) => {
      const provider = createDeepSeek({
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

      return provider.getModel("deepseek-chat", {
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
        "DeepSeek provider failed to invoke content",
      );
    },
  },
});

it("maps namespaced DeepSeek thinking provider options", async () => {
  const provider = createDeepSeek({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      const requestBody = JSON.parse(
        String(init?.body),
      ) as DeepSeekChatCompletionRequest;

      expect(requestBody).toMatchObject({
        model: "deepseek-reasoner",
        thinking: { type: "disabled" },
        stream: false,
      });

      return createJsonResponse({
        id: "resp-provider-options",
        model: "deepseek-reasoner",
        choices: [
          {
            message: {
              role: "assistant",
              content: "Done",
            },
            finish_reason: "stop",
          },
        ],
      });
    },
  });

  const model = provider.getModel("deepseek-reasoner", {
    providerOptions: {
      deepseek: {
        thinking: { type: "disabled" },
      },
    },
  });

  const result = await model.invoke([{ role: "user", content: "Hello" }]);

  expect(result.content).toBe("Done");
  expect(result.warnings).toBeUndefined();
});

it("warns for legacy top-level DeepSeek thinking provider options", async () => {
  const provider = createDeepSeek({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      const requestBody = JSON.parse(
        String(init?.body),
      ) as DeepSeekChatCompletionRequest;

      expect(requestBody.thinking).toBeUndefined();

      return createJsonResponse({
        id: "resp-provider-options",
        model: "deepseek-reasoner",
        choices: [
          {
            message: {
              role: "assistant",
              content: "Done",
            },
            finish_reason: "stop",
          },
        ],
      });
    },
  });

  const model = provider.getModel("deepseek-reasoner", {
    providerOptions: {
      thinking: { type: "disabled" },
    },
  });

  const result = await model.invoke([{ role: "user", content: "Hello" }]);

  expect(result.warnings).toEqual([
    {
      type: "unsupported",
      feature: "providerOptions",
      details:
        "DeepSeek provider currently maps providerOptions.deepseek.thinking.",
    },
  ]);
});
