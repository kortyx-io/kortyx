import { describe, expect, it } from "vitest";
import type { KortyxModel, KortyxPromptMessage, ModelOptions } from "../src";

const DEFAULT_MESSAGES: KortyxPromptMessage[] = [
  { role: "user", content: "Say hello." },
];

type ProviderFailureConformanceArgs = {
  providerName: string;
  createModel: (
    fetch: typeof globalThis.fetch,
    options?: ModelOptions,
  ) => KortyxModel;
  httpErrorBody?: unknown;
  httpErrorMessage?: string;
};

const collectStreamParts = async (model: KortyxModel) => {
  const parts = [];
  for await (const part of await model.stream(DEFAULT_MESSAGES)) {
    parts.push(part);
  }
  return parts;
};

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

const createTextResponse = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

const createSseResponse = (body: string): Response =>
  new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
    },
  });

export function describeProviderFailureConformance(
  args: ProviderFailureConformanceArgs,
): void {
  describe(`${args.providerName} provider failure conformance`, () => {
    it.each([
      [408, true],
      [429, true],
      [503, true],
      [400, false],
      [401, false],
      [403, false],
    ])("preserves classification for HTTP %i in invoke and stream", async (status, retryable) => {
      const model = args.createModel(
        async () =>
          new Response(
            JSON.stringify({ error: { message: "private provider detail" } }),
            { status, headers: { "retry-after": "3" } },
          ),
      );
      await expect(model.invoke(DEFAULT_MESSAGES)).rejects.toMatchObject({
        code: "PROVIDER_HTTP_ERROR",
        status,
        statusCode: status,
        retryable,
        retryAfterMs: 3000,
      });
      const parts = await collectStreamParts(model);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: "error",
        error: { code: "PROVIDER_HTTP_ERROR", status, retryable },
      });
      expect(JSON.stringify(parts)).not.toContain("private provider detail");
    });

    it("retains the original network exception as its live cause", async () => {
      const cause = new TypeError("connection failed");
      const model = args.createModel(async () => {
        throw cause;
      });
      await expect(model.invoke(DEFAULT_MESSAGES)).rejects.toMatchObject({
        code: "PROVIDER_TRANSPORT_ERROR",
        cause,
      });
    });

    it("surfaces HTTP provider errors from invoke", async () => {
      const model = args.createModel(async () =>
        createJsonResponse(
          args.httpErrorBody ?? {
            error: {
              message: "rate limited",
            },
          },
          429,
        ),
      );

      await expect(model.invoke(DEFAULT_MESSAGES)).rejects.toThrow(
        `${args.providerName} provider failed to invoke content`,
      );
      await expect(model.invoke(DEFAULT_MESSAGES)).rejects.toThrow(
        args.httpErrorMessage ?? "rate limited",
      );
    });

    it("surfaces invalid JSON invoke payloads", async () => {
      const model = args.createModel(async () => createTextResponse("{"));

      await expect(model.invoke(DEFAULT_MESSAGES)).rejects.toThrow(
        "invalid JSON response",
      );
    });

    it("surfaces unexpected non-object invoke payloads", async () => {
      const model = args.createModel(async () => createJsonResponse([]));

      await expect(model.invoke(DEFAULT_MESSAGES)).rejects.toThrow(
        "unexpected response payload",
      );
    });

    it("converts HTTP stream failures into typed error parts", async () => {
      const model = args.createModel(async () => createJsonResponse({}, 503));

      const parts = await collectStreamParts(model);

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: "error",
        error: expect.any(Error),
      });
      expect(parts[0]?.type === "error" ? parts[0].error : undefined).toEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            `${args.providerName} provider failed to stream content`,
          ),
        }),
      );
    });

    it("converts malformed SSE stream payloads into typed error parts", async () => {
      const model = args.createModel(async () =>
        createSseResponse("data: not-json\n\n"),
      );

      const parts = await collectStreamParts(model);

      expect(parts).toHaveLength(1);
      expect(parts[0]?.type).toBe("error");
      expect(parts[0]?.type === "error" ? parts[0].error : undefined).toEqual(
        expect.objectContaining({
          message: expect.stringContaining("invalid SSE JSON"),
        }),
      );
    });

    it("converts empty stream bodies into typed error parts", async () => {
      const model = args.createModel(async () => new Response(null));

      const parts = await collectStreamParts(model);

      expect(parts).toHaveLength(1);
      expect(parts[0]?.type).toBe("error");
      expect(parts[0]?.type === "error" ? parts[0].error : undefined).toEqual(
        expect.objectContaining({
          message: expect.stringContaining("response body is empty"),
        }),
      );
    });
  });
}
