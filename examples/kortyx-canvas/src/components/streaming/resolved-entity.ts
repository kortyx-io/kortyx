import type { ContentPiece } from "@kortyx/react";
import { RESOLVED_ENTITY_DATA_TYPE } from "@/lib/protocol";

export type ResolvedEntityChunk =
  | { kind: "brief"; id: string; label: string }
  | { kind: "agent"; id: string; label: string };

/**
 * Extracts a `{ kind, id, label }` payload from a `resolved.entity` content
 * piece. Mirrors `server/streaming/resolved-entity.ts` — the server emits
 * these when a single brief/agent is auto-resolved without going through the
 * picker, and the client uses them to keep `resolvedIds` in sync.
 */
export function pickResolvedEntity(
  piece: ContentPiece,
): ResolvedEntityChunk | null {
  if (piece.type !== "structured") return null;
  if (piece.data.dataType !== RESOLVED_ENTITY_DATA_TYPE) return null;
  const data = piece.data.data;
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (
    (rec.kind === "brief" || rec.kind === "agent") &&
    typeof rec.id === "string" &&
    typeof rec.label === "string"
  ) {
    return { kind: rec.kind, id: rec.id, label: rec.label };
  }
  return null;
}

/**
 * Walks live stream pieces first (latest wins) then finalized pieces in
 * reverse order to find the most recent `resolved.entity` chunk. Returns
 * null when nothing has been resolved yet.
 */
export function findLatestResolvedEntity(
  finalizedPieces: ContentPiece[],
  streamPieces: ContentPiece[],
): ResolvedEntityChunk | null {
  for (const piece of streamPieces) {
    const data = pickResolvedEntity(piece);
    if (data) return data;
  }
  for (let i = finalizedPieces.length - 1; i >= 0; i -= 1) {
    const piece = finalizedPieces[i];
    if (!piece) continue;
    const data = pickResolvedEntity(piece);
    if (data) return data;
  }
  return null;
}
