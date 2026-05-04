import { describe, expect, it, vi } from "vitest";
import {
  collectBufferedStream,
  collectStream,
  consumeStream,
  createStreamResponse,
  createStructuredStreamAccumulator,
  readStream,
  streamFromRoute,
  toSSE,
} from "../src";
import type { StreamChunk } from "../src/types/stream-chunk";

async function* makeStream(chunks: StreamChunk[]) {
  for (const chunk of chunks) yield chunk;
}

const responseText = async (response: Response) => {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
};

describe("readStream", () => {
  it("parses server-sent event chunks and stops at DONE", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            "event: ignored\n\n" +
              'data: {"type":"message","content":"hi"}\n\n' +
              'data: {"type":"done"}\n\n' +
              "data: [DONE]\n\n" +
              'data: {"type":"message","content":"after"}\n\n',
          ),
        );
        controller.close();
      },
    });

    await expect(collectStream(readStream(body))).resolves.toEqual([
      { type: "message", content: "hi" },
      { type: "done" },
    ]);
    await expect(collectStream(readStream(null))).resolves.toEqual([]);
  });
});

describe("consumeStream", () => {
  it("calls chunk, error, and done handlers once", async () => {
    const onChunk = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();

    await consumeStream(
      makeStream([
        { type: "message", content: "hi" },
        { type: "error", message: "failed" },
        { type: "done" },
      ]),
      { onChunk, onError, onDone },
    );

    expect(onChunk).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      type: "error",
      message: "failed",
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("stops when onChunk returns false and rethrows stream errors", async () => {
    const onDone = vi.fn();

    await consumeStream(
      makeStream([
        { type: "message", content: "first" },
        { type: "message", content: "second" },
      ]),
      { onChunk: () => false, onDone },
    );

    expect(onDone).toHaveBeenCalledTimes(1);

    async function* brokenStream() {
      yield* makeStream([]);
      throw "boom";
    }

    await expect(
      consumeStream(brokenStream(), { onError: vi.fn() }),
    ).rejects.toThrow("boom");
  });
});

describe("streamFromRoute", () => {
  it("posts JSON and yields parsed response chunks", async () => {
    const fetchImpl = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      expect(init).toMatchObject({
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer token",
        },
        body: JSON.stringify({ prompt: "hello" }),
      });

      return createStreamResponse(
        makeStream([{ type: "message", content: "response" }]),
      );
    });

    await expect(
      collectStream(
        streamFromRoute({
          endpoint: "https://kortyx.test/chat",
          method: "PATCH",
          headers: { authorization: "Bearer token" },
          body: { prompt: "hello" },
          fetchImpl: fetchImpl as typeof fetch,
        }),
      ),
    ).resolves.toEqual([{ type: "message", content: "response" }]);
  });

  it("yields error and done chunks for failed requests", async () => {
    await expect(
      collectStream(
        streamFromRoute({
          endpoint: "https://kortyx.test/chat",
          body: {},
          fetchImpl: async () =>
            new Response(JSON.stringify({ error: "bad request" }), {
              status: 400,
            }),
        }),
      ),
    ).resolves.toEqual([
      { type: "error", message: "bad request" },
      { type: "done" },
    ]);

    await expect(
      collectStream(
        streamFromRoute({
          endpoint: "https://kortyx.test/chat",
          body: {},
          fetchImpl: async () => {
            throw new Error("offline");
          },
        }),
      ),
    ).resolves.toEqual([
      { type: "error", message: "offline" },
      { type: "done" },
    ]);
  });
});

describe("server stream helpers", () => {
  it("collects, summarizes, and serializes streams", async () => {
    const chunks: StreamChunk[] = [
      { type: "session", sessionId: "s1" },
      { type: "message", content: "fallback" },
      {
        type: "structured-data",
        streamId: "jobs",
        dataType: "jobs",
        kind: "final",
        data: [{ id: "job-1" }],
      },
      { type: "done" },
    ];

    await expect(collectBufferedStream(makeStream(chunks))).resolves.toEqual({
      chunks,
      text: "fallback",
      structured: [chunks[2]],
    });

    const response = toSSE(makeStream([{ type: "done" }]));
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    await expect(responseText(response)).resolves.toBe(
      'data: {"type":"done"}\n\ndata: [DONE]\n\n',
    );

    const errorResponse = createStreamResponse(
      (async function* () {
        yield* makeStream([]);
        throw new Error("stream failed");
      })(),
    );
    await expect(responseText(errorResponse)).resolves.toContain(
      '"message":"stream failed"',
    );
  });
});

describe("createStructuredStreamAccumulator", () => {
  it("tracks structured stream state and exposes map-like helpers", () => {
    const accumulator = createStructuredStreamAccumulator([
      {
        type: "structured-data",
        streamId: "profile",
        dataType: "profile",
        kind: "set",
        path: "name",
        value: "Ada",
      },
    ]);

    expect(accumulator.has("profile")).toBe(true);
    expect(
      accumulator.applyStreamChunk({ type: "message", content: "skip" }),
    ).toBeUndefined();

    accumulator.apply({
      type: "structured-data",
      streamId: "profile",
      dataType: "profile",
      kind: "final",
      data: { name: "Ada" },
    });

    expect(accumulator.get("profile")).toMatchObject({
      streamId: "profile",
      data: { name: "Ada" },
      status: "done",
    });
    expect(accumulator.size()).toBe(1);
    expect(accumulator.entries()).toHaveLength(1);
    expect(accumulator.values()).toHaveLength(1);
    expect(accumulator.toRecord().profile?.status).toBe("done");
    expect(accumulator.delete("profile")).toBe(true);
    accumulator.clear();
    expect(accumulator.size()).toBe(0);
  });
});
