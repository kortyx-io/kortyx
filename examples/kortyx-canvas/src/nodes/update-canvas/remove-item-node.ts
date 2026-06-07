import "server-only";

import { google } from "@kortyx/google";
import { useReason, useRuntimeContext } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import { askConfirmRemovals } from "../../interrupts/confirm-removal";
import {
  parseRemoveItemTargetId,
  toRemoveItemTargetId,
} from "../../lib/removal-target-id";
import { serializeDiscoveryCanvasForPrompt } from "../../lib/serialize-canvas";
import { loadPrompt } from "../../prompts/_registry";
import {
  type RemoveItemOp,
  removeItemsResolveSchema,
} from "../../schemas/canvas-ops";
import { emitStructuralOps } from "../../streaming/canvas-patches";

type RemoveItemInput = { userText?: string };
type RemoveItemParams = { temperature?: number };

/**
 * `remove_item` branch.
 *
 * Silent LLM resolves every matching item, then one interrupt confirms
 * the batch: yes/no for a single target, multi-choice when several are
 * proposed. Only approved targets are mutated on the canvas.
 */
export const removeItemNode = async ({
  input,
  params,
}: {
  input: RemoveItemInput;
  params: RemoveItemParams;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const canvas = ctx.currentDiscoveryCanvas;
  if (!canvas) {
    throw new Error("removeItemNode: no canvas on canvas");
  }
  const userText = (input?.userText ?? "").trim();

  const { system, user } = loadPrompt("remove-item", {
    canvasBlock: serializeDiscoveryCanvasForPrompt(canvas),
    userText: userText || "(empty message)",
  });

  const result = await useReason({
    id: "remove-item-resolve",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: removeItemsResolveSchema,
    responseFormat: { type: "json" },
    temperature: params.temperature ?? 0.2,
    emit: false,
  });

  const proposed = (result.output?.items ?? []).filter((target) => {
    const section = canvas.sections?.[target.sectionKey];
    return !!section?.items?.[target.itemKey];
  });

  if (proposed.length === 0) {
    console.warn("[remove-item] no valid targets resolved");
    return { data: { patches: [] } };
  }

  const confirmQuestion =
    proposed.length === 1
      ? `Remove ${proposed[0]?.label ?? "this item"}?`
      : "Select which items to remove:";

  const selectedIds = await askConfirmRemovals({
    id: "remove-item-confirm",
    question: confirmQuestion,
    targets: proposed.map((target) => ({
      id: toRemoveItemTargetId(target.sectionKey, target.itemKey),
      label: target.label,
    })),
  });

  if (selectedIds.length === 0) {
    console.log("[remove-item] cancelled by user", {
      proposed: proposed.length,
    });
    return {
      data: {
        patches: [],
        cancelled: true,
        cancelledLabel:
          proposed.length === 1
            ? (proposed[0]?.label ?? "that item")
            : "those items",
      },
    };
  }

  const selected = new Set(selectedIds);
  const ops: RemoveItemOp[] = [];
  for (const target of proposed) {
    const id = toRemoveItemTargetId(target.sectionKey, target.itemKey);
    if (!selected.has(id)) continue;
    if (!parseRemoveItemTargetId(id)) continue;
    ops.push({
      op: "removeItem",
      sectionKey: target.sectionKey,
      itemKey: target.itemKey,
      label: target.label,
      reason: target.reason,
    });
  }

  if (ops.length === 0) {
    return { data: { patches: [] } };
  }

  emitStructuralOps({ streamId: "remove-item", ops });

  console.log("[remove-item] done", {
    proposed: proposed.length,
    removed: ops.length,
    items: ops.map((op) => `${op.sectionKey}.${op.itemKey}`),
  });

  return { data: { patches: ops } };
};
