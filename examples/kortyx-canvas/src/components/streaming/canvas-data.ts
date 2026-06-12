import type { ContentPiece } from "@kortyx/react";
import { CANVAS_DRAFT_DATA_TYPE } from "@/lib/protocol";
import type { DiscoveryCanvasResponse } from "@/schemas/discovery-canvas";

/**
 * Extracts the `canvas.draft` payload from a content piece. The
 * `create-canvas` and `summarize-canvas` nodes stream this dataType through
 * `useStructuredData`; the panel uses it to replace the canvas draft.
 */
export function pickDiscoveryCanvasData(
  piece: ContentPiece,
): DiscoveryCanvasResponse | null {
  if (piece.type !== "structured") return null;
  if (piece.data.dataType !== CANVAS_DRAFT_DATA_TYPE) return null;
  const data = piece.data.data;
  if (!data || typeof data !== "object") return null;
  return data as unknown as DiscoveryCanvasResponse;
}
