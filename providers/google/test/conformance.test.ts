import { expect } from "vitest";
import { describeProviderConformance } from "../../../packages/providers/test/conformance";
import { createGoogleGenerativeAI } from "../src/provider";
import type { GoogleGenerateContentRequest } from "../src/types";

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
  providerName: "google",
  invoke: {
    createModel: () => {
      const provider = createGoogleGenerativeAI({
        apiKey: "test-key",
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(
            String(init?.body),
          ) as GoogleGenerateContentRequest;
          expect(requestBody.generationConfig).toMatchObject({
            temperature: 0.2,
            maxOutputTokens: 256,
            stopSequences: ["END"],
            responseMimeType: "application/json",
          });
          return createJsonResponse({
            candidates: [
              {
                content: {
                  parts: [{ text: "Hello from Gemini" }],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 4,
              totalTokenCount: 14,
              thoughtsTokenCount: 2,
            },
            promptFeedback: {
              blockReason: "NONE",
            },
            modelVersion: "gemini-2.5-flash",
            responseId: "resp-invoke",
          });
        },
      });

      const model = provider.getModel("gemini-2.5-flash", {
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
          experimental: true,
        },
      });

      return model;
    },
    assert: async (result) => {
      expect(result.role).toBe("assistant");
      expect(result.content).toBe("Hello from Gemini");
      expect(result.finishReason).toEqual({
        unified: "stop",
        raw: "STOP",
      });
      expect(result.usage).toMatchObject({
        input: 10,
        output: 4,
        total: 14,
        reasoning: 2,
      });
      expect(result.providerMetadata).toMatchObject({
        providerId: "google",
        modelId: "gemini-2.5-flash",
        responseId: "resp-invoke",
        modelVersion: "gemini-2.5-flash",
      });
      expect(result.warnings).toEqual([
        {
          type: "compatibility",
          feature: "responseFormat.schema",
          details:
            "Google provider currently applies JSON mode via responseMimeType but does not yet translate generic JSON schema to Google responseSchema.",
        },
        {
          type: "unsupported",
          feature: "providerOptions",
          details:
            "Google provider does not yet map providerOptions into request fields.",
        },
      ]);
    },
  },
  stream: {
    createModel: () => {
      const provider = createGoogleGenerativeAI({
        apiKey: "test-key",
        fetch: async () =>
          createSseResponse([
            {
              candidates: [
                {
                  content: {
                    parts: [{ text: "Hello" }],
                  },
                },
              ],
              usageMetadata: {
                promptTokenCount: 7,
                candidatesTokenCount: 1,
                totalTokenCount: 8,
              },
              modelVersion: "gemini-2.5-flash",
              responseId: "resp-stream",
            },
            {
              candidates: [
                {
                  content: {
                    parts: [{ text: "Hello world" }],
                  },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: {
                promptTokenCount: 7,
                candidatesTokenCount: 2,
                totalTokenCount: 9,
              },
              modelVersion: "gemini-2.5-flash",
              responseId: "resp-stream",
            },
          ]),
      });

      return provider.getModel("gemini-2.5-flash", {
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
          raw: "STOP",
        },
        usage: {
          input: 7,
          output: 2,
          total: 9,
        },
      });
    },
  },
  abort: {
    createModel: (signal) => {
      const provider = createGoogleGenerativeAI({
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

      const model = provider.getModel("gemini-2.5-flash", {
        abortSignal: signal,
      });

      return model;
    },
    mode: "invoke",
    afterStart: (controller) => {
      controller.abort();
    },
    assert: async (error) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Google provider failed to invoke content",
      );
    },
  },
});
