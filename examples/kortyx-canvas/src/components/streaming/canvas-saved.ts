import type { ContentPiece } from "@kortyx/react";
import { CANVAS_SAVED_DATA_TYPE } from "@/lib/protocol";

export type DiscoveryCanvasSavedChunk = {
  canvasId: string;
  title: string;
};

/**
 * Pulls the `{ canvasId, title }` payload out of a `canvas.saved` content
 * piece. Mirrors `server/streaming/canvas-saved.ts` — the save node emits
 * the chunk after a successful persistence call so the client can stash
 * the id and reuse it on subsequent saves (preventing duplicate canvas
 * rows).
 */
export function pickDiscoveryCanvasSaved(
  piece: ContentPiece,
): DiscoveryCanvasSavedChunk | null {
  if (piece.type !== "structured") return null;
  if (piece.data.dataType !== CANVAS_SAVED_DATA_TYPE) return null;
  const data = piece.data.data;
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.canvasId === "string" && typeof rec.title === "string") {
    return { canvasId: rec.canvasId, title: rec.title };
  }
  return null;
}

/**
 * Walks live stream pieces first then finalized pieces in reverse to find
 * the most recent `canvas.saved` chunk. Returns null when the canvas has
 * never been saved.
 */
export function findLatestDiscoveryCanvasSaved(
  finalizedPieces: ContentPiece[],
  streamPieces: ContentPiece[],
): DiscoveryCanvasSavedChunk | null {
  for (const piece of streamPieces) {
    const data = pickDiscoveryCanvasSaved(piece);
    if (data) return data;
  }
  for (let i = finalizedPieces.length - 1; i >= 0; i -= 1) {
    const piece = finalizedPieces[i];
    if (!piece) continue;
    const data = pickDiscoveryCanvasSaved(piece);
    if (data) return data;
  }
  return null;
}
