import { DomainError, serializeFailure } from "@kortyx/core/errors";
import { expect, it } from "vitest";
import {
  collectBufferedStream,
  collectStream,
  consumeStream,
  createStreamResponse,
  failureChunk,
  readStream,
  streamFromRoute,
} from "../src";
import { StreamChunkSchema } from "../src/types/stream-chunk";

it("reports clean premature EOF and keeps partial output", async () => {
  const seen: unknown[] = [];
  const body = new Response('data: {"type":"message","content":"partial"}\n\n')
    .body;
  await expect(
    (async () => {
      for await (const chunk of readStream(body)) seen.push(chunk);
    })(),
  ).rejects.toHaveProperty("code", "TRUNCATED_STREAM");
  expect(seen).toEqual([{ type: "message", content: "partial" }]);
});

it("does not let reader cleanup replace a malformed stream failure", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: broken\n\n"));
    },
    cancel() {
      throw new Error("cleanup");
    },
  });
  await expect(collectStream(readStream(body))).rejects.toHaveProperty(
    "code",
    "MALFORMED_STREAM",
  );
});

it("accepts legacy failure events and an empty transport", async () => {
  expect(
    await collectStream(
      readStream(
        new Response(
          'data: {"type":"error","message":"legacy"}\n\ndata: [DONE]\n\n',
        ).body,
      ),
    ),
  ).toEqual([{ type: "error", message: "legacy" }]);
  expect(await collectStream(readStream(new Response("").body))).toEqual([]);
});

it("preserves a safe failure through SSE, callbacks and buffered collection", async () => {
  const error = new DomainError("UNAVAILABLE", "Service unavailable.", {
    details: { service: "search" },
    cause: new Error("secret"),
  });
  const failure = serializeFailure(error);
  const chunk = StreamChunkSchema.parse(failureChunk(error));
  const make = async function* () {
    yield chunk;
    yield { type: "done" as const };
  };
  const buffered = await collectBufferedStream(make());
  expect(buffered).toMatchObject({
    text: "",
    structured: [],
    chunks: [{ failure }, { type: "done" }],
  });
  const chunks = await collectStream(
    readStream(createStreamResponse(make()).body),
  );
  expect(chunks).toEqual([chunk, { type: "done" }]);
  let caught: unknown;
  await consumeStream(make(), {
    onError(error) {
      caught = error;
    },
  });
  expect(caught).toMatchObject({ code: "DOMAIN_ERROR", failure });
  expect(JSON.stringify(chunks)).not.toContain("secret");
});

it("preserves structured HTTP failures and retains legacy text support", async () => {
  const failure = new DomainError("DENIED", "Action unavailable.").failure;
  const chunks = await collectStream(
    streamFromRoute({
      endpoint: "/test",
      body: {},
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "legacy", failure }), {
          status: 400,
        }),
    }),
  );
  expect(chunks[0]).toMatchObject({ message: "Action unavailable.", failure });
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    collectStream(
      streamFromRoute({
        endpoint: "/test",
        body: {},
        signal: cancelled.signal,
        fetchImpl: async () => {
          throw cancelled.signal.reason;
        },
      }),
    ),
  ).rejects.toHaveProperty("name", "AbortError");
});

it.each([
  'data: {"type":"error","message":4}\n\n',
  'data: {"type":"error","message":"bad","failure":{}}\n\n',
  "data: null\n\n",
  'data: {"type":"message","content":"partial"}',
])("rejects corrupted or truncated wire events without echoing payloads: %s", async (body) => {
  await expect(
    collectStream(readStream(new Response(body).body)),
  ).rejects.toHaveProperty("code");
});
