import "server-only";

import { google } from "@kortyx/google";
import { useReason, useRuntimeContext } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import { askConfirmRemovals } from "../../interrupts/confirm-removal";
import { toRemoveSectionTargetId } from "../../lib/removal-target-id";
import { serializeDiscoveryCanvasForPrompt } from "../../lib/serialize-canvas";
import { loadPrompt } from "../../prompts/_registry";
import {
  type RemoveSectionOp,
  removeSectionsResolveSchema,
} from "../../schemas/canvas-ops";
import { emitStructuralOps } from "../../streaming/canvas-patches";

type RemoveSectionInput = { userText?: string };
type RemoveSectionParams = { temperature?: number };

/**
 * `remove_section` branch.
 *
 * Silent LLM resolves every matching section, then one interrupt confirms
 * the batch: yes/no for a single target, multi-choice when several are
 * proposed. Only approved targets are mutated on the canvas.
 */
export const removeSectionNode = async ({
  input,
  params,
}: {
  input: RemoveSectionInput;
  params: RemoveSectionParams;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const canvas = ctx.currentDiscoveryCanvas;
  if (!canvas) {
    throw new Error("removeSectionNode: no canvas on canvas");
  }
  const userText = (input?.userText ?? "").trim();
  const existingKeys = Object.keys(canvas.sections ?? {});

  if (existingKeys.length === 0) {
    return { data: { patches: [] } };
  }

  const { system, user } = loadPrompt("remove-section", {
    existingKeysBlock: existingKeys.join(", "),
    canvasBlock: serializeDiscoveryCanvasForPrompt(canvas),
    userText: userText || "(empty message)",
  });

  const result = await useReason({
    id: "remove-section-resolve",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: removeSectionsResolveSchema,
    responseFormat: { type: "json" },
    temperature: params.temperature ?? 0.2,
    emit: false,
  });

  const proposed = (result.output?.sections ?? []).filter((target) =>
    existingKeys.includes(target.sectionKey),
  );

  if (proposed.length === 0) {
    console.warn("[remove-section] no valid targets resolved", {
      existingKeys,
    });
    return { data: { patches: [] } };
  }

  const confirmQuestion =
    proposed.length === 1
      ? `Remove the section ${proposed[0]?.label ?? "this section"}?`
      : "Select which sections to remove:";

  const selectedIds = await askConfirmRemovals({
    id: "remove-section-confirm",
    question: confirmQuestion,
    targets: proposed.map((target) => ({
      id: toRemoveSectionTargetId(target.sectionKey),
      label: target.label,
    })),
  });

  if (selectedIds.length === 0) {
    console.log("[remove-section] cancelled by user", {
      proposed: proposed.length,
    });
    return {
      data: {
        patches: [],
        cancelled: true,
        cancelledLabel:
          proposed.length === 1
            ? (proposed[0]?.label ?? "that section")
            : "those sections",
      },
    };
  }

  const selected = new Set(selectedIds);
  const ops: RemoveSectionOp[] = [];
  for (const target of proposed) {
    const id = toRemoveSectionTargetId(target.sectionKey);
    if (!selected.has(id)) continue;
    ops.push({
      op: "removeSection",
      sectionKey: target.sectionKey,
      label: target.label,
      reason: target.reason,
    });
  }

  if (ops.length === 0) {
    return { data: { patches: [] } };
  }

  emitStructuralOps({ streamId: "remove-section", ops });

  console.log("[remove-section] done", {
    proposed: proposed.length,
    removed: ops.length,
    keys: ops.map((op) => op.sectionKey),
  });

  return { data: { patches: ops } };
};
