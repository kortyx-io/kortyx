import "server-only";

import { google } from "@kortyx/google";
import { useReason, useRuntimeContext } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import { serializeDiscoveryCanvasForPrompt } from "../../lib/serialize-canvas";
import { ensureUniqueKey } from "../../lib/unique-key";
import { loadPrompt } from "../../prompts/_registry";
import { type AddItemOp, addItemDraftSchema } from "../../schemas/canvas-ops";
import { emitStructuralOps } from "../../streaming/canvas-patches";
import {
  emitDiscoveryCanvasThinkingFinish,
  emitDiscoveryCanvasThinkingStart,
} from "../../streaming/canvas-thinking";

type AddItemInput = { userText?: string };
type AddItemParams = { temperature?: number };

const THINKING_STREAM_ID = "add-item-thinking";

/**
 * `add_item` branch. Picks the target section (LLM resolves title /
 * ordinal references) and drafts ONE new item with rationale to insert
 * under it. Emits an `addItem` op.
 */
export const addItemNode = async ({
  input,
  params,
}: {
  input: AddItemInput;
  params: AddItemParams;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const canvas = ctx.currentDiscoveryCanvas;
  if (!canvas) {
    throw new Error("addItemNode: no canvas on canvas");
  }
  const userText = (input?.userText ?? "").trim();
  const existingSectionKeys = Object.keys(canvas.sections ?? {});

  if (existingSectionKeys.length === 0) {
    return { data: { patches: [] } };
  }

  const { system, user } = loadPrompt("add-item", {
    canvasBlock: serializeDiscoveryCanvasForPrompt(canvas),
    userText: userText || "(empty message)",
  });

  emitDiscoveryCanvasThinkingStart({
    streamId: THINKING_STREAM_ID,
    phase: "update",
  });

  const result = await useReason({
    id: "add-item",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: addItemDraftSchema,
    responseFormat: { type: "json" },
    temperature: params.temperature ?? 0.5,
    emit: false,
  });

  const resolved = result.output;
  if (!resolved || !existingSectionKeys.includes(resolved.sectionKey)) {
    console.warn("[add-item] unresolved section", {
      key: resolved?.sectionKey,
    });
    emitDiscoveryCanvasThinkingFinish({
      streamId: THINKING_STREAM_ID,
      payload: { patches: [] },
    });
    return { data: { patches: [] } };
  }

  const section = canvas.sections?.[resolved.sectionKey];
  const existingItemKeys = Object.keys(section?.items ?? {});
  const op: AddItemOp = {
    op: "addItem",
    sectionKey: resolved.sectionKey,
    itemKey: ensureUniqueKey(resolved.itemKey, existingItemKeys),
    item: resolved.item,
    label: resolved.label,
    reason: resolved.reason,
  };

  emitStructuralOps({ streamId: THINKING_STREAM_ID, ops: [op] });
  emitDiscoveryCanvasThinkingFinish({
    streamId: THINKING_STREAM_ID,
    payload: { patches: [op] },
  });

  console.log("[add-item] done", {
    section: op.sectionKey,
    item: op.itemKey,
  });

  return { data: { patches: [op] } };
};
