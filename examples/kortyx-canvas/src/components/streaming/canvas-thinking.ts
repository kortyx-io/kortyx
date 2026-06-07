import type { ContentPiece } from "@kortyx/react";
import { CANVAS_THINKING_DATA_TYPE } from "@/lib/protocol";

/** Returns the stream id when a piece marks the start of canvas creation. */
export function pickCanvasCreateStreamId(piece: ContentPiece): string | null {
  if (piece.type !== "structured") return null;
  if (piece.data.dataType !== CANVAS_THINKING_DATA_TYPE) return null;
  const data = (piece.data.data ?? {}) as {
    phase?: string;
    status?: string;
  };
  if (data.phase !== "create" || data.status === "done") return null;
  const streamId = piece.data.streamId ?? piece.id;
  return streamId ?? null;
}
