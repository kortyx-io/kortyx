import type { StreamChunk } from "../types/stream-chunk";
import type { StructuredDataChunk } from "../types/structured-data";
import { collectStream } from "./collect-stream";

export interface BufferedStreamResult {
  chunks: StreamChunk[];
  text: string;
  structured: StructuredDataChunk[];
}

const getTextStreamId = (
  chunk: Extract<StreamChunk, { type: "text-delta" }>,
) => {
  const opId =
    typeof chunk.opId === "string" && chunk.opId.length > 0
      ? chunk.opId
      : undefined;
  const segmentId =
    typeof chunk.segmentId === "string" && chunk.segmentId.length > 0
      ? chunk.segmentId
      : undefined;

  if (opId && segmentId) return `${opId}:${segmentId}`;
  return segmentId || opId || chunk.id || chunk.node;
};

const appendTextDelta = (
  text: string,
  delta: string,
  streamId: string | undefined,
  lastStreamId: string | undefined,
) => {
  if (
    streamId &&
    lastStreamId &&
    streamId !== lastStreamId &&
    text.length > 0 &&
    !/\s$/.test(text) &&
    !/^\s/.test(delta)
  ) {
    return `${text} ${delta}`;
  }

  return text + delta;
};

/**
 * Derive convenient buffered fields from raw chunks.
 * `text-delta` is preferred; `message` is fallback when no text deltas exist.
 */
export function summarizeStreamChunks(
  chunks: StreamChunk[],
): Omit<BufferedStreamResult, "chunks"> {
  let sawTextDelta = false;
  let text = "";
  let lastTextStreamId: string | undefined;
  const messageFallback: string[] = [];
  const structured: StructuredDataChunk[] = [];

  for (const chunk of chunks) {
    if (chunk.type === "text-delta") {
      sawTextDelta = true;
      const streamId = getTextStreamId(chunk);
      text = appendTextDelta(text, chunk.delta, streamId, lastTextStreamId);
      if (streamId) lastTextStreamId = streamId;
      continue;
    }

    if (chunk.type === "message") {
      messageFallback.push(chunk.content ?? "");
      continue;
    }

    if (chunk.type === "structured-data") {
      structured.push(chunk as StructuredDataChunk);
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
