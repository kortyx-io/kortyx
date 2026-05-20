import { describe, expect, it, vi } from "vitest";
import { createAnthropicClient } from "../src/client";
import { ProviderConfigurationError } from "../src/errors";
import type { AnthropicMessagesRequest } from "../src/types";

const request: AnthropicMessagesRequest = {
  model: "claude-sonnet-4-5",
  max_tokens: 128,
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
};

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("anthropic client", () => {
  it("sends auth token headers, trimmed base URL, body, and abort signal", async () => {
    const signal = new AbortController().signal;
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(input).toBe("https://anthropic.example.test/messages");
      expect(init?.headers).toEqual({
        "anthropic-version": "2023-06-01",
        authorization: "Bearer test-token",
        "content-type": "application/json",
      });
      expect(init?.body).toBe(JSON.stringify(request));
      expect(init?.signal).toBe(signal);
      return createJsonResponse({ id: "ok" });
    };

    const client = createAnthropicClient({
      authToken: "test-token",
      baseUrl: "https://anthropic.example.test///",
      fetch: fetchImpl,
    });

    await expect(
      client.createMessage(request, { signal }),
    ).resolves.toMatchObject({ id: "ok" });
  });

  it("streams CRLF SSE payloads, skips non-object events, and flushes final data", async () => {
    const client = createAnthropicClient({
      apiKey: "test-key",
      fetch: async () =>
        new Response('data: 0\r\n\r\ndata: {"type":"ping"}', {
          headers: { "content-type": "text/event-stream" },
        }),
    });

    const events = [];
    for await (const event of client.streamMessage(request)) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "ping" }]);
  });

  it("falls back to HTTP status for malformed provider error payloads", async () => {
    const client = createAnthropicClient({
      apiKey: "test-key",
      fetch: async () => createJsonResponse({ error: { message: "" } }, 403),
    });

    await expect(client.createMessage(request)).rejects.toThrow("HTTP 403");
  });

  it("requires a fetch implementation when global fetch is unavailable", () => {
    vi.stubGlobal("fetch", undefined);

    expect(() => createAnthropicClient({ apiKey: "test-key" })).toThrowError(
      ProviderConfigurationError,
    );

    vi.unstubAllGlobals();
  });
});
