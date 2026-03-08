import type { StreamChunk } from "../types/stream-chunk";

export interface ConsumeStreamHandlers {
  onChunk?: (
    chunk: StreamChunk,
  ) => void | boolean | Promise<boolean | undefined>;
  onDone?: () => void | Promise<void>;
  onError?: (error: Error, chunk?: StreamChunk) => void | Promise<void>;
}

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

/**
 * Consume a stream of StreamChunk events with callback handlers.
 * Returns when a `done` chunk is seen, the stream ends, or `onChunk` returns `false`.
 */
export async function consumeStream(
  stream: AsyncIterable<StreamChunk>,
  handlers: ConsumeStreamHandlers = {},
): Promise<void> {
  let doneCalled = false;

  const callDone = async () => {
    if (doneCalled) return;
    doneCalled = true;
    await handlers.onDone?.();
  };

  try {
    for await (const chunk of stream) {
      const shouldContinue = await handlers.onChunk?.(chunk);

      if (chunk.type === "error") {
        await handlers.onError?.(
          new Error(chunk.message || "Stream error."),
          chunk,
        );
      }

      if (chunk.type === "done" || shouldContinue === false) {
        await callDone();
        return;
      }
    }

    await callDone();
  } catch (error) {
    const normalized = toError(error);
    await handlers.onError?.(normalized);
    throw normalized;
  }
}
