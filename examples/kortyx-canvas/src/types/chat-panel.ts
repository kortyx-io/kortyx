import type { useChat } from "@kortyx/react";
import type { DiscoveryCanvasDraft } from "@/providers/canvas-store";
import type { CanvasMode, Item, Section } from "@/schemas/discovery-canvas";

/**
 * Mirrors the server-side `DiscoveryCanvasOp` discriminated union (see
 * `server/schemas/canvas-ops.ts`). We re-declare it here instead of
 * importing because that file is `server-only`. Keep in sync.
 *
 * Set ops stream progressively; structural ops (add/remove) arrive as a
 * single final chunk with all required fields already present.
 */
export type DiscoveryCanvasOp =
  | { op: "set"; path: string; value: string; label?: string; reason?: string }
  | {
      op: "addSection";
      sectionKey: string;
      section: Section;
      label?: string;
      reason?: string;
    }
  | {
      op: "removeSection";
      sectionKey: string;
      label?: string;
      reason?: string;
    }
  | {
      op: "addItem";
      sectionKey: string;
      itemKey: string;
      item: Item;
      label?: string;
      reason?: string;
    }
  | {
      op: "removeItem";
      sectionKey: string;
      itemKey: string;
      label?: string;
      reason?: string;
    };

/** Subset shape used while a set-op is still streaming (value text-delta). */
export type PartialSetOp = {
  op?: "set";
  path?: string;
  value?: string;
  label?: string;
};

/**
 * Server expects this shape under `context.currentDiscoveryCanvas`. Nodes can read it
 * to iterate on an existing draft instead of regenerating from scratch.
 */
export type ChatContext = {
  currentDiscoveryCanvas?: DiscoveryCanvasDraft;
  briefId?: string;
  briefLabel?: string;
  agentId?: string;
  agentLabel?: string;
  /**
   * Id of the canvas row this canvas was last persisted into. Ships every
   * turn so `saveDiscoveryCanvasNode` can UPDATE the same row on re-save instead of
   * inserting a duplicate. Server reads it from `ctx.savedDiscoveryCanvasId`.
   */
  savedDiscoveryCanvasId?: string;
  /**
   * Set to `true` only when this turn was kicked off by the canvas Save
   * button (the transport stamps it whenever `workflowId === canvas-save`).
   * Tells `confirmSaveNode` to skip the Save/Cancel interrupt — the click
   * counts as explicit consent. Prompt-driven saves leave it undefined so
   * the workflow asks the user to confirm before persisting.
   */
  saveConfirmed?: boolean;
};

export type DiscoveryCanvasStoreMutators = {
  updateTitle: (title: string) => void;
  updateFacilitatorStyleId: (facilitatorStyleId: string | null) => void;
  updateCanvasMode: (mode: CanvasMode) => void;
  updateIntro: (patch: {
    label?: string;
    summary?: string;
    item_text?: string;
  }) => void;
  updateSection: (
    sectionKey: string,
    patch: {
      section_label?: string;
      section_summary?: string;
      section_rationale?: string;
    },
  ) => void;
  updateItem: (
    sectionKey: string,
    itemKey: string,
    patch: { item_text?: string; item_rationale?: string },
  ) => void;
  addSection: (sectionKey: string, section: Section) => void;
  removeSection: (sectionKey: string) => void;
  addItem: (sectionKey: string, itemKey: string, item: Item) => void;
  removeItem: (sectionKey: string, itemKey: string) => void;
};

/**
 * Shared chat state surfaced to both the header and the body. The provider
 * runs every `useChat`-side hook and effect exactly once at this layer so
 * the chat survives layout transitions — particularly the chat-only →
 * side-by-side switch when the first canvas chunk arrives mid-stream.
 *
 * The provider is keyed by the active chat session id one level up, so
 * switching sessions remounts the whole subtree (chat hook, canvas store,
 * quote store) and the new chat hydrates cleanly from its own storage
 * keys without any imperative reset.
 */
export type ChatPanelContextValue = {
  chat: ReturnType<typeof useChat<ChatContext>>;
  setResolvedId: (
    kind: "brief" | "agent",
    value: { id: string; label: string },
  ) => void;
  /**
   * Trigger the canvas-save workflow. Temporarily switches the chat's
   * `workflowId` to `canvas-save` for one round, sends the sentinel save
   * message, then resets `workflowId` back to `general-chat` once the
   * resulting stream completes.
   */
  requestSave: () => void;
  /** True while the canvas-save workflow is streaming a response. */
  isSaving: boolean;
  /**
   * DB id of the canvas row the canvas was previously persisted into, or
   * `null` if the canvas has never been saved in this chat session. Lets
   * the Save button render "Update canvas" instead of "Create canvas" once
   * a row exists.
   */
  savedDiscoveryCanvasId: string | null;
  /** Raw stream chunks for the debug panel. */
  debugChunks: ReturnType<typeof useChat<ChatContext>>["streamDebug"];
  /** True when the debug panel is occupying the right-side panel. */
  isDebugOpen: boolean;
  setDebugOpen: (open: boolean) => void;
  /** Selected assistant message whose debug chunks are displayed. */
  debugForMessageId: string | null;
  setDebugForMessageId: (id: string | null) => void;
  /** When true, show the live stream buffer; when false, show pinned message debug. */
  debugLiveMode: boolean;
  setDebugLiveMode: (live: boolean) => void;
  toggleDebugLive: () => void;
  openDebugForMessage: (id: string) => void;
};
