import { describe, expect, it, vi } from "vitest";
import { createGoogleClient } from "../src/client";
import { ProviderConfigurationError } from "../src/errors";
import type { GoogleGenerateContentRequest } from "../src/types";

const request: GoogleGenerateContentRequest = {
  contents: [{ role: "user", parts: [{ text: "Hello" }] }],
};

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("google client", () => {
  it("sends model URL, auth headers, body, and abort signal", async () => {
    const signal = new AbortController().signal;
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(input).toBe(
        "https://google.example.test/models/gemini-2.5-flash:generateContent",
      );
      expect(init?.headers).toEqual({
        "content-type": "application/json",
        "x-goog-api-key": "test-key",
      });
      expect(init?.body).toBe(JSON.stringify(request));
      expect(init?.signal).toBe(signal);
      return createJsonResponse({ responseId: "ok" });
    };

    const client = createGoogleClient({
      apiKey: "test-key",
      baseUrl: "https://google.example.test///",
      fetch: fetchImpl,
    });

    await expect(
      client.generateContent("gemini-2.5-flash", request, { signal }),
    ).resolves.toMatchObject({ responseId: "ok" });
  });

  it("preserves fully-qualified model paths for tuned Google models", async () => {
    const client = createGoogleClient({
      apiKey: "test-key",
      baseUrl: "https://google.example.test",
      fetch: async (input) => {
        expect(input).toBe(
          "https://google.example.test/tunedModels/custom:generateContent",
        );
        return createJsonResponse({});
      },
    });

    await client.generateContent("tunedModels/custom", request);
  });

  it("streams CRLF SSE payloads, skips non-object events, and flushes final data", async () => {
    const client = createGoogleClient({
      apiKey: "test-key",
      fetch: async () =>
        new Response('data: 0\r\n\r\ndata: {"responseId":"chunk"}', {
          headers: { "content-type": "text/event-stream" },
        }),
    });

    const chunks = [];
    for await (const chunk of client.streamGenerateContent(
      "gemini-2.5-flash",
      request,
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ responseId: "chunk" }]);
  });

  it("falls back to HTTP status for malformed provider error payloads", async () => {
    const client = createGoogleClient({
      apiKey: "test-key",
      fetch: async () => createJsonResponse({ error: { message: "" } }, 404),
    });

    await expect(
      client.generateContent("gemini-2.5-flash", request),
    ).rejects.toThrow("HTTP 404");
  });

  it("requires a fetch implementation when global fetch is unavailable", () => {
    vi.stubGlobal("fetch", undefined);

    expect(() => createGoogleClient({ apiKey: "test-key" })).toThrowError(
      ProviderConfigurationError,
    );

    vi.unstubAllGlobals();
  });
});
