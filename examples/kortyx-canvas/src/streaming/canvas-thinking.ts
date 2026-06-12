// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx structured-data APIs are hook-shaped but execute during workflow streaming, not React rendering.
import "server-only";

import { useStructuredData } from "kortyx";
import { CANVAS_THINKING_DATA_TYPE } from "@/lib/protocol";

/**
 * Shared structured-data channel used purely as a UI marker so the chat
 * can render a "thinking" pill from the moment a long-running node starts
 * — independently of the model's own structured stream (which only starts
 * landing chunks after the first token).
 *
 * Two phases:
 * - `start`: emitted right before the LLM call. Drives the shimmer + live
 *   counter on the client.
 * - `finish`: emitted after the LLM call resolves. Freezes the counter at
 *   "Thought for Xs" and ships the per-phase payload (`patches` for the
 *   update flow, `canvas` for the create flow) so the collapsible body can
 *   show the model's rationale.
 *
 * The stream is identified by a stable `streamId` so both phases land on
 * the same `ContentPiece` on the client and produce a single pill — not
 * two.
 */

const SCHEMA_ID = "canvas-thinking";
const SCHEMA_VERSION = "1";

export type DiscoveryCanvasThinkingPhase = "create" | "update";

type StartArgs = {
  streamId: string;
  phase: DiscoveryCanvasThinkingPhase;
};

type FinishArgs = {
  streamId: string;
  /** Phase-specific payload rendered in the collapsible. */
  payload?: Record<string, unknown> | undefined;
};

export function emitDiscoveryCanvasThinkingStart({
  streamId,
  phase,
}: StartArgs): void {
  useStructuredData({
    id: `${streamId}:start-phase`,
    streamId,
    dataType: CANVAS_THINKING_DATA_TYPE,
    schemaId: SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    kind: "set",
    path: "phase",
    value: phase,
  });
  // Persist the start timestamp into the piece so elapsed time survives a
  // re-mount when the piece moves from `streamContentPieces` into the
  // finalized message history. The client uses this as the timer origin
  // for both the live counter and the final "Thought for Xs" label.
  useStructuredData({
    id: `${streamId}:start-time`,
    streamId,
    dataType: CANVAS_THINKING_DATA_TYPE,
    schemaId: SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    kind: "set",
    path: "startedAt",
    value: Date.now(),
  });
  useStructuredData({
    id: `${streamId}:start-status`,
    streamId,
    dataType: CANVAS_THINKING_DATA_TYPE,
    schemaId: SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    kind: "set",
    path: "status",
    value: "streaming",
  });
}

export function emitDiscoveryCanvasThinkingFinish({
  streamId,
  payload,
}: FinishArgs): void {
  if (payload) {
    for (const [path, value] of Object.entries(payload)) {
      useStructuredData({
        id: `${streamId}:finish-${path}`,
        streamId,
        dataType: CANVAS_THINKING_DATA_TYPE,
        schemaId: SCHEMA_ID,
        schemaVersion: SCHEMA_VERSION,
        kind: "set",
        path,
        value,
      });
    }
  }
  useStructuredData({
    id: `${streamId}:finish-time`,
    streamId,
    dataType: CANVAS_THINKING_DATA_TYPE,
    schemaId: SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    kind: "set",
    path: "finishedAt",
    value: Date.now(),
  });
  useStructuredData({
    id: `${streamId}:finish-status`,
    streamId,
    dataType: CANVAS_THINKING_DATA_TYPE,
    schemaId: SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    kind: "set",
    path: "status",
    value: "done",
  });
}
