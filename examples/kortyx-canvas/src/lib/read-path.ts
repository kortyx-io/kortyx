import type { CurrentDiscoveryCanvasContext } from "@/lib/runtime-context";

/**
 * Walks a canvas snapshot following a dot-delimited path. Returns the value
 * as a string when present, or `undefined` for missing intermediate keys.
 *
 * Used by `applyUpdatesNode` to inline current values into the LLM prompt
 * so it can preserve tone and length when rewriting a field. Pure function
 * — safe to import from tests.
 */
export function readDiscoveryCanvasPath(
  canvas: CurrentDiscoveryCanvasContext,
  path: string,
): string | undefined {
  const segments = path.split(".");
  let cursor: unknown = canvas;
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (typeof cursor === "string") return cursor;
  if (cursor == null) return undefined;
  return String(cursor);
}
