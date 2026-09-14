// packages/stream/src/client/read-stream.ts
import {
  isFailureDescriptor,
  KortyxError,
  serializeFailure,
} from "@kortyx/core/errors";
import type { StreamChunk } from "../types/stream-chunk";

/**
 * Reads a server-sent event (SSE) Response body and yields StreamChunk objects.
 */
export async function* readStream(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<StreamChunk, void, void> {
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let sawData = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer = (buffer + decoder.decode(value, { stream: true })).replaceAll(
        "\r\n",
        "\n",
      );
      const parts = buffer.split("\n\n");
      buffer = parts.pop() as string;

      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        sawData = true;
        const payload = part.slice(6);
        if (payload.trim() === "[DONE]") return;
        try {
          const chunk = JSON.parse(payload) as StreamChunk;
          if (
            !chunk ||
            typeof chunk !== "object" ||
            typeof chunk.type !== "string"
          )
            throw new Error("Invalid event");
          if (chunk.type === "error") {
            if (
              typeof chunk.message !== "string" ||
              (chunk.failure !== undefined &&
                !isFailureDescriptor(chunk.failure))
            )
              throw new Error("Invalid failure event");
            if (chunk.failure) chunk.failure = serializeFailure(chunk.failure);
          }
          yield chunk;
          if (chunk.type === "done") return;
        } catch (err) {
          throw new KortyxError(
            "MALFORMED_STREAM",
            "Invalid JSON or event in stream.",
            {
              category: "transport",
              retryable: false,
              safeMessage: "The response stream contained an invalid event.",
              cause: err,
            },
          );
        }
      }
    }
    if (buffer.trim() || sawData)
      throw new KortyxError(
        "TRUNCATED_STREAM",
        "Stream ended with an incomplete event.",
        {
          category: "transport",
          retryable: null,
          safeMessage: "The response stream ended before an event completed.",
        },
      );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
