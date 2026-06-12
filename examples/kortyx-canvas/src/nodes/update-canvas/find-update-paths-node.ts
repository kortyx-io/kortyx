import "server-only";

import { google } from "@kortyx/google";
import { useReason, useRuntimeContext } from "kortyx";
import { WORKFLOW_IDS } from "@/lib/protocol";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import {
  extractUserText,
  type ForwardableInput,
} from "../../lib/extract-user-text";
import {
  canvasHasContent,
  serializeDiscoveryCanvasForPrompt,
} from "../../lib/serialize-canvas";
import { serializeHistoryForPrompt } from "../../lib/serialize-history";
import { loadPrompt } from "../../prompts/_registry";
import { updateTargetsSchema } from "../../schemas/canvas-ops";

/**
 * First content step of the update-canvas workflow's `update_field` branch.
 * Reads the user's request plus the current canvas snapshot from runtime
 * context and extracts a list of concrete `{ path, instruction, label }`
 * updates to apply.
 *
 * A single user message may request multiple atomic edits — each becomes
 * one entry. Ordinal references ("section 2 item 1") are resolved
 * against the canvas's insertion order, which is shown in the serialized
 * prompt.
 *
 * Fallback: when the LLM can't pin down any target ("update the canvas",
 * "make it better"), we treat that as the user wanting to commit the
 * current canvas state and hand off to the canvas save workflow. The save
 * flow will fire its Save/Cancel interrupt (because `ctx.saveConfirmed`
 * is undefined on this path), so the user still gets a confirmation —
 * but the system makes a useful forward move instead of asking them to
 * rephrase from scratch.
 */
export const findUpdatePathsNode = async ({
  input,
}: {
  input: ForwardableInput;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const canvas = ctx.currentDiscoveryCanvas;
  if (!canvasHasContent(canvas)) {
    throw new Error(
      "findUpdatePathsNode: no canvas on canvas — nothing to update",
    );
  }

  const userText = extractUserText(input);
  const { system, user } = loadPrompt("find-update-paths", {
    canvasBlock: serializeDiscoveryCanvasForPrompt(canvas),
    historyBlock: serializeHistoryForPrompt(ctx.history ?? []),
    userText: userText || "(empty message)",
  });

  const result = await useReason({
    id: "find-update-paths",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: updateTargetsSchema,
    responseFormat: { type: "json" },
    emit: false,
  });

  const updates = result.output?.updates ?? [];

  console.log("[find-update-paths] done", {
    userText,
    updateCount: updates.length,
    paths: updates.map((u) => u.path),
  });

  if (updates.length === 0) {
    console.log(
      "[find-update-paths] no targets — redirecting to canvas-save (with confirm)",
    );
    // Flag the redirect on the shared context so confirm-save can phrase
    // the item as a rescue ("I couldn't pin down what to change…")
    // and the cancel responder can invite a clarifying retry instead of
    // a generic "saved nothing" message.
    ctx.saveTriggerSource = "update-fallback";
    // CRITICAL: `transitionTo` alone does NOT preempt downstream edges in
    // kortyx — the current workflow still runs to `__end__` before the
    // handoff fires. Without a `condition`, the unconditional
    // `findUpdatePaths → applyUpdates → summarizeUpdates` chain would run
    // and emit a stale "I couldn't tell which part…" message right
    // before the new save-confirm interrupt. We return a `redirect`
    // condition + transitionTo so the workflow can route us straight to
    // `__end__` (see workflow edges).
    return {
      condition: "redirect",
      transitionTo: WORKFLOW_IDS.canvasSave,
    };
  }

  return { condition: "ok", data: { updates } };
};
