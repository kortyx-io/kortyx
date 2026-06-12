import "server-only";

import { google } from "@kortyx/google";
import { useReason, useRuntimeContext } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import { serializeDiscoveryCanvasForPrompt } from "../../lib/serialize-canvas";
import { ensureUniqueKey } from "../../lib/unique-key";
import { loadPrompt } from "../../prompts/_registry";
import {
  type AddSectionOp,
  addSectionDraftSchema,
} from "../../schemas/canvas-ops";
import { emitStructuralOps } from "../../streaming/canvas-patches";
import {
  emitDiscoveryCanvasThinkingFinish,
  emitDiscoveryCanvasThinkingStart,
} from "../../streaming/canvas-thinking";

type AddSectionInput = { userText?: string };
type AddSectionParams = { temperature?: number };

const THINKING_STREAM_ID = "add-section-thinking";

/**
 * `add_section` branch. Drafts a full new section (label, explanation,
 * rationale, 1-3 items) and emits a single `addSection`
 * op for the client to apply onto the canvas.
 *
 * One node, one LLM call, one structural-op emit — no progressive
 * streaming because adding a section is atomic (it can't appear
 * partially).
 */
export const addSectionNode = async ({
  input,
  params,
}: {
  input: AddSectionInput;
  params: AddSectionParams;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const canvas = ctx.currentDiscoveryCanvas;
  if (!canvas) {
    throw new Error("addSectionNode: no canvas on canvas");
  }
  const userText = (input?.userText ?? "").trim();
  const existingKeys = Object.keys(canvas.sections ?? {});

  const { system, user } = loadPrompt("add-section", {
    existingKeysBlock:
      existingKeys.length === 0 ? "(none)" : existingKeys.join(", "),
    canvasBlock: serializeDiscoveryCanvasForPrompt(canvas),
    userText: userText || "(empty message)",
  });

  emitDiscoveryCanvasThinkingStart({
    streamId: THINKING_STREAM_ID,
    phase: "update",
  });

  const result = await useReason({
    id: "add-section",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: addSectionDraftSchema,
    responseFormat: { type: "json" },
    temperature: params.temperature ?? 0.5,
    emit: false,
  });

  if (!result.output) {
    emitDiscoveryCanvasThinkingFinish({
      streamId: THINKING_STREAM_ID,
      payload: { patches: [] },
    });
    return { data: { patches: [] } };
  }

  const op: AddSectionOp = {
    op: "addSection",
    sectionKey: ensureUniqueKey(result.output.sectionKey, existingKeys),
    section: result.output.section,
    label: result.output.label,
    reason: result.output.reason,
  };

  emitStructuralOps({ streamId: THINKING_STREAM_ID, ops: [op] });
  emitDiscoveryCanvasThinkingFinish({
    streamId: THINKING_STREAM_ID,
    payload: { patches: [op] },
  });

  console.log("[add-section] done", {
    key: op.sectionKey,
    itemCount: Object.keys(op.section.items).length,
  });

  return { data: { patches: [op] } };
};
