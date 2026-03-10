import type { StreamChunk } from "../types/stream-chunk";

/**
 * Collects a streamed chat response into an array.
 * Useful for non-streaming HTTP responses or server actions.
 */
export async function collectStream(
  stream: AsyncIterable<StreamChunk>,
): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}
