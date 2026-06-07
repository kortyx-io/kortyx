import "server-only";

import { defineWorkflow } from "kortyx";
import { WORKFLOW_IDS } from "@/lib/protocol";
import { confirmSaveNode } from "../nodes/canvas-save/confirm-save-node";
import { respondToSaveNode } from "../nodes/canvas-save/respond-to-save-node";
import { saveDiscoveryCanvasNode } from "../nodes/canvas-save/save-canvas-node";
import { validateDiscoveryCanvasContentNode } from "../nodes/shared/validate-canvas-content-node";

/**
 * Hard-gate save flow. Entered from two paths:
 *
 *   - canvas Save button → `ctx.saveConfirmed = true` → `confirmSave`
 *     short-circuits and we go straight to validation.
 *   - chat prompt like "save the canvas" → general-chat node routes here
 *     via `transitionTo` → `confirmSave` raises a Save/Cancel interrupt
 *     before any persistence call.
 *
 * Steps:
 *
 *   1. `confirmSave`   — gate (see above). Branches `confirmed` →
 *      `validateDiscoveryCanvas`, `cancelled` → `respondToSave` with a cancel
 *      payload.
 *   2. `validateDiscoveryCanvas` — policy audit before persistence. When
 *      violations are present, route directly to the responder so no save
 *      call is made.
 *   3. `saveDiscoveryCanvas`     — persists the current canvas. The outcome
 *      (canvasId on success, error string on failure) is forwarded to the
 *      next node.
 *   4. `respondToSave` — useReason streams a chat message explaining the
 *      outcome. Four branches: success, validation block, save error,
 *      cancellation.
 */
export const canvasSaveWorkflow = defineWorkflow({
  id: WORKFLOW_IDS.canvasSave,
  version: "1.4.0",
  description:
    "Confirm intent (when reached via chat prompt), validate the canvas against policy, persist it when clean, and reply conversationally with the outcome.",
  nodes: {
    confirmSave: {
      run: confirmSaveNode,
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    validateDiscoveryCanvas: {
      run: validateDiscoveryCanvasContentNode,
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    saveDiscoveryCanvas: {
      run: saveDiscoveryCanvasNode,
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    respondToSave: {
      run: respondToSaveNode,
      params: { temperature: 0.4 },
      behavior: { onError: { mode: "emit-and-stop" } },
    },
  },
  edges: [
    ["__start__", "confirmSave"],
    ["confirmSave", "validateDiscoveryCanvas", { when: "confirmed" }],
    // User declined the Save/Cancel interrupt (or canvas was empty); skip
    // validation + persistence and let the responder acknowledge.
    ["confirmSave", "respondToSave", { when: "cancelled" }],
    // Block the save call when content was flagged; the responder still
    // runs so the user gets a conversational explanation.
    ["validateDiscoveryCanvas", "respondToSave", { when: "blocked" }],
    ["validateDiscoveryCanvas", "saveDiscoveryCanvas", { when: "ok" }],
    ["saveDiscoveryCanvas", "respondToSave"],
    ["respondToSave", "__end__"],
  ],
});
