// packages/stream/src/server/create-stream-response.ts
import type { StreamChunk } from "../types/stream-chunk";
import { JsonToSseTransformStream } from "./json-to-sse";

export const STREAM_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

/** Bridge stream cancellation to the source, including Node execution streams. */
export function createStreamResponse(
  stream: AsyncIterable<StreamChunk>,
): Response {
  let cancelled = false;
  const iterator = stream[Symbol.asyncIterator]();
  const readable = new ReadableStream<StreamChunk>({
    async start(controller) {
      try {
        while (!cancelled) {
          const next = await iterator.next();
          if (cancelled || next.done) break;
          controller.enqueue(next.value);
        }
      } catch (error) {
        if (!cancelled)
          controller.enqueue({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      // Destroying an active Kortyx stream signals its transient execution controller.
      (
        stream as AsyncIterable<StreamChunk> & { destroy?: () => void }
      ).destroy?.();
      void Promise.resolve(iterator.return?.()).catch(() => {});
    },
  });
  return new Response(
    readable
      .pipeThrough(new JsonToSseTransformStream())
      .pipeThrough(new TextEncoderStream()),
    { headers: STREAM_HEADERS },
  );
}
