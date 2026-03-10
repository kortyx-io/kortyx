import type { StreamChunk } from "../types/stream-chunk";
import { collectStream } from "./collect-stream";

export type StructuredStreamChunk = {
  type: "structured-data";
  data: unknown;
  dataType?: string;
  mode?: "final" | "patch" | "snapshot";
  schemaId?: string;
  schemaVersion?: string;
  id?: string;
  opId?: string;
  node?: string;
};

export interface BufferedStreamResult {
  chunks: StreamChunk[];
  text: string;
  structured: StructuredStreamChunk[];
}

/**
 * Derive convenient buffered fields from raw chunks.
 * `text-delta` is preferred; `message` is fallback when no text deltas exist.
 */
export function summarizeStreamChunks(
  chunks: StreamChunk[],
): Omit<BufferedStreamResult, "chunks"> {
  let sawTextDelta = false;
  let text = "";
  const messageFallback: string[] = [];
  const structured: StructuredStreamChunk[] = [];

  for (const chunk of chunks) {
    if (chunk.type === "text-delta") {
      sawTextDelta = true;
      text += chunk.delta;
      continue;
    }

    if (chunk.type === "message") {
      messageFallback.push(chunk.content ?? "");
      continue;
    }

    if (chunk.type === "structured-data") {
      structured.push(chunk as StructuredStreamChunk);
    }
  }

  if (!sawTextDelta && messageFallback.length > 0) {
    text = messageFallback.join("");
  }

  return { text, structured };
}

/**
 * Collect a stream and return both raw chunks and buffered convenience fields.
 */
export async function collectBufferedStream(
  stream: AsyncIterable<StreamChunk>,
): Promise<BufferedStreamResult> {
  const chunks = await collectStream(stream);
  return {
    chunks,
    ...summarizeStreamChunks(chunks),
  };
}
