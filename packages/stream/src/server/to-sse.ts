import type { StreamChunk } from "../types/stream-chunk";
import { createStreamResponse } from "./create-stream-response";

/**
 * Friendly alias for createStreamResponse.
 */
export function toSSE(stream: AsyncIterable<StreamChunk>): Response {
  return createStreamResponse(stream);
}
