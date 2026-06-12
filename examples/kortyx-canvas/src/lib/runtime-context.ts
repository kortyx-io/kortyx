/**
 * Runtime context carried with every chat request to the canvas-agent.
 *
 * - Server-derived fields (`tenantId`, `userId`, `history`) are populated
 *   inside the API route and never trusted from the client.
 * - Client-sent fields (`currentDiscoveryCanvas`, `agentId`, …)
 *   must be treated as untrusted inputs by the nodes that consume them.
 * - In-flight bookkeeping fields (`saveTriggerSource`) are mutated by
 *   nodes mid-request and are explicitly NOT exposed in the client type.
 */

import type { SaveTriggerSource } from "@/nodes/canvas-save/types";
import type { DiscoveryCanvasResponse } from "@/schemas/discovery-canvas";

/**
 * The current canvas state the client ships back on every turn. Fields are
 * optional because the user can edit a partial canvas mid-conversation.
 */
export type CurrentDiscoveryCanvasContext = Partial<DiscoveryCanvasResponse>;

/**
 * Lightweight chat message exposed to nodes via `useRuntimeContext`. Mirrors
 * Kortyx's `ChatMessage` but defined locally to insulate node code from
 * upstream type churn (Kortyx puts the full priorMessages array on
 * `runtime`, not `config.context`, so we can't get it via the hook — the
 * route forwards a trimmed copy through `context.history` instead).
 */
export type ChatHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type CanvasAgentContext = {
  tenantId: string;
  /** Server-derived demo user id. Not trusted from the client. */
  userId?: string;
  agentId?: string;
  /** Display label for `agentId`, sent by the client to avoid a refetch. */
  agentLabel?: string;
  briefId?: string;
  /** Display label for `briefId`, sent by the client to avoid a refetch. */
  briefLabel?: string;
  /** Latest snapshot of the canvas the user is editing, sent by the client. */
  currentDiscoveryCanvas?: CurrentDiscoveryCanvasContext;
  /**
   * Id of the DB canvas row previously persisted from this canvas, sent by
   * the client. When present, `saveDiscoveryCanvasNode` calls `saveDiscoveryCanvasSections`
   * with this id so re-saves UPDATE the existing row instead of inserting
   * a duplicate. Cleared on chat reset / new chat.
   */
  savedDiscoveryCanvasId?: string;
  /**
   * Trimmed conversation history (oldest → newest), excluding the current
   * user turn. Already filtered to drop interrupt-only assistant messages
   * and their UUID-style user replies.
   */
  history?: ChatHistoryMessage[];
  /**
   * Set to `true` by the canvas transport ONLY when the user clicked
   * the canvas Save button (i.e. the chat sent the request with
   * `workflowId: canvas-save`). `confirmSaveNode` short-circuits the
   * Save/Cancel interrupt when this is true — the button click already
   * counts as explicit consent. Prompt-driven saves leave it undefined so
   * the workflow asks for confirmation before persisting.
   */
  saveConfirmed?: boolean;
  /**
   * In-flight bookkeeping (mutated by upstream nodes, read by
   * `confirmSaveNode` and `respondToSaveNode`) — NEVER sent by the client.
   * Set to `"update-fallback"` by `findUpdatePathsNode` when it bailed
   * out with no targets and routed to the save workflow as a "did you
   * just mean save?" rescue. Lets the confirm-save prompt and the
   * cancellation responder reference the original update intent so the
   * conversation doesn't feel disjointed.
   */
  saveTriggerSource?: SaveTriggerSource;
};

/**
 * Shape the client is allowed to send inside the chat transport `context`
 * body. Explicitly enumerated (not `Omit`) so adding a server-internal
 * field to `CanvasAgentContext` doesn't accidentally make it
 * client-settable. The route handler merges these with server-derived
 * fields (`tenantId`, `userId`, `history`) before forwarding to kortyx.
 *
 * Notably excluded:
 *   - `tenantId`, `userId`, `history`     — server-derived from session/body.
 *   - `saveTriggerSource`                 — server-internal bookkeeping.
 */
export type CanvasAgentClientContext = {
  agentId?: string;
  agentLabel?: string;
  briefId?: string;
  briefLabel?: string;
  currentDiscoveryCanvas?: CurrentDiscoveryCanvasContext;
  savedDiscoveryCanvasId?: string;
  saveConfirmed?: boolean;
};
