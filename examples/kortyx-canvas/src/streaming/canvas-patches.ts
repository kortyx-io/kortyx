// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx structured-data APIs are hook-shaped but execute during workflow streaming, not React rendering.
import "server-only";

import { useStructuredData } from "kortyx";
import { patchesRecordFromOps } from "@/lib/patch-record-key";
import { CANVAS_PATCHES_DATA_TYPE } from "@/lib/protocol";
import type { DiscoveryCanvasOp } from "@/schemas/canvas-ops";

const SCHEMA_ID = "canvas-patches";
const SCHEMA_VERSION = "3";

/**
 * Atomic emit for structural ops (add/remove). Unlike the streaming
 * `apply-updates` node — which lets `useReason` push partial patches via
 * `structured.fields` — these ops have no value to type out, so a single
 * final `canvas.patches` chunk is enough for the client applier to pick
 * them up.
 *
 * IMPORTANT: We deliberately do NOT reuse the thinking-pill streamId here.
 * Kortyx marks a structured stream as completed once it receives a
 * `kind: "final"` chunk and rejects any further writes on the same
 * streamId. The thinking marker stream is still active (we call
 * `emitDiscoveryCanvasThinkingFinish` after this), so the patches stream must use a
 * distinct streamId. We derive one from the marker streamId for traceable
 * logs, with a `-patches` suffix.
 *
 * Caller is responsible for the thinking-pill marker (start before the
 * LLM call, finish after this emit).
 */
export function emitStructuralOps(args: {
  /** Thinking-pill marker streamId — used only as a stable name prefix. */
  streamId: string;
  ops: DiscoveryCanvasOp[];
}): void {
  if (args.ops.length === 0) return;
  const patchesStreamId = `${args.streamId}-patches`;
  useStructuredData({
    id: `${patchesStreamId}:final`,
    streamId: patchesStreamId,
    dataType: CANVAS_PATCHES_DATA_TYPE,
    schemaId: SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    kind: "final",
    data: { patches: patchesRecordFromOps(args.ops) },
  });
}

/**
 * Shared metadata for the `useReason({ structured: ... })` config used by
 * the progressive update branch (`applyUpdatesNode`) and the canvas-creation
 * node. Centralised here so the data-type / schema-id / schema-version
 * stay aligned with the atomic emit above.
 */
export const CANVAS_PATCHES_STREAM_META = {
  dataType: CANVAS_PATCHES_DATA_TYPE,
  schemaId: SCHEMA_ID,
  schemaVersion: SCHEMA_VERSION,
} as const;
