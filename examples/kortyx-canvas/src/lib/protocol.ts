/**
 * Wire-protocol constants shared between the canvas-agent server
 * (kortyx nodes) and the client (chat panel, interrupt renderers).
 *
 * IMPORTANT: this file MUST stay free of `server-only` and any kortyx /
 * Node-only imports so the client can safely depend on it. It is the only
 * shared boundary between the two sides — nothing else in `server/` should
 * be imported by client code.
 */

/**
 * `dataType` values for kortyx `useStructuredData` chunks. The client
 * routes incoming structured-data pieces to UI components by switching on
 * these values.
 */
export const CANVAS_DRAFT_DATA_TYPE = "canvas.draft";
export const CANVAS_PATCHES_DATA_TYPE = "canvas.patches";
export const CANVAS_THINKING_DATA_TYPE = "canvas.thinking";
export const RESOLVED_ENTITY_DATA_TYPE = "resolved.entity";
/** Emitted by `describeBriefNode` after the markdown summary streams. */
export const BRIEF_PREVIEW_DATA_TYPE = "brief.preview";
/**
 * Emitted by `saveDiscoveryCanvasNode` after a successful persistence call. Carries
 * the canonical `canvasId` (and title) so the client can stash it onto the
 * canvas state — subsequent saves ship it back via `context.savedDiscoveryCanvasId`
 * and the node updates the same DB row instead of creating duplicates.
 */
export const CANVAS_SAVED_DATA_TYPE = "canvas.saved";

/**
 * `schemaId` values for kortyx `useInterrupt` requests. The client switches
 * on these to render the right picker / confirmation UI.
 */
export const PICK_BRIEF_INTERRUPT_ID = "pick-brief";
export const PICK_AGENT_INTERRUPT_ID = "pick-agent";
export const CONFIRM_REMOVAL_INTERRUPT_ID = "confirm-removal";
/**
 * Yes/no confirmation rendered at the top of the canvas-save workflow when
 * the user reached it via a chat prompt (e.g. "save the canvas") rather
 * than the canvas Save button. The button path sets
 * `ctx.saveConfirmed = true` and skips this interrupt entirely.
 */
export const CONFIRM_SAVE_INTERRUPT_ID = "confirm-save";

/** Workflow ids registered on the kortyx agent. */
export const WORKFLOW_IDS = {
  generalChat: "general-chat",
  canvasCreation: "canvas-creation",
  briefQuery: "brief-query",
  updateDiscoveryCanvas: "update-canvas",
  canvasSave: "canvas-save",
} as const;

export type WorkflowId = (typeof WORKFLOW_IDS)[keyof typeof WORKFLOW_IDS];

/**
 * Canonical user-message content the canvas Save button sends to trigger the
 * canvas-save workflow. The client switches its `workflowId` to
 * `WORKFLOW_IDS.canvasSave` for that one send, then resets it back to
 * `generalChat` when the resulting stream finishes — so this sentinel never
 * re-enters general-chat as a literal request. Lives in the shared protocol
 * so client and server stay in lock-step.
 */
export const SAVE_CANVAS_INTENT_MESSAGE = "Save this canvas";
