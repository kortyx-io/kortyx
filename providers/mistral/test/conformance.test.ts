import { expect } from "vitest";
import { describeProviderConformance } from "../../../packages/providers/test/conformance";
import { createMistral } from "../src/provider";
import type { MistralChatCompletionRequest } from "../src/types";

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
  providerName: "mistral",
  invoke: {
    createModel: () => {
      const provider = createMistral({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const headers = init?.headers as Record<string, string>;
          expect(headers.authorization).toBe("Bearer test-key");

          const requestBody = JSON.parse(
            String(init?.body),
          ) as MistralChatCompletionRequest;
          expect(requestBody).toMatchObject({
            model: "mistral-large-latest",
            temperature: 0.2,
            max_tokens: 256,
            top_p: 0.9,
            random_seed: 123,
            safe_prompt: true,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "response",
                schema: { type: "object" },
                strict: true,
              },
            },
            stream: false,
            messages: [
              {
                role: "system",
                content: "You are a concise assistant.",
              },
              {
                role: "user",
                content: "Say hello.",
              },
            ],
          });
          expect(requestBody).not.toHaveProperty("stop");

          return createJsonResponse({
            id: "cmpl-invoke",
            object: "chat.completion",
            created: 1710000000,
            model: "mistral-large-latest",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: [
                    {
                      type: "text",
                      text: '{"message":"Hello from Mistral"}',
                    },
                  ],
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 4,
              total_tokens: 14,
            },
          });
        },
      });

      return provider.getModel("mistral-large-latest", {
        temperature: 0.2,
        maxOutputTokens: 256,
        stopSequences: ["END"],
        responseFormat: {
          type: "json",
          schema: {
            type: "object",
          },
        },
        providerOptions: {
          safePrompt: true,
          strictJsonSchema: true,
          topP: 0.9,
          randomSeed: 123,
        },
      });
    },
    assert: async (result) => {
      expect(result.role).toBe("assistant");
      expect(result.content).toBe('{"message":"Hello from Mistral"}');
      expect(result.finishReason).toEqual({
        unified: "stop",
        raw: "stop",
      });
      expect(result.usage).toMatchObject({
        input: 10,
        output: 4,
        total: 14,
      });
      expect(result.providerMetadata).toMatchObject({
        providerId: "mistral",
        modelId: "mistral-large-latest",
        responseId: "cmpl-invoke",
        responseModel: "mistral-large-latest",
        created: 1710000000,
      });
      expect(result.warnings).toEqual([
        {
          type: "unsupported",
          feature: "stopSequences",
          details:
            "Mistral chat completions do not support stop sequences in the AI SDK reference implementation. Kortyx does not send them.",
        },
      ]);
    },
  },
  stream: {
    createModel: () => {
      const provider = createMistral({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(
            String(init?.body),
          ) as MistralChatCompletionRequest;
          expect(requestBody).toMatchObject({
            model: "mistral-small-latest",
            max_tokens: 128,
            reasoning_effort: "high",
            stream: true,
          });

          return createSseResponse([
            {
              id: "cmpl-stream",
              object: "chat.completion.chunk",
              created: 1710000001,
              model: "mistral-small-latest",
              choices: [
                {
                  index: 0,
                  delta: {
                    role: "assistant",
                    content: "Hello",
                  },
                },
              ],
            },
            {
              id: "cmpl-stream",
              object: "chat.completion.chunk",
              created: 1710000001,
              model: "mistral-small-latest",
              choices: [
                {
                  index: 0,
                  delta: {
                    content: [
                      {
                        type: "text",
                        text: " world",
                      },
                    ],
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

      return provider.getModel("mistral-small-latest", {
        streaming: true,
        maxOutputTokens: 128,
        reasoning: { effort: "high" },
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
          providerId: "mistral",
          modelId: "mistral-small-latest",
          responseId: "cmpl-stream",
          responseModel: "mistral-small-latest",
          created: 1710000001,
        },
      });
      expect(finishPart?.warnings).toBeUndefined();
    },
  },
  abort: {
    createModel: (signal) => {
      const provider = createMistral({
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

      return provider.getModel("ministral-8b-latest", {
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
        "Mistral provider failed to invoke content",
      );
    },
  },
});
