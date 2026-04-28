import { expect } from "vitest";
import { describeProviderConformance } from "../../../packages/providers/test/conformance";
import { createGroq } from "../src/provider";
import type { GroqChatCompletionRequest } from "../src/types";

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
  providerName: "groq",
  invoke: {
    createModel: () => {
      const provider = createGroq({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(
            String(init?.body),
          ) as GroqChatCompletionRequest;
          expect(requestBody).toMatchObject({
            model: "llama-3.3-70b-versatile",
            temperature: 0.2,
            max_tokens: 256,
            stop: ["END"],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "response",
                schema: { type: "object" },
                strict: true,
              },
            },
            reasoning_effort: "medium",
            reasoning_format: "parsed",
            service_tier: "on_demand",
            stream: false,
          });
          return createJsonResponse({
            id: "resp-invoke",
            model: "llama-3.3-70b-versatile",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: '{"message":"Hello from Groq"}',
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 4,
              total_tokens: 14,
              prompt_tokens_details: {
                cached_tokens: 2,
              },
              completion_tokens_details: {
                reasoning_tokens: 1,
              },
            },
          });
        },
      });

      return provider.getModel("llama-3.3-70b-versatile", {
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
        providerOptions: {
          reasoningFormat: "parsed",
          serviceTier: "on_demand",
        },
      });
    },
    assert: async (result) => {
      expect(result.role).toBe("assistant");
      expect(result.content).toBe('{"message":"Hello from Groq"}');
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
        providerId: "groq",
        modelId: "llama-3.3-70b-versatile",
        responseId: "resp-invoke",
        responseModel: "llama-3.3-70b-versatile",
        cachedTokens: 2,
        reasoningTokens: 1,
      });
      expect(result.warnings).toBeUndefined();
    },
  },
  stream: {
    createModel: () => {
      const provider = createGroq({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(
            String(init?.body),
          ) as GroqChatCompletionRequest;
          expect(requestBody).toMatchObject({
            model: "openai/gpt-oss-20b",
            stream: true,
            stream_options: { include_usage: true },
          });
          return createSseResponse([
            {
              id: "resp-stream",
              model: "openai/gpt-oss-20b",
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
              model: "openai/gpt-oss-20b",
              choices: [
                {
                  delta: {
                    content: " world",
                  },
                  finish_reason: "stop",
                },
              ],
              x_groq: {
                usage: {
                  prompt_tokens: 7,
                  completion_tokens: 2,
                  total_tokens: 9,
                },
              },
            },
          ]);
        },
      });

      return provider.getModel("openai/gpt-oss-20b", {
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
          providerId: "groq",
          modelId: "openai/gpt-oss-20b",
          responseId: "resp-stream",
          responseModel: "openai/gpt-oss-20b",
        },
      });
    },
  },
  abort: {
    createModel: (signal) => {
      const provider = createGroq({
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

      return provider.getModel("llama-3.1-8b-instant", {
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
        "Groq provider failed to invoke content",
      );
    },
  },
});
