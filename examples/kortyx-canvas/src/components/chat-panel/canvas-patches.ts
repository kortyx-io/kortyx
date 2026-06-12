import type { ContentPiece } from "@kortyx/react";
import { listPatchPayloadEntries } from "@/lib/patch-record-key";
import { CANVAS_PATCHES_DATA_TYPE } from "@/lib/protocol";
import type {
  DiscoveryCanvasOp,
  DiscoveryCanvasStoreMutators,
  PartialSetOp,
} from "@/types/chat-panel";

/**
 * Walks structured pieces with `dataType === "canvas.patches"` and dispatches
 * each op to the store. Two dispatch modes:
 *
 *   • `set` ops stream progressively — `path` lands first, then `value`
 *     text-deltas keep updating the same field for a typewriter effect.
 *     We track the last-written value per (streamId, patchKey) so identical
 *     re-renders don't re-dispatch.
 *
 *   • Structural ops (addSection / removeSection / addItem /
 *     removeItem) arrive atomically in a single final chunk and are
 *     applied exactly once per piece id.
 */
export function applyStreamingPatches({
  pieces,
  streamPieces,
  lastApplied,
  appliedStructuralOpPieceIds,
  store,
}: {
  pieces: ContentPiece[];
  streamPieces: ContentPiece[];
  lastApplied: Map<string, Map<string, string>>;
  appliedStructuralOpPieceIds: Set<string>;
  store: DiscoveryCanvasStoreMutators;
}): void {
  for (const piece of [...pieces, ...streamPieces]) {
    if (piece.type !== "structured") continue;
    if (piece.data.dataType !== CANVAS_PATCHES_DATA_TYPE) continue;
    const streamId = piece.data.streamId ?? piece.id;
    if (!streamId) continue;
    const entries = listPatchPayloadEntries(piece.data.data);
    if (entries.length === 0) continue;

    let appliedMap = lastApplied.get(streamId);
    if (!appliedMap) {
      appliedMap = new Map();
      lastApplied.set(streamId, appliedMap);
    }

    for (const { key, entry } of entries) {
      const op = entry as PartialSetOp & Partial<DiscoveryCanvasOp>;
      // Structural ops are atomic: only dispatch once per piece, when the
      // op has fully landed (the op type plus all required keys).
      if (op.op && op.op !== "set") {
        if (appliedStructuralOpPieceIds.has(`${piece.id}:${key}`)) continue;
        const applied = applyStructuralOp(op as DiscoveryCanvasOp, store);
        if (applied) {
          appliedStructuralOpPieceIds.add(`${piece.id}:${key}`);
        }
        continue;
      }
      // Set ops stream — the value text-delta grows over time.
      const path = typeof op.path === "string" ? op.path : "";
      if (path.length === 0) continue;
      const value = typeof op.value === "string" ? op.value : "";
      if (value.length === 0) continue;
      const previous = appliedMap.get(key);
      if (previous === value) continue;
      applySetOp({ path, value }, store);
      appliedMap.set(key, value);
    }
  }
}

/**
 * Atomic apply for non-`set` ops. Returns `true` when the op was fully
 * formed and dispatched; `false` when fields are still missing (caller will
 * retry on the next render).
 */
function applyStructuralOp(
  op: DiscoveryCanvasOp,
  store: DiscoveryCanvasStoreMutators,
): boolean {
  switch (op.op) {
    case "addSection":
      if (!op.sectionKey || !op.section) return false;
      store.addSection(op.sectionKey, op.section);
      return true;
    case "removeSection":
      if (!op.sectionKey) return false;
      store.removeSection(op.sectionKey);
      return true;
    case "addItem":
      if (!op.sectionKey || !op.itemKey || !op.item) return false;
      store.addItem(op.sectionKey, op.itemKey, op.item);
      return true;
    case "removeItem":
      if (!op.sectionKey || !op.itemKey) return false;
      store.removeItem(op.sectionKey, op.itemKey);
      return true;
    case "set":
      // set ops never go through this path
      return false;
  }
}

/**
 * Applies a single `{ path, value }` set-op onto the canvas store.
 * Unrecognized paths are logged.
 */
function applySetOp(
  patch: { path: string; value: string },
  store: DiscoveryCanvasStoreMutators,
): void {
  // Top-level config fields. The agent writes these by addressing the path
  // directly (no dot segments), so they are matched before the
  // `sections` traversal.
  if (patch.path === "title") {
    store.updateTitle(patch.value);
    return;
  }
  if (patch.path === "facilitator_style_id") {
    // The apply-updates prompt instructs the model to write the literal
    // 'null' string when the user wants to clear the selection.
    store.updateFacilitatorStyleId(patch.value === "null" ? null : patch.value);
    return;
  }
  if (patch.path === "canvas_mode") {
    const next = patch.value.toUpperCase();
    if (next === "DISCOVERY_WORKSHOP" || next === "EXECUTIVE_BRIEF") {
      store.updateCanvasMode(next);
    }
    return;
  }
  const segments = patch.path.split(".");
  if (segments[0] === "intro" && segments[1]) {
    const field = segments[1];
    if (field === "label" || field === "summary" || field === "item_text") {
      store.updateIntro({ [field]: patch.value });
      return;
    }
  }
  if (segments[0] !== "sections") {
    console.warn("[canvas-chat] unknown patch path", patch.path);
    return;
  }
  const sectionKey = segments[1];
  if (!sectionKey) return;
  const tail = segments.slice(2);
  if (tail.length === 1) {
    const field = tail[0];
    switch (field) {
      case "section_label":
        store.updateSection(sectionKey, { section_label: patch.value });
        return;
      case "section_summary":
        store.updateSection(sectionKey, {
          section_summary: patch.value,
        });
        return;
      case "section_rationale":
        store.updateSection(sectionKey, {
          section_rationale: patch.value,
        });
        return;
      default:
        console.warn("[canvas-chat] unknown section field", patch.path);
        return;
    }
  }
  if (tail[0] === "items" && tail[1] && tail[2]) {
    const itemKey = tail[1];
    const field = tail[2];
    if (field === "item_text") {
      store.updateItem(sectionKey, itemKey, {
        item_text: patch.value,
      });
      return;
    }
    if (field === "item_rationale") {
      store.updateItem(sectionKey, itemKey, {
        item_rationale: patch.value,
      });
      return;
    }
  }
  console.warn("[canvas-chat] unsupported patch path", patch.path);
}
