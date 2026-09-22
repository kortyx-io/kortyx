import { expect } from "vitest";
import { describeProviderConformance } from "../../../packages/providers/test/conformance";
import { createOpenRouter } from "../src/provider";

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

const sse = (events: unknown[]): Response =>
  new Response(
    `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );

describeProviderConformance({
  providerName: "openrouter",
  invoke: {
    createModel: () =>
      createOpenRouter({
        apiKey: "test-key",
        fetch: async () =>
          json({
            id: "invoke-1",
            object: "chat.completion",
            created: 1,
            model: "anthropic/claude-sonnet-4.6",
            system_fingerprint: null,
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: { role: "assistant", content: "Hello" },
              },
            ],
            usage: {
              prompt_tokens: 4,
              completion_tokens: 2,
              total_tokens: 6,
            },
          }),
      }).getModel("anthropic/claude-sonnet-4.6"),
    assert: (result) => {
      expect(result).toMatchObject({
        content: "Hello",
        usage: { input: 4, output: 2, total: 6 },
        finishReason: { unified: "stop" },
        providerMetadata: { providerId: "openrouter" },
      });
    },
  },
  stream: {
    createModel: () =>
      createOpenRouter({
        apiKey: "test-key",
        fetch: async () => {
          const base = {
            id: "stream-1",
            object: "chat.completion.chunk",
            created: 1,
            model: "google/gemini-3.1-flash-lite-preview",
          };
          return sse([
            {
              ...base,
              choices: [
                {
                  index: 0,
                  finish_reason: null,
                  delta: { role: "assistant", content: "Hello" },
                },
              ],
            },
            {
              ...base,
              choices: [
                {
                  index: 0,
                  finish_reason: "stop",
                  delta: { content: " world" },
                },
              ],
            },
            {
              ...base,
              choices: [],
              usage: {
                prompt_tokens: 4,
                completion_tokens: 2,
                total_tokens: 6,
              },
            },
          ]);
        },
      }).getModel("google/gemini-3.1-flash-lite-preview"),
    assert: ({ text, finishPart }) => {
      expect(text).toBe("Hello world");
      expect(finishPart).toMatchObject({
        finishReason: { unified: "stop" },
        usage: { input: 4, output: 2, total: 6 },
      });
    },
  },
  abort: {
    createModel: (signal) =>
      createOpenRouter({
        apiKey: "test-key",
        fetch: async (input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init);
          if (request.signal.aborted)
            throw new DOMException("Aborted", "AbortError");
          return new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          });
        },
      }).getModel("openai/gpt-5.2", { abortSignal: signal }),
    afterStart: (controller) => controller.abort(),
    assert: (error) => {
      expect(error).toBeDefined();
    },
  },
});
