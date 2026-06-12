import "server-only";

import { useRuntimeContext } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import {
  type SavedDiscoverySection,
  saveDiscoveryCanvasSections,
} from "@/services/demo-data";
import { canvasHasContent } from "../../lib/serialize-canvas";
import type { DiscoveryCanvasValidationResult } from "../../schemas/canvas-validation";
import { emitDiscoveryCanvasSaved } from "../../streaming";
import type { SaveDiscoveryCanvasOutcome } from "./types";

type SaveDiscoveryCanvasNodeInput = {
  validation?: DiscoveryCanvasValidationResult;
};

const DEMO_LANGUAGE = "en";

// Re-export so consumers that already import from this module (back-compat
// during refactor) keep working. New code should import from `./types`.
export type { SaveDiscoveryCanvasOutcome } from "./types";

/**
 * Persists the current canvas canvas into the example's in-memory store. The
 * canvas already streams every edit back to the agent in `context.currentDiscoveryCanvas`,
 * so this node treats that snapshot as the source of truth.
 */
export const saveDiscoveryCanvasNode = async ({
  input,
}: {
  input: SaveDiscoveryCanvasNodeInput;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  if (!ctx.tenantId) {
    throw new Error(
      "saveDiscoveryCanvasNode: missing tenantId in runtime context",
    );
  }
  // The save workflow only routes here when validation passed — but guard
  // defensively so a future graph edit can't accidentally bypass the gate.
  if (input?.validation && !input.validation.pass) {
    return {
      data: {
        outcome: {
          success: false,
          error: "Save attempted while validation was failing",
        } as SaveDiscoveryCanvasOutcome,
      },
    };
  }

  const canvas = ctx.currentDiscoveryCanvas;
  if (!canvasHasContent(canvas)) {
    return {
      data: {
        outcome: {
          success: false,
          error: "Canvas is empty — generate a canvas before saving",
        } as SaveDiscoveryCanvasOutcome,
      },
    };
  }

  const sections = buildSectionsFromDiscoveryCanvas(canvas);
  if (sections.length === 0) {
    return {
      data: {
        outcome: {
          success: false,
          error: "DiscoveryCanvas has no sections with items yet",
        } as SaveDiscoveryCanvasOutcome,
      },
    };
  }

  const title =
    typeof canvas.title === "string" && canvas.title.trim().length > 0
      ? canvas.title.trim()
      : "Untitled canvas";

  const canvasMode = canvas.canvas_mode ?? undefined;

  // First save in this chat session → undefined → insert a new row.
  // Subsequent saves → reuse the id the client received from
  // `emitDiscoveryCanvasSaved` and shipped back via `context.savedDiscoveryCanvasId` → UPDATE
  // the same row.
  const existingDiscoveryCanvasId = ctx.savedDiscoveryCanvasId;

  const result = await saveDiscoveryCanvasSections(
    existingDiscoveryCanvasId,
    sections,
    DEMO_LANGUAGE,
    {
      title,
      ...(canvasMode && { canvasMode }),
    },
  );

  if (!result.success || !result.canvasId) {
    console.warn("[canvas] save failed", { error: result.error });
    return {
      data: {
        outcome: {
          success: false,
          error: result.error ?? "Failed to save canvas",
        } as SaveDiscoveryCanvasOutcome,
      },
    };
  }

  console.log("[canvas] saved", {
    canvasId: result.canvasId,
    existingDiscoveryCanvasId,
    mode: existingDiscoveryCanvasId ? "update" : "create",
    sectionsCount: sections.length,
    canvasMode,
  });

  // Tell the client which row this canvas is bound to. The chat panel
  // stashes it per-chat and ships it back on the next save so we update
  // rather than duplicate.
  emitDiscoveryCanvasSaved({ canvasId: result.canvasId, title });

  return {
    data: {
      outcome: {
        success: true,
        canvasId: result.canvasId,
        title,
        isUpdate: Boolean(existingDiscoveryCanvasId),
      } as SaveDiscoveryCanvasOutcome,
    },
  };
};

const AI_ORIGIN = "ai" as const;

/**
 * Convert the canvas `DiscoveryCanvasResponse` shape into the example
 * `SavedDiscoverySection[]` shape expected by `saveDiscoveryCanvasSections`. Index 0 is the intro
 * section (stable id `"intro"` / `"intro-1"`), the rest get sequential
 * temp ids matching `generateTemporaryIds`'s convention.
 *
 * The agent flow only produces the intro item text, so we stamp generic
 * English fillers here to keep the save payload valid.
 */
function buildSectionsFromDiscoveryCanvas(
  canvas: NonNullable<CanvasAgentContext["currentDiscoveryCanvas"]>,
): SavedDiscoverySection[] {
  const sections: SavedDiscoverySection[] = [];

  const introText = canvas.intro?.item_text?.trim() ?? "";
  if (introText.length > 0) {
    sections.push({
      id: "intro",
      title: canvas.intro?.label?.trim() || "Product brief",
      description:
        canvas.intro?.summary?.trim() ||
        "Product idea, target user, and intended outcome",
      rationale: "Sets shared context before the discovery sections",
      origin: AI_ORIGIN,
      items: [
        {
          id: "intro-1",
          text: introText,
          rationale: "Opening item to set context",
          origin: AI_ORIGIN,
        },
      ],
    });
  }

  const entries = Object.entries(canvas.sections ?? {});
  entries.forEach(([, section], cIndex) => {
    const items = Object.entries(section.items ?? {});
    if (items.length === 0) return;
    const idx = cIndex + 1;
    sections.push({
      id: `temp-${idx}`,
      title: section.section_label,
      description: section.section_summary,
      rationale: section.section_rationale,
      origin: AI_ORIGIN,
      items: items.map(([, q], qIndex) => ({
        id: `temp-${idx}-${qIndex + 1}`,
        text: q.item_text,
        rationale: q.item_rationale,
        origin: AI_ORIGIN,
      })),
    });
  });

  return sections;
}
