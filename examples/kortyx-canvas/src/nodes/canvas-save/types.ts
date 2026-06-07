/**
 * Pure types shared across the canvas-save workflow (`confirm-save-node`,
 * `canvas-node`, `respond-to-save-node`, and the matching prompt
 * builder). Kept in its own file so the prompt layer can import them
 * without back-referencing a node module — see the folder-discipline
 * rules in `../../AGENTS.md`.
 */

/**
 * Why the save flow ended without persisting. Drives the `respond-to-save`
 * cancellation branch.
 *
 *   - `empty-canvas`             — nothing on the canvas to save.
 *   - `user-declined`            — user clicked Cancel on a normal save
 *                                  confirmation.
 *   - `update-fallback-declined` — user clicked Cancel on the confirmation
 *                                  that fired as a rescue from a vague
 *                                  "update the canvas" request. Responder
 *                                  pivots back to inviting a clarifying
 *                                  update target instead of saying
 *                                  "nothing saved".
 */
export type SaveCancellationReason =
  | "empty-canvas"
  | "user-declined"
  | "update-fallback-declined";

/**
 * How the save workflow was entered. Set on the shared runtime context by
 * the upstream node that initiated the handoff so `confirm-save-node` can
 * phrase its `useReason` message contextually and the cancel responder
 * can pick the right tone.
 *
 *   - `prompt`           — user explicitly asked to save in chat
 *                          (`canvas` intent on the classifier).
 *   - `update-fallback`  — `find-update-paths-node` couldn't pin down a
 *                          target and redirected here as a rescue.
 */
export type SaveTriggerSource = "prompt" | "update-fallback";

/**
 * Outcome from `canvas-node`. Forwarded as workflow data to the
 * responder, which renders one of three branches (`success`, `error`,
 * cancellation) via `build-respond-to-save-prompt`.
 */
export type SaveDiscoveryCanvasOutcome =
  | {
      success: true;
      canvasId: string;
      title: string;
      /**
       * True when the save updated an existing row (the canvas was bound
       * to `ctx.savedDiscoveryCanvasId`). False on the first save of a fresh canvas.
       * The responder uses this to phrase the confirmation correctly
       * (Updated vs Created).
       */
      isUpdate: boolean;
    }
  | {
      success: false;
      error: string;
    };
