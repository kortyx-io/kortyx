import { describe, expect, it, vi } from "vitest";
import { createDeepSeekClient } from "../src/client";
import { ProviderConfigurationError } from "../src/errors";
import type { DeepSeekChatCompletionRequest } from "../src/types";

const request: DeepSeekChatCompletionRequest = {
  model: "deepseek-chat",
  messages: [{ role: "user", content: "Hello" }],
};

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("deepseek client", () => {
  it("sends trimmed base URL, auth headers, body, and abort signal", async () => {
    const signal = new AbortController().signal;
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(input).toBe("https://deepseek.example.test/chat/completions");
      expect(init?.headers).toEqual({
        authorization: "Bearer test-key",
        "content-type": "application/json",
      });
      expect(init?.body).toBe(JSON.stringify(request));
      expect(init?.signal).toBe(signal);
      return createJsonResponse({ id: "ok" });
    };

    const client = createDeepSeekClient({
      apiKey: "test-key",
      baseUrl: "https://deepseek.example.test///",
      fetch: fetchImpl,
    });

    await expect(
      client.createChatCompletion(request, { signal }),
    ).resolves.toMatchObject({ id: "ok" });
  });

  it("streams CRLF SSE payloads, skips non-object events, and flushes final data", async () => {
    const client = createDeepSeekClient({
      apiKey: "test-key",
      fetch: async () =>
        new Response('data: 0\r\n\r\ndata: {"id":"chunk"}', {
          headers: { "content-type": "text/event-stream" },
        }),
    });

    const chunks = [];
    for await (const chunk of client.streamChatCompletion(request)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ id: "chunk" }]);
  });

  it("falls back to HTTP status for malformed provider error payloads", async () => {
    const client = createDeepSeekClient({
      apiKey: "test-key",
      fetch: async () => createJsonResponse({ error: { message: "" } }, 500),
    });

    await expect(client.createChatCompletion(request)).rejects.toThrow(
      "HTTP 500",
    );
  });

  it("requires a fetch implementation when global fetch is unavailable", () => {
    vi.stubGlobal("fetch", undefined);

    expect(() => createDeepSeekClient({ apiKey: "test-key" })).toThrowError(
      ProviderConfigurationError,
    );

    vi.unstubAllGlobals();
  });
});
