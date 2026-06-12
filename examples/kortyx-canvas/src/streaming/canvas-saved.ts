import "server-only";

import { useStructuredData } from "kortyx";
import { CANVAS_SAVED_DATA_TYPE } from "@/lib/protocol";

/**
 * Tells the client which DB row the canvas was just persisted into.
 *
 * The chat panel stashes the id under the active chat session's storage
 * scope and ships it back on every subsequent request as
 * `context.savedDiscoveryCanvasId`. `saveDiscoveryCanvasNode` then passes it through to
 * `saveDiscoveryCanvasSections`, so re-clicking "Save" updates the same canvas row
 * rather than creating a duplicate.
 */
export function emitDiscoveryCanvasSaved(args: {
  canvasId: string;
  title: string;
  /** Optional override for the structured-data streamId. */
  streamId?: string;
}): void {
  useStructuredData({
    id: `canvas-saved-${args.canvasId}`,
    streamId: args.streamId ?? "canvas-saved",
    dataType: CANVAS_SAVED_DATA_TYPE,
    data: {
      canvasId: args.canvasId,
      title: args.title,
    },
  });
}
