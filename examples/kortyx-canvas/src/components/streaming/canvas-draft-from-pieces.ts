import type { ContentPiece } from "@kortyx/react";
import { listPatchPayloadEntries } from "@/lib/patch-record-key";
import { CANVAS_PATCHES_DATA_TYPE } from "@/lib/protocol";
import type { DiscoveryCanvasDraft } from "@/providers/canvas-store";
import type { CanvasMode } from "@/schemas/discovery-canvas";
import type { DiscoveryCanvasOp, PartialSetOp } from "@/types/chat-panel";
import { pickDiscoveryCanvasData } from "./canvas-data";

function cloneDraft(draft: DiscoveryCanvasDraft): DiscoveryCanvasDraft {
  return JSON.parse(JSON.stringify(draft)) as DiscoveryCanvasDraft;
}

export function buildDiscoveryCanvasDraftFromPieces(
  pieces: ContentPiece[],
): DiscoveryCanvasDraft {
  let draft: DiscoveryCanvasDraft = {};
  let hasBaseDraft = false;

  for (const piece of pieces) {
    const nextDraft = pickDiscoveryCanvasData(piece);
    if (nextDraft) {
      draft = cloneDraft(nextDraft);
      hasBaseDraft = true;
      continue;
    }

    if (!hasBaseDraft) continue;
    if (piece.type !== "structured") continue;
    if (piece.data.dataType !== CANVAS_PATCHES_DATA_TYPE) continue;

    const entries = listPatchPayloadEntries(piece.data.data);
    for (const { entry } of entries) {
      const op = entry as PartialSetOp & Partial<DiscoveryCanvasOp>;
      draft = applyPatchToDraft(draft, op);
    }
  }

  return draft;
}

function applyPatchToDraft(
  draft: DiscoveryCanvasDraft,
  op: PartialSetOp & Partial<DiscoveryCanvasOp>,
): DiscoveryCanvasDraft {
  if (op.op && op.op !== "set") {
    return applyStructuralOp(draft, op as DiscoveryCanvasOp);
  }

  if (typeof op.path !== "string" || typeof op.value !== "string") {
    return draft;
  }
  if (!op.path || !op.value) return draft;
  return applySetOp(draft, { path: op.path, value: op.value });
}

function applyStructuralOp(
  draft: DiscoveryCanvasDraft,
  op: DiscoveryCanvasOp,
): DiscoveryCanvasDraft {
  const sections = draft.sections ?? {};
  switch (op.op) {
    case "addSection":
      if (!op.sectionKey || !op.section || sections[op.sectionKey]) {
        return draft;
      }
      return {
        ...draft,
        sections: { ...sections, [op.sectionKey]: op.section },
      };
    case "removeSection": {
      if (!op.sectionKey || !sections[op.sectionKey]) return draft;
      const { [op.sectionKey]: _removed, ...rest } = sections;
      return { ...draft, sections: rest };
    }
    case "addItem": {
      if (!op.sectionKey || !op.itemKey || !op.item) return draft;
      const section = sections[op.sectionKey];
      if (!section || section.items[op.itemKey]) return draft;
      return {
        ...draft,
        sections: {
          ...sections,
          [op.sectionKey]: {
            ...section,
            items: { ...section.items, [op.itemKey]: op.item },
          },
        },
      };
    }
    case "removeItem": {
      if (!op.sectionKey || !op.itemKey) return draft;
      const section = sections[op.sectionKey];
      if (!section || !section.items[op.itemKey]) return draft;
      const { [op.itemKey]: _removed, ...restItems } = section.items;
      return {
        ...draft,
        sections: {
          ...sections,
          [op.sectionKey]: { ...section, items: restItems },
        },
      };
    }
    case "set":
      return draft;
  }
}

function applySetOp(
  draft: DiscoveryCanvasDraft,
  patch: { path: string; value: string },
): DiscoveryCanvasDraft {
  if (patch.path === "title") {
    return { ...draft, title: patch.value };
  }
  if (patch.path === "facilitator_style_id") {
    return {
      ...draft,
      facilitator_style_id: patch.value === "null" ? null : patch.value,
    };
  }
  if (patch.path === "canvas_mode") {
    const next = patch.value.toUpperCase();
    if (next === "DISCOVERY_WORKSHOP" || next === "EXECUTIVE_BRIEF") {
      return { ...draft, canvas_mode: next as CanvasMode };
    }
    return draft;
  }

  const segments = patch.path.split(".");
  if (segments[0] === "intro" && segments[1]) {
    const field = segments[1];
    if (field === "label" || field === "summary" || field === "item_text") {
      return {
        ...draft,
        intro: {
          label: draft.intro?.label ?? "",
          summary: draft.intro?.summary ?? "",
          item_text: draft.intro?.item_text ?? "",
          [field]: patch.value,
        },
      };
    }
  }

  if (segments[0] !== "sections") return draft;
  const sectionKey = segments[1];
  if (!sectionKey) return draft;
  const sections = draft.sections ?? {};
  const section = sections[sectionKey];
  if (!section) return draft;
  const tail = segments.slice(2);

  if (tail.length === 1) {
    const field = tail[0];
    if (
      field === "section_label" ||
      field === "section_summary" ||
      field === "section_rationale"
    ) {
      return {
        ...draft,
        sections: {
          ...sections,
          [sectionKey]: { ...section, [field]: patch.value },
        },
      };
    }
  }

  if (tail[0] === "items" && tail[1] && tail[2]) {
    const itemKey = tail[1];
    const field = tail[2];
    const item = section.items[itemKey];
    if (!item) return draft;
    if (field === "item_text" || field === "item_rationale") {
      return {
        ...draft,
        sections: {
          ...sections,
          [sectionKey]: {
            ...section,
            items: {
              ...section.items,
              [itemKey]: { ...item, [field]: patch.value },
            },
          },
        },
      };
    }
  }

  return draft;
}
