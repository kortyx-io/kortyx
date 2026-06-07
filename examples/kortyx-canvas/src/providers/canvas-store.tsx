"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CanvasMode,
  DiscoveryCanvasResponse,
  Item,
  Section,
} from "@/schemas/discovery-canvas";

/**
 * Client-side draft of the Product Discovery Canvas. The structure mirrors the LLM
 * output schema but every field is optional so we can render a partial canvas
 * while the chat is still streaming or being edited.
 */
export type DiscoveryCanvasDraft = Partial<DiscoveryCanvasResponse>;

/**
 * Persisted resolutions for the picker entities. Survives page refreshes so
 * a follow-up "regenerate with stricter rationales" message can short-circuit
 * the picker flow. The server resolver may still override these when the
 * user explicitly references a different brief/agent in chat.
 *
 * Labels are kept alongside ids so the server can render a friendly preamble
 * ("Using *Unusual Wire Transfer* for the canvas") without an extra DB round-trip.
 */
export type ResolvedIds = {
  briefId?: string;
  briefLabel?: string;
  agentId?: string;
  agentLabel?: string;
};

const CANVAS_OPEN_STORAGE_KEY = "canvas-agent:canvasOpen";
/** @deprecated Legacy global key — cleared on mount when scoped storage is used. */
const LEGACY_RESOLVED_IDS_STORAGE_KEY = "canvas-agent:resolvedIds";
/**
 * Per-chat localStorage suffix where we persist the DB canvas id assigned
 * on the first save. The chat panel reads it back into runtime context on
 * every request so re-saves update the same row instead of creating
 * duplicates. The full key is `canvas-agent:chats:<chatId>:savedDiscoveryCanvasId`
 * — kept in lock-step with `CHAT_STORAGE_PREFIX` so deleting a chat from
 * the sidebar wipes this entry too via the prefix-walking cleanup.
 */
const SAVED_CANVAS_ID_KEY_SUFFIX = "savedDiscoveryCanvasId";
const RESOLVED_IDS_KEY_SUFFIX = "resolvedIds";
/** Per-chat localStorage suffix for the editable canvas draft cache. */
const DRAFT_CACHE_KEY_SUFFIX = "canvasDraft";
const DRAFT_CACHE_DEBOUNCE_MS = 300;

export function discoveryCanvasDraftHasContent(
  draft: DiscoveryCanvasDraft,
): boolean {
  const points = draft.sections ?? {};
  return Boolean(draft.intro?.item_text || Object.keys(points).length > 0);
}

function buildDraftCacheKey(chatStorageKey: string | undefined): string | null {
  if (!chatStorageKey) return null;
  return `${chatStorageKey}${DRAFT_CACHE_KEY_SUFFIX}`;
}

function readDraftCacheFromStorage(
  chatStorageKey: string | undefined,
): DiscoveryCanvasDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  const key = buildDraftCacheKey(chatStorageKey);
  if (!key) return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_DRAFT;
    return parsed as DiscoveryCanvasDraft;
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraftCacheToStorage(
  chatStorageKey: string | undefined,
  draft: DiscoveryCanvasDraft,
): void {
  if (typeof window === "undefined") return;
  const key = buildDraftCacheKey(chatStorageKey);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // best-effort
  }
}

function clearDraftCacheFromStorage(chatStorageKey: string | undefined): void {
  if (typeof window === "undefined") return;
  const key = buildDraftCacheKey(chatStorageKey);
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

function buildResolvedIdsKey(
  chatStorageKey: string | undefined,
): string | null {
  if (!chatStorageKey) return null;
  return `${chatStorageKey}${RESOLVED_IDS_KEY_SUFFIX}`;
}

function readCanvasOpenFromStorage(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CANVAS_OPEN_STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}

function writeCanvasOpenToStorage(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CANVAS_OPEN_STORAGE_KEY, open ? "1" : "0");
  } catch {
    // best-effort
  }
}

export type DiscoveryCanvasStoreValue = {
  /** The current draft. Empty object when no canvas has been generated yet. */
  draft: DiscoveryCanvasDraft;
  /** True once we have any meaningful canvas data (intro or any section). */
  hasContent: boolean;
  /** Whether the most recent structured stream is still in-progress. */
  isStreaming: boolean;
  /**
   * UI preference: whether the canvas panel is currently visible alongside
   * the chat. Persisted to localStorage so toggling it off survives reloads.
   * The actual canvas only renders when `hasContent && isCanvasOpen`.
   */
  isCanvasOpen: boolean;
  /** Toggle the canvas panel open/closed. Persists immediately. */
  setCanvasOpen: (open: boolean) => void;
  /**
   * Replace the entire draft. Used when a new canvas arrives from the agent
   * (a `structured-data` final chunk) or on explicit reset.
   */
  replaceDraft: (next: DiscoveryCanvasDraft) => void;
  /** Mark the streaming state. Set true on `streaming`, false on `done`. */
  setStreaming: (next: boolean) => void;
  /** Reset to an empty canvas. */
  reset: () => void;
  /** Update the canvas title. */
  updateTitle: (title: string) => void;
  /** Update the selected facilitatorStyle id. `null` clears the selection. */
  updateFacilitatorStyleId: (facilitatorStyleId: string | null) => void;
  /** Update the canvas mode. */
  updateCanvasMode: (mode: CanvasMode) => void;
  /** Patch the product brief card (title, description, or item text). */
  updateIntro: (patch: {
    label?: string;
    summary?: string;
    item_text?: string;
  }) => void;
  /** Patch a section (label/explanation/rationale). */
  updateSection: (
    sectionKey: string,
    patch: {
      section_label?: string;
      section_summary?: string;
      section_rationale?: string;
    },
  ) => void;
  /** Patch a item under a section. */
  updateItem: (
    sectionKey: string,
    itemKey: string,
    patch: { item_text?: string; item_rationale?: string },
  ) => void;
  /** Insert a new section at the end of the sections record. */
  addSection: (sectionKey: string, section: Section) => void;
  /** Remove a section (and all its items) by key. */
  removeSection: (sectionKey: string) => void;
  /** Insert a new item under an existing section. */
  addItem: (sectionKey: string, itemKey: string, item: Item) => void;
  /** Remove a item by key from an existing section. */
  removeItem: (sectionKey: string, itemKey: string) => void;
  /**
   * Snapshot getter — reads the current draft synchronously without
   * subscribing to re-renders. Used by `useChat`'s `prepareContextMessages`
   * callback so we can attach the latest canvas to outgoing requests without
   * causing the transport to be recreated on every edit.
   */
  getDraftSnapshot: () => DiscoveryCanvasDraft;
  /** Persisted brief/agent ids resolved via picker (or future LLM resolver). */
  resolvedIds: ResolvedIds;
  /** Snapshot getter for resolved ids — same rationale as `getDraftSnapshot`. */
  getResolvedIdsSnapshot: () => ResolvedIds;
  /** Persist a brief/agent id after the user picks (or the resolver matches). */
  setResolvedId: (
    kind: "brief" | "agent",
    value: { id: string; label: string } | undefined,
  ) => void;
  /**
   * DB canvas id this canvas was last persisted into. `null` until the
   * first successful save. Survives reloads via per-chat localStorage so
   * the canvas keeps pointing at the same DB row across refreshes.
   */
  savedDiscoveryCanvasId: string | null;
  /** Snapshot getter — same rationale as `getDraftSnapshot`. */
  getSavedDiscoveryCanvasIdSnapshot: () => string | null;
  /** Update the saved id (called when a `canvas.saved` chunk arrives). */
  setSavedDiscoveryCanvasId: (id: string | null) => void;
  /** True while the onboarding banner should show for the current canvas generation. */
  showCanvasInfoBanner: boolean;
  /** Show the canvas onboarding banner (called when canvas creation starts). */
  revealCanvasInfoBanner: () => void;
  /** Hide the canvas onboarding banner until the next canvas generation. */
  dismissCanvasInfoBanner: () => void;
  /** True while a create-canvas run is actively streaming onto the panel. */
  isCanvasCreating: boolean;
  setCanvasCreating: (creating: boolean) => void;
};

export const DiscoveryCanvasStoreContext =
  createContext<DiscoveryCanvasStoreValue | null>(null);

const EMPTY_DRAFT: DiscoveryCanvasDraft = Object.freeze({});

const EMPTY_RESOLVED: ResolvedIds = Object.freeze({});

function readResolvedIdsFromStorage(
  chatStorageKey: string | undefined,
): ResolvedIds {
  if (typeof window === "undefined") return EMPTY_RESOLVED;
  const key = buildResolvedIdsKey(chatStorageKey);
  if (!key) return EMPTY_RESOLVED;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY_RESOLVED;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_RESOLVED;
    return {
      ...(typeof parsed.briefId === "string"
        ? { briefId: parsed.briefId }
        : {}),
      ...(typeof parsed.briefLabel === "string"
        ? { briefLabel: parsed.briefLabel }
        : {}),
      ...(typeof parsed.agentId === "string"
        ? { agentId: parsed.agentId }
        : {}),
      ...(typeof parsed.agentLabel === "string"
        ? { agentLabel: parsed.agentLabel }
        : {}),
    };
  } catch {
    return EMPTY_RESOLVED;
  }
}

function writeResolvedIdsToStorage(
  chatStorageKey: string | undefined,
  value: ResolvedIds,
): void {
  if (typeof window === "undefined") return;
  const key = buildResolvedIdsKey(chatStorageKey);
  if (!key) return;
  try {
    if (!value.briefId && !value.agentId) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota / disabled — silently ignore; persistence is best-effort.
  }
}

function buildSavedDiscoveryCanvasIdKey(
  chatStorageKey: string | undefined,
): string | null {
  if (!chatStorageKey) return null;
  return `${chatStorageKey}${SAVED_CANVAS_ID_KEY_SUFFIX}`;
}

function readSavedDiscoveryCanvasIdFromStorage(
  chatStorageKey: string | undefined,
): string | null {
  if (typeof window === "undefined") return null;
  const key = buildSavedDiscoveryCanvasIdKey(chatStorageKey);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeSavedDiscoveryCanvasIdToStorage(
  chatStorageKey: string | undefined,
  value: string | null,
): void {
  if (typeof window === "undefined") return;
  const key = buildSavedDiscoveryCanvasIdKey(chatStorageKey);
  if (!key) return;
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // best-effort
  }
}

type DiscoveryCanvasStoreProviderProps = {
  children: ReactNode;
  /**
   * Per-chat storage scope (e.g. `canvas-agent:chats:<chatId>:`).
   * Used to namespace `savedDiscoveryCanvasId` and `resolvedIds` per chat
   * session so switching chats doesn't bleed persisted state across sessions.
   *
   * Optional for backward compat — when omitted, `savedDiscoveryCanvasId` is not
   * persisted to storage and resets on every mount.
   */
  chatStorageKey?: string;
};

export function DiscoveryCanvasStoreProvider({
  children,
  chatStorageKey,
}: DiscoveryCanvasStoreProviderProps) {
  const [draft, setDraft] = useState<DiscoveryCanvasDraft>(() =>
    readDraftCacheFromStorage(chatStorageKey),
  );
  const [isStreaming, setIsStreaming] = useState(false);
  // Hydrated on mount (not in initializer) so SSR and first client render
  // agree — avoids React's hydration mismatch warning.
  const [resolvedIds, setResolvedIds] = useState<ResolvedIds>(EMPTY_RESOLVED);
  const [isCanvasOpen, setIsCanvasOpen] = useState(true);
  const [savedDiscoveryCanvasId, setSavedDiscoveryCanvasIdState] = useState<
    string | null
  >(null);
  const [showCanvasInfoBanner, setShowCanvasInfoBanner] = useState(false);
  const [isCanvasCreating, setIsCanvasCreating] = useState(false);

  const revealCanvasInfoBanner = useCallback(() => {
    setShowCanvasInfoBanner(true);
  }, []);

  const dismissCanvasInfoBanner = useCallback(() => {
    setShowCanvasInfoBanner(false);
  }, []);

  const setCanvasCreating = useCallback((creating: boolean) => {
    setIsCanvasCreating(creating);
  }, []);

  // Mirror state in a ref so consumers (e.g. the chat transport context
  // builder) can read the latest snapshot without triggering re-renders.
  const draftRef = useRef<DiscoveryCanvasDraft>(EMPTY_DRAFT);
  draftRef.current = draft;
  const resolvedIdsRef = useRef<ResolvedIds>(EMPTY_RESOLVED);
  resolvedIdsRef.current = resolvedIds;
  const savedDiscoveryCanvasIdRef = useRef<string | null>(null);
  savedDiscoveryCanvasIdRef.current = savedDiscoveryCanvasId;

  useEffect(() => {
    // Drop the pre-per-chat global key so a fresh session never inherits
    // another chat's brief/agent selection.
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LEGACY_RESOLVED_IDS_STORAGE_KEY);
      } catch {
        // best-effort
      }
    }
    const hydrated = readResolvedIdsFromStorage(chatStorageKey);
    setResolvedIds(hydrated);
    const storedCanvasOpen = readCanvasOpenFromStorage();
    if (storedCanvasOpen != null) {
      setIsCanvasOpen(storedCanvasOpen);
    }
    const storedDiscoveryCanvasId =
      readSavedDiscoveryCanvasIdFromStorage(chatStorageKey);
    if (storedDiscoveryCanvasId)
      setSavedDiscoveryCanvasIdState(storedDiscoveryCanvasId);
  }, [chatStorageKey]);

  // Debounced per-chat draft cache — survives reloads; distinct from the
  // canvas-save workflow that persists to the database.
  useEffect(() => {
    const flushDraftCache = () => {
      const snapshot = draftRef.current;
      if (discoveryCanvasDraftHasContent(snapshot)) {
        writeDraftCacheToStorage(chatStorageKey, snapshot);
      } else {
        clearDraftCacheFromStorage(chatStorageKey);
      }
    };

    const id = window.setTimeout(flushDraftCache, DRAFT_CACHE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
      flushDraftCache();
    };
  }, [chatStorageKey]);

  const replaceDraft = useCallback((next: DiscoveryCanvasDraft) => {
    setDraft(next);
  }, []);

  const setCanvasOpen = useCallback((open: boolean) => {
    setIsCanvasOpen(open);
    writeCanvasOpenToStorage(open);
  }, []);

  const reset = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setIsStreaming(false);
    setShowCanvasInfoBanner(false);
    setIsCanvasCreating(false);
    setResolvedIds(EMPTY_RESOLVED);
    writeResolvedIdsToStorage(chatStorageKey, EMPTY_RESOLVED);
    setSavedDiscoveryCanvasIdState(null);
    writeSavedDiscoveryCanvasIdToStorage(chatStorageKey, null);
    clearDraftCacheFromStorage(chatStorageKey);
    // Reset canvas visibility back to default so the next canvas opens
    // automatically even if the user had collapsed the previous one.
    setIsCanvasOpen(true);
    writeCanvasOpenToStorage(true);
  }, [chatStorageKey]);

  const setSavedDiscoveryCanvasId = useCallback<
    DiscoveryCanvasStoreValue["setSavedDiscoveryCanvasId"]
  >(
    (id) => {
      setSavedDiscoveryCanvasIdState((prev) => {
        if (prev === id) return prev;
        writeSavedDiscoveryCanvasIdToStorage(chatStorageKey, id);
        return id;
      });
    },
    [chatStorageKey],
  );

  const setResolvedId = useCallback<DiscoveryCanvasStoreValue["setResolvedId"]>(
    (kind, value) => {
      setResolvedIds((prev) => {
        const next: ResolvedIds = { ...prev };
        if (kind === "brief") {
          if (value) {
            next.briefId = value.id;
            next.briefLabel = value.label;
          } else {
            delete next.briefId;
            delete next.briefLabel;
          }
        } else {
          if (value) {
            next.agentId = value.id;
            next.agentLabel = value.label;
          } else {
            delete next.agentId;
            delete next.agentLabel;
          }
        }
        writeResolvedIdsToStorage(chatStorageKey, next);
        return next;
      });
    },
    [chatStorageKey],
  );

  const updateTitle = useCallback((title: string) => {
    setDraft((prev) => ({ ...prev, title }));
  }, []);

  const updateFacilitatorStyleId = useCallback(
    (facilitatorStyleId: string | null) => {
      setDraft((prev) => ({
        ...prev,
        facilitator_style_id: facilitatorStyleId,
      }));
    },
    [],
  );

  const updateCanvasMode = useCallback((mode: CanvasMode) => {
    setDraft((prev) => ({ ...prev, canvas_mode: mode }));
  }, []);

  const updateIntro = useCallback<DiscoveryCanvasStoreValue["updateIntro"]>(
    (patch) => {
      setDraft((prev) => ({
        ...prev,
        intro: {
          label: prev.intro?.label ?? "",
          summary: prev.intro?.summary ?? "",
          item_text: prev.intro?.item_text ?? "",
          ...patch,
        },
      }));
    },
    [],
  );

  const updateSection = useCallback<DiscoveryCanvasStoreValue["updateSection"]>(
    (sectionKey, patch) => {
      setDraft((prev) => {
        const points = prev.sections ?? {};
        const existing = points[sectionKey];
        if (!existing) return prev;
        return {
          ...prev,
          sections: {
            ...points,
            [sectionKey]: { ...existing, ...patch },
          },
        };
      });
    },
    [],
  );

  const updateItem = useCallback<DiscoveryCanvasStoreValue["updateItem"]>(
    (sectionKey, itemKey, patch) => {
      setDraft((prev) => {
        const points = prev.sections ?? {};
        const section = points[sectionKey];
        if (!section) return prev;
        const existingItem = section.items[itemKey];
        if (!existingItem) return prev;
        return {
          ...prev,
          sections: {
            ...points,
            [sectionKey]: {
              ...section,
              items: {
                ...section.items,
                [itemKey]: { ...existingItem, ...patch },
              },
            },
          },
        };
      });
    },
    [],
  );

  const addSection = useCallback<DiscoveryCanvasStoreValue["addSection"]>(
    (sectionKey, section) => {
      setDraft((prev) => {
        const points = prev.sections ?? {};
        // No-op if the key already exists — the server picks a unique key,
        // but we guard here so concurrent updates can't clobber existing
        // content.
        if (points[sectionKey]) return prev;
        return {
          ...prev,
          sections: {
            ...points,
            [sectionKey]: section,
          },
        };
      });
    },
    [],
  );

  const removeSection = useCallback<DiscoveryCanvasStoreValue["removeSection"]>(
    (sectionKey) => {
      setDraft((prev) => {
        const points = prev.sections ?? {};
        if (!points[sectionKey]) return prev;
        const { [sectionKey]: _removed, ...rest } = points;
        return {
          ...prev,
          sections: rest,
        };
      });
    },
    [],
  );

  const addItem = useCallback<DiscoveryCanvasStoreValue["addItem"]>(
    (sectionKey, itemKey, item) => {
      setDraft((prev) => {
        const points = prev.sections ?? {};
        const section = points[sectionKey];
        if (!section) return prev;
        if (section.items[itemKey]) return prev;
        return {
          ...prev,
          sections: {
            ...points,
            [sectionKey]: {
              ...section,
              items: {
                ...section.items,
                [itemKey]: item,
              },
            },
          },
        };
      });
    },
    [],
  );

  const removeItem = useCallback<DiscoveryCanvasStoreValue["removeItem"]>(
    (sectionKey, itemKey) => {
      setDraft((prev) => {
        const points = prev.sections ?? {};
        const section = points[sectionKey];
        if (!section) return prev;
        if (!section.items[itemKey]) return prev;
        const { [itemKey]: _removed, ...restItems } = section.items;
        return {
          ...prev,
          sections: {
            ...points,
            [sectionKey]: {
              ...section,
              items: restItems,
            },
          },
        };
      });
    },
    [],
  );

  const getDraftSnapshot = useCallback(() => draftRef.current, []);
  const getResolvedIdsSnapshot = useCallback(() => resolvedIdsRef.current, []);
  const getSavedDiscoveryCanvasIdSnapshot = useCallback(
    () => savedDiscoveryCanvasIdRef.current,
    [],
  );

  const hasContent = useMemo(
    () => discoveryCanvasDraftHasContent(draft),
    [draft],
  );

  const value = useMemo<DiscoveryCanvasStoreValue>(
    () => ({
      draft,
      hasContent,
      isStreaming,
      isCanvasOpen,
      setCanvasOpen,
      replaceDraft,
      setStreaming: setIsStreaming,
      reset,
      updateTitle,
      updateFacilitatorStyleId,
      updateCanvasMode,
      updateIntro,
      updateSection,
      updateItem,
      addSection,
      removeSection,
      addItem,
      removeItem,
      getDraftSnapshot,
      resolvedIds,
      getResolvedIdsSnapshot,
      setResolvedId,
      savedDiscoveryCanvasId,
      getSavedDiscoveryCanvasIdSnapshot,
      setSavedDiscoveryCanvasId,
      showCanvasInfoBanner,
      revealCanvasInfoBanner,
      dismissCanvasInfoBanner,
      isCanvasCreating,
      setCanvasCreating,
    }),
    [
      draft,
      hasContent,
      isStreaming,
      isCanvasOpen,
      setCanvasOpen,
      replaceDraft,
      reset,
      updateTitle,
      updateFacilitatorStyleId,
      updateCanvasMode,
      updateIntro,
      updateSection,
      updateItem,
      addSection,
      removeSection,
      addItem,
      removeItem,
      getDraftSnapshot,
      resolvedIds,
      getResolvedIdsSnapshot,
      setResolvedId,
      savedDiscoveryCanvasId,
      getSavedDiscoveryCanvasIdSnapshot,
      setSavedDiscoveryCanvasId,
      showCanvasInfoBanner,
      revealCanvasInfoBanner,
      dismissCanvasInfoBanner,
      isCanvasCreating,
      setCanvasCreating,
    ],
  );

  return (
    <DiscoveryCanvasStoreContext.Provider value={value}>
      {children}
    </DiscoveryCanvasStoreContext.Provider>
  );
}
