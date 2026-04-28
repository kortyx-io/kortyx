import { expect } from "vitest";
import { describeProviderConformance } from "../../../packages/providers/test/conformance";
import { createOpenAI } from "../src/provider";
import type { OpenAIChatCompletionRequest } from "../src/types";

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
  providerName: "openai",
  invoke: {
    createModel: () => {
      const provider = createOpenAI({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(
            String(init?.body),
          ) as OpenAIChatCompletionRequest;
          expect(requestBody).toMatchObject({
            model: "gpt-4.1-mini",
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
            service_tier: "default",
            stream: false,
          });
          return createJsonResponse({
            id: "resp-invoke",
            model: "gpt-4.1-mini",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: '{"message":"Hello from OpenAI"}',
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
                accepted_prediction_tokens: 3,
                rejected_prediction_tokens: 0,
              },
            },
          });
        },
      });

      return provider.getModel("gpt-4.1-mini", {
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
          serviceTier: "default",
        },
      });
    },
    assert: async (result) => {
      expect(result.role).toBe("assistant");
      expect(result.content).toBe('{"message":"Hello from OpenAI"}');
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
        providerId: "openai",
        modelId: "gpt-4.1-mini",
        responseId: "resp-invoke",
        responseModel: "gpt-4.1-mini",
        cachedTokens: 2,
        reasoningTokens: 1,
        acceptedPredictionTokens: 3,
        rejectedPredictionTokens: 0,
      });
      expect(result.warnings).toBeUndefined();
    },
  },
  stream: {
    createModel: () => {
      const provider = createOpenAI({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(
            String(init?.body),
          ) as OpenAIChatCompletionRequest;
          expect(requestBody).toMatchObject({
            model: "gpt-5.4-mini",
            max_completion_tokens: 128,
            reasoning_effort: "high",
            stream: true,
            stream_options: { include_usage: true },
          });
          expect(requestBody).not.toHaveProperty("temperature");
          expect(requestBody.messages[0]).toMatchObject({
            role: "developer",
            content: "You are a concise assistant.",
          });
          return createSseResponse([
            {
              id: "resp-stream",
              model: "gpt-5.4-mini",
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
              model: "gpt-5.4-mini",
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

      return provider.getModel("gpt-5.4-mini", {
        streaming: true,
        temperature: 0.2,
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
          providerId: "openai",
          modelId: "gpt-5.4-mini",
          responseId: "resp-stream",
          responseModel: "gpt-5.4-mini",
        },
      });
      expect(finishPart?.warnings).toEqual([
        {
          type: "unsupported",
          feature: "temperature",
          details: "temperature is not supported for OpenAI reasoning models.",
        },
      ]);
    },
  },
  abort: {
    createModel: (signal) => {
      const provider = createOpenAI({
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

      return provider.getModel("gpt-4o-mini", {
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
        "OpenAI provider failed to invoke content",
      );
    },
  },
});
