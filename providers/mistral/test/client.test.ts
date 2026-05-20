import { describe, expect, it, vi } from "vitest";
import { createMistralClient } from "../src/client";
import { ProviderConfigurationError } from "../src/errors";
import type { MistralChatCompletionRequest } from "../src/types";

const request: MistralChatCompletionRequest = {
  model: "mistral-large-latest",
  messages: [{ role: "user", content: "Hello" }],
};

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("mistral client", () => {
  it("sends trimmed base URL, auth headers, body, and abort signal", async () => {
    const signal = new AbortController().signal;
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(input).toBe("https://mistral.example.test/chat/completions");
      expect(init?.headers).toEqual({
        authorization: "Bearer test-key",
        "content-type": "application/json",
      });
      expect(init?.body).toBe(JSON.stringify(request));
      expect(init?.signal).toBe(signal);
      return createJsonResponse({ id: "ok" });
    };

    const client = createMistralClient({
      apiKey: "test-key",
      baseUrl: "https://mistral.example.test///",
      fetch: fetchImpl,
    });

    await expect(
      client.createChatCompletion(request, { signal }),
    ).resolves.toMatchObject({ id: "ok" });
  });

  it("streams CRLF SSE payloads, skips non-object events, and flushes final data", async () => {
    const client = createMistralClient({
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

  it("uses Mistral top-level error messages before nested fallbacks", async () => {
    const messageClient = createMistralClient({
      apiKey: "test-key",
      fetch: async () => createJsonResponse({ message: "top-level" }, 400),
    });
    await expect(messageClient.createChatCompletion(request)).rejects.toThrow(
      "top-level",
    );

    const detailClient = createMistralClient({
      apiKey: "test-key",
      fetch: async () => createJsonResponse({ detail: "detail text" }, 400),
    });
    await expect(detailClient.createChatCompletion(request)).rejects.toThrow(
      "detail text",
    );
  });

  it("requires a fetch implementation when global fetch is unavailable", () => {
    vi.stubGlobal("fetch", undefined);

    expect(() => createMistralClient({ apiKey: "test-key" })).toThrowError(
      ProviderConfigurationError,
    );

    vi.unstubAllGlobals();
  });
});
