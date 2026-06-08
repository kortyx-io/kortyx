"use client";

import {
  type ChatMsg,
  createBrowserChatStorage,
  createRouteChatTransport,
  type ForkCheckpointResult,
  type HumanInputPiece,
  useChat,
} from "@kortyx/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildDiscoveryCanvasDraftFromPieces,
  findLatestDiscoveryCanvasSaved,
  findLatestResolvedEntities,
  pickCanvasCreateStreamId,
  pickDiscoveryCanvasData,
} from "@/components/streaming";
import { useDiscoveryCanvasStore } from "@/hooks/use-canvas-store";
import { useChatSessions } from "@/hooks/use-chat-sessions";
import { extractQuoteFromMessage } from "@/lib/chat-quote-format";
import { SAVE_CANVAS_INTENT_MESSAGE, WORKFLOW_IDS } from "@/lib/protocol";
import {
  discoveryCanvasDraftHasContent,
  writeDiscoveryCanvasDraftCache,
} from "@/providers/canvas-store";
import { CHAT_STORAGE_PREFIX } from "@/providers/chat-sessions";
import type { ChatContext, ChatPanelContextValue } from "@/types/chat-panel";
import { applyStreamingPatches } from "./canvas-patches";
import { ChatPanelContext } from "./context";
import { prepareChatContextMessages } from "./prepare-messages";

type Props = {
  endpoint?: string;
  children: React.ReactNode;
};

export function ChatProvider({
  children,
  endpoint = "/api/canvas-agent/chat",
}: Props) {
  const { currentChatId, autoTitleIfDefault, createForkedChat } =
    useChatSessions();
  const {
    replaceDraft,
    setStreaming,
    getDraftSnapshot,
    getResolvedIdsSnapshot,
    setResolvedId,
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
    savedDiscoveryCanvasId,
    getSavedDiscoveryCanvasIdSnapshot,
    setSavedDiscoveryCanvasId,
    setCanvasOpen,
    revealCanvasInfoBanner,
    setCanvasCreating,
  } = useDiscoveryCanvasStore();

  const checkpointEndpoint = useMemo(
    () => `${endpoint.replace(/\/$/, "")}/checkpoints`,
    [endpoint],
  );

  const transport = useMemo(
    () =>
      createRouteChatTransport<ChatContext>({
        endpoint,
        checkpointEndpoint,
        // Inject the latest canvas snapshot AND any previously-resolved
        // brief/agent ids into every request, so collect-canvas-inputs-node can
        // short-circuit the picker on repeat canvas generations.
        createBody: ({ sessionId, workflowId, messages, context }) => {
          const resolved = getResolvedIdsSnapshot();
          const persistedDiscoveryCanvasId =
            getSavedDiscoveryCanvasIdSnapshot();
          // The Save button is the only path that flips `workflowId` to
          // `canvas-save` (see `requestSave` below) — every other turn
          // routes through the general-chat default. Use that as the
          // signal that the user explicitly consented to save, so
          // `confirmSaveNode` can skip the chat-side Save/Cancel
          // interrupt. Prompt-driven saves stay on general-chat at this
          // point and reach the save workflow via `transitionTo`, where
          // the interrupt fires because this flag is undefined.
          const saveConfirmed = workflowId === WORKFLOW_IDS.canvasSave;
          return {
            sessionId,
            workflowId,
            messages,
            context: {
              ...context,
              currentDiscoveryCanvas: getDraftSnapshot(),
              ...(resolved.briefId ? { briefId: resolved.briefId } : {}),
              ...(resolved.briefLabel
                ? { briefLabel: resolved.briefLabel }
                : {}),
              ...(resolved.agentId ? { agentId: resolved.agentId } : {}),
              ...(resolved.agentLabel
                ? { agentLabel: resolved.agentLabel }
                : {}),
              ...(persistedDiscoveryCanvasId
                ? { savedDiscoveryCanvasId: persistedDiscoveryCanvasId }
                : {}),
              ...(saveConfirmed ? { saveConfirmed: true } : {}),
            },
          };
        },
      }),
    [
      endpoint,
      checkpointEndpoint,
      getDraftSnapshot,
      getResolvedIdsSnapshot,
      getSavedDiscoveryCanvasIdSnapshot,
    ],
  );

  // Persist chat messages per-chat in localStorage so each chat session
  // restores independently. The provider is keyed by chatId one level up,
  // so `currentChatId` is stable within a mount — the useMemo computes the
  // storage exactly once per session.
  const storage = useMemo(() => {
    const prefix = `${CHAT_STORAGE_PREFIX}${currentChatId}:`;
    return createBrowserChatStorage<ChatMsg>({
      keys: {
        messages: `${prefix}messages`,
        sessionId: `${prefix}sessionId`,
        workflowId: `${prefix}workflowId`,
        includeHistory: `${prefix}includeHistory`,
        branches: `${prefix}branches`,
        responseVariants: `${prefix}responseVariants`,
      },
    });
  }, [currentChatId]);

  const chat = useChat<ChatContext>({
    transport,
    storage,
    prepareContextMessages: prepareChatContextMessages,
  });

  const [isDebugOpen, setDebugOpen] = useState(false);
  const [debugForMessageId, setDebugForMessageId] = useState<string | null>(
    null,
  );
  const [debugLiveMode, setDebugLiveMode] = useState(true);
  const [checkpointStatus, setCheckpointStatus] = useState<string | null>(null);

  const runCheckpointAction = useCallback(
    async (action: () => Promise<void>, success?: string) => {
      setCheckpointStatus(null);
      try {
        await action();
        if (success) setCheckpointStatus(success);
      } catch (error) {
        setCheckpointStatus(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [],
  );

  // Mirror the chat streaming state onto the canvas so the "Drafting…" badge
  // shows while the LLM is generating, even before any structured chunks
  // arrive (today the structured chunk only lands at completion).
  useEffect(() => {
    setStreaming(chat.isStreaming);
  }, [chat.isStreaming, setStreaming]);

  // Re-show the canvas onboarding banner at the start of each create-canvas
  // run (including regenerate / start-over turns). Key off the active chat
  // stream rather than the thinking stream id, which is stable across turns.
  const revealedInfoBannerForStreamRef = useRef(false);
  useEffect(() => {
    if (!chat.isStreaming) {
      revealedInfoBannerForStreamRef.current = false;
      setCanvasCreating(false);
      return;
    }
    if (revealedInfoBannerForStreamRef.current) return;
    for (const piece of chat.streamContentPieces) {
      if (!pickCanvasCreateStreamId(piece)) continue;
      revealedInfoBannerForStreamRef.current = true;
      revealCanvasInfoBanner();
      setCanvasCreating(true);
      return;
    }
  }, [
    chat.isStreaming,
    chat.streamContentPieces,
    revealCanvasInfoBanner,
    setCanvasCreating,
  ]);

  // Pull the latest `canvas.draft` payload onto the canvas.
  //
  // - Live stream pieces ALWAYS win — that's how the canvas types out a
  //   canvas as create-canvas is streaming.
  // - For finalized message pieces we only call `replaceDraft` the first
  //   time we see each piece id. Otherwise, after an update-canvas turn
  //   finishes and `chat.messages` updates, this effect would re-find the
  //   stale `canvas.draft` piece from the original create-canvas turn and
  //   wipe the patches that just landed.
  // - Skip stale message drafts when a newer per-chat local cache is already
  //   loaded (user edits survive reload).
  const appliedDiscoveryCanvasDraftPieceIdRef = useRef<string | null>(null);
  useEffect(() => {
    for (const piece of chat.streamContentPieces) {
      const data = pickDiscoveryCanvasData(piece);
      if (data) {
        replaceDraft(data);
        setCanvasOpen(true);
        return;
      }
    }
    if (discoveryCanvasDraftHasContent(getDraftSnapshot())) {
      return;
    }
    for (let i = chat.messages.length - 1; i >= 0; i -= 1) {
      const pieces = chat.messages[i]?.contentPieces ?? [];
      for (let j = pieces.length - 1; j >= 0; j -= 1) {
        const piece = pieces[j];
        if (!piece) continue;
        const data = pickDiscoveryCanvasData(piece);
        if (!data) continue;
        if (appliedDiscoveryCanvasDraftPieceIdRef.current === piece.id) return;
        appliedDiscoveryCanvasDraftPieceIdRef.current = piece.id;
        replaceDraft(data);
        return;
      }
    }
  }, [
    chat.messages,
    chat.streamContentPieces,
    replaceDraft,
    setCanvasOpen,
    getDraftSnapshot,
  ]);

  // Pull resolved.entity chunks (emitted by find-brief-node etc) and stash
  // the id+label into resolvedIds so subsequent chat turns ship it back as
  // ctx.briefId / ctx.agentId.
  useEffect(() => {
    const resolved = findLatestResolvedEntities(
      chat.messages.flatMap((msg) => msg.contentPieces ?? []),
      chat.streamContentPieces,
    );
    if (resolved.brief) {
      setResolvedId("brief", {
        id: resolved.brief.id,
        label: resolved.brief.label,
      });
    }
    if (resolved.agent) {
      setResolvedId("agent", {
        id: resolved.agent.id,
        label: resolved.agent.label,
      });
    }
  }, [chat.messages, chat.streamContentPieces, setResolvedId]);

  // Pick up `canvas.saved` chunks (emitted by canvas-node after a
  // successful DB write) and remember the row id. The transport's
  // `createBody` reads it on every subsequent turn and forwards it as
  // `context.savedDiscoveryCanvasId`, so saveDiscoveryCanvasNode hits the same row instead of
  // inserting a duplicate when the user re-saves after editing.
  useEffect(() => {
    const saved = findLatestDiscoveryCanvasSaved(
      chat.messages.flatMap((msg) => msg.contentPieces ?? []),
      chat.streamContentPieces,
    );
    if (!saved) return;
    setSavedDiscoveryCanvasId(saved.canvasId);
  }, [chat.messages, chat.streamContentPieces, setSavedDiscoveryCanvasId]);

  // Apply `canvas.patches` chunks (streamed by the update-canvas workflow's
  // applyUpdatesNode via `useReason({ structured.fields })`). The structured
  // piece's data grows as each `patches.<patchKey>.value` text-delta arrives.
  // As soon as we have a path we start writing the value into the store, so
  // the canvas types out the new text live. We track the last-written value
  // per (streamId, patchKey) to avoid redundant writes when nothing changed.
  const lastAppliedPatchValuesRef = useRef<Map<string, Map<string, string>>>(
    new Map(),
  );
  // Track applied structural ops by piece id so add/remove ops aren't
  // re-applied each render. (Set ops use the value-content fingerprint
  // already tracked above; structural ops are atomic, so a single guard
  // per piece is enough.)
  const appliedStructuralOpPieceIdsRef = useRef<Set<string>>(new Set());
  const canvasMutators = useMemo(
    () => ({
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
    }),
    [
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
    ],
  );

  const restoreCanvasFromMessages = useCallback(
    (messages: ChatMsg[]) => {
      const pieces = messages.flatMap((msg) => msg.contentPieces ?? []);
      const nextDraft = buildDiscoveryCanvasDraftFromPieces(pieces);
      lastAppliedPatchValuesRef.current.clear();
      appliedStructuralOpPieceIdsRef.current.clear();
      replaceDraft(nextDraft);
      setCanvasCreating(false);
      setStreaming(false);
      if (discoveryCanvasDraftHasContent(nextDraft)) {
        setCanvasOpen(true);
      }

      const saved = findLatestDiscoveryCanvasSaved(pieces, []);
      setSavedDiscoveryCanvasId(saved?.canvasId ?? null);

      const resolved = findLatestResolvedEntities(pieces, []);
      if (resolved.brief) {
        setResolvedId("brief", {
          id: resolved.brief.id,
          label: resolved.brief.label,
        });
      }
      if (resolved.agent) {
        setResolvedId("agent", {
          id: resolved.agent.id,
          label: resolved.agent.label,
        });
      }
    },
    [
      replaceDraft,
      setCanvasCreating,
      setStreaming,
      setCanvasOpen,
      setSavedDiscoveryCanvasId,
      setResolvedId,
    ],
  );

  const restoreCanvasOnNextMessagesRef = useRef(false);
  useEffect(() => {
    if (!restoreCanvasOnNextMessagesRef.current) return;
    restoreCanvasOnNextMessagesRef.current = false;
    restoreCanvasFromMessages(chat.messages);
  }, [chat.messages, restoreCanvasFromMessages]);

  useEffect(() => {
    applyStreamingPatches({
      pieces: chat.messages.flatMap((msg) => msg.contentPieces ?? []),
      streamPieces: chat.streamContentPieces,
      lastApplied: lastAppliedPatchValuesRef.current,
      appliedStructuralOpPieceIds: appliedStructuralOpPieceIdsRef.current,
      store: canvasMutators,
    });
  }, [chat.messages, chat.streamContentPieces, canvasMutators]);

  // Title the active chat session with the first user message so it shows
  // up meaningfully in the sidebar's recent-chats list. We strip the
  // leading blockquote prefix used by the canvas "Ask Kortyx Canvas" feature so
  // the title shows the user's actual item, not the quoted context.
  // `autoTitleIfDefault` is a no-op once the session has any non-default
  // title — so a manual rename from the sidebar isn't overwritten on the
  // next chat.messages tick.
  useEffect(() => {
    const firstUser = chat.messages.find((m) => m.role === "user");
    if (!firstUser) return;
    const raw = firstUser.content?.trim() ?? "";
    if (!raw) return;
    const { body } = extractQuoteFromMessage(raw);
    const title = (body || raw).trim();
    if (!title) return;
    autoTitleIfDefault(currentChatId, title);
  }, [chat.messages, currentChatId, autoTitleIfDefault]);

  // DiscoveryCanvas-save orchestration. The button on the canvas calls `requestSave`,
  // which flips the chat's workflowId to `canvas-save` and queues the
  // sentinel send. The actual `chat.send` cannot run inline with
  // `setWorkflowId` — useChat's `send` closure captures the React-rendered
  // workflowId value, and a microtask after `setWorkflowId(...)` still
  // runs before React commits the state change. Instead we set a pending
  // counter, then an effect fires the send once `chat.workflowId` has
  // actually flipped to `canvas-save`. After the resulting stream finishes
  // we restore the workflow to general-chat so the user's next chat
  // message routes through the normal classifier.
  const isSaving =
    chat.isStreaming && chat.workflowId === WORKFLOW_IDS.canvasSave;
  const [pendingSaveCounter, setPendingSaveCounter] = useState(0);
  const requestSave = useCallback(() => {
    if (chat.isStreaming) return;
    setDebugOpen(false);
    setCanvasOpen(true);
    chat.setWorkflowId(WORKFLOW_IDS.canvasSave);
    setPendingSaveCounter((n) => n + 1);
  }, [chat, setCanvasOpen]);

  const openDebugForMessage = useCallback(
    (id: string) => {
      setDebugForMessageId(id);
      setDebugLiveMode(false);
      setDebugOpen(true);
      setCanvasOpen(false);
    },
    [setCanvasOpen],
  );

  const toggleDebugLive = useCallback(() => {
    setDebugLiveMode((live) => {
      if (live) {
        if (chat.lastAssistantId) {
          setDebugForMessageId(chat.lastAssistantId);
        }
        return false;
      }
      setDebugForMessageId(null);
      return true;
    });
  }, [chat.lastAssistantId]);

  useEffect(() => {
    if (chat.isStreaming && isDebugOpen) {
      setDebugForMessageId(null);
      setDebugLiveMode(true);
    }
  }, [chat.isStreaming, isDebugOpen]);

  useEffect(() => {
    if (pendingSaveCounter === 0) return;
    if (chat.workflowId !== WORKFLOW_IDS.canvasSave) return;
    if (chat.isStreaming) return;
    setPendingSaveCounter(0);
    void chat.send(SAVE_CANVAS_INTENT_MESSAGE);
  }, [pendingSaveCounter, chat.workflowId, chat.isStreaming, chat.send]);

  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (
      !chat.isStreaming &&
      chat.workflowId !== WORKFLOW_IDS.generalChat &&
      pendingSaveCounter === 0 &&
      !hasActiveInterrupt(chat.messages) &&
      (wasStreamingRef.current || chat.messages.length > 0)
    ) {
      // Any targeted workflow should be one-shot from the chat UI. Once it
      // finishes, route the next typed message through general-chat so the
      // LLM classifier can choose create/update/save/find from fresh context.
      chat.setWorkflowId(WORKFLOW_IDS.generalChat);
    }
    wasStreamingRef.current = chat.isStreaming;
  }, [
    chat.isStreaming,
    chat.workflowId,
    chat.messages,
    chat.setWorkflowId,
    pendingSaveCounter,
  ]);

  const regenerateAssistantMessage = useCallback(
    async (messageId: string) => {
      await runCheckpointAction(async () => {
        restoreCanvasOnNextMessagesRef.current = true;
        await chat.regenerateVariant(messageId);
      }, "Generated another response.");
    },
    [chat, runCheckpointAction],
  );

  const selectAssistantVariant = useCallback(
    async (messageId: string, variantId: string) => {
      await runCheckpointAction(async () => {
        restoreCanvasOnNextMessagesRef.current = true;
        await chat.selectVariant(messageId, variantId);
      });
    },
    [chat, runCheckpointAction],
  );

  const rollbackToMessage = useCallback(
    async (messageId: string, checkpointId: string) => {
      await runCheckpointAction(async () => {
        await chat.rollbackTo(checkpointId);
        const trimmed = trimMessagesThroughMessage(chat.messages, messageId);
        restoreCanvasFromMessages(trimmed);
      }, "Rolled back to that message.");
    },
    [chat, restoreCanvasFromMessages, runCheckpointAction],
  );

  const retryWithEditedMessage = useCallback(
    async (assistantMessageId: string, content: string) => {
      await runCheckpointAction(async () => {
        restoreCanvasOnNextMessagesRef.current = true;
        await chat.retryWithEdit(assistantMessageId, content);
      }, "Retried with the edited message.");
    },
    [chat, runCheckpointAction],
  );

  const forkInNewChat = useCallback(
    async (messageId: string, checkpointId: string) => {
      await runCheckpointAction(async () => {
        const response = await fetch(checkpointEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "fork", checkpointId }),
        });
        if (!response.ok) {
          let message = `Fork failed with status ${response.status}`;
          try {
            const parsed = (await response.json()) as { error?: unknown };
            if (typeof parsed.error === "string") message = parsed.error;
          } catch {}
          throw new Error(message);
        }
        const result = (await response.json()) as ForkCheckpointResult;
        const checkpointTurnIndex = result.checkpoint?.turnIndex;
        const forkedMessages = applyForkedPendingRequests({
          messages:
            typeof checkpointTurnIndex === "number"
              ? trimMessagesToCheckpoint(chat.messages, checkpointTurnIndex)
              : trimMessagesThroughMessage(chat.messages, messageId),
          pendingRequests: result.checkpoint?.activePendingRequests ?? [],
        });
        const forkTitle = buildForkTitle(forkedMessages);
        writeForkedChatStorage({
          chatId: result.sessionId,
          messages: forkedMessages,
          includeHistory: chat.includeHistory,
        });
        const draft = buildDiscoveryCanvasDraftFromPieces(
          forkedMessages.flatMap((msg) => msg.contentPieces ?? []),
        );
        writeDiscoveryCanvasDraftCache(
          `${CHAT_STORAGE_PREFIX}${result.sessionId}:`,
          draft,
        );
        createForkedChat({ id: result.sessionId, title: forkTitle });
      }, "Forked into a new chat.");
    },
    [
      checkpointEndpoint,
      chat.messages,
      chat.includeHistory,
      createForkedChat,
      runCheckpointAction,
    ],
  );

  const value = useMemo<ChatPanelContextValue>(
    () => ({
      chat,
      setResolvedId,
      requestSave,
      isSaving,
      savedDiscoveryCanvasId,
      debugChunks: chat.streamDebug,
      isDebugOpen,
      setDebugOpen,
      debugForMessageId,
      setDebugForMessageId,
      debugLiveMode,
      setDebugLiveMode,
      toggleDebugLive,
      openDebugForMessage,
      checkpointStatus,
      regenerateAssistantMessage,
      selectAssistantVariant,
      rollbackToMessage,
      forkInNewChat,
      retryWithEditedMessage,
    }),
    [
      chat,
      setResolvedId,
      requestSave,
      isSaving,
      savedDiscoveryCanvasId,
      chat.streamDebug,
      isDebugOpen,
      debugForMessageId,
      debugLiveMode,
      toggleDebugLive,
      openDebugForMessage,
      checkpointStatus,
      regenerateAssistantMessage,
      selectAssistantVariant,
      rollbackToMessage,
      forkInNewChat,
      retryWithEditedMessage,
    ],
  );

  return (
    <ChatPanelContext.Provider value={value}>
      {children}
    </ChatPanelContext.Provider>
  );
}

function hasActiveInterrupt(messages: ChatMsg[]): boolean {
  const latest = messages[messages.length - 1];
  if (latest?.role !== "assistant") return false;
  return Boolean(
    latest.contentPieces?.some((piece) => piece.type === "interrupt"),
  );
}

function trimMessagesThroughMessage(
  messages: ChatMsg[],
  messageId: string,
): ChatMsg[] {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return messages;
  return messages.slice(0, index + 1);
}

function trimMessagesToCheckpoint(
  messages: ChatMsg[],
  turnIndex: number,
): ChatMsg[] {
  const hasCheckpointMetadata = messages.some(
    (message) => typeof message.checkpointTurnIndex === "number",
  );
  if (!hasCheckpointMetadata && turnIndex > 0) return messages;

  const keepThroughIndex = messages.reduce((lastIndex, message, index) => {
    return typeof message.checkpointTurnIndex === "number" &&
      message.checkpointTurnIndex <= turnIndex
      ? index
      : lastIndex;
  }, -1);

  return keepThroughIndex >= 0 ? messages.slice(0, keepThroughIndex + 1) : [];
}

type ForkPendingRequest = NonNullable<
  NonNullable<ForkCheckpointResult["checkpoint"]>["activePendingRequests"]
>[number];

function applyForkedPendingRequests(args: {
  messages: ChatMsg[];
  pendingRequests: ForkPendingRequest[];
}): ChatMsg[] {
  if (args.pendingRequests.length === 0) return args.messages;

  const interruptPositions = args.messages.flatMap((message, messageIndex) =>
    (message.contentPieces ?? []).flatMap((piece, pieceIndex) =>
      piece.type === "interrupt" ? [{ messageIndex, pieceIndex, piece }] : [],
    ),
  );
  const usedPositions = new Set<number>();
  const patchByPosition = new Map<number, ForkPendingRequest>();

  for (
    let pendingIndex = args.pendingRequests.length - 1;
    pendingIndex >= 0;
    pendingIndex -= 1
  ) {
    const pending = args.pendingRequests[pendingIndex];
    if (!pending) continue;
    const pendingId = pending.schema?.schemaId ?? pending.schema?.id;
    const positionIndex = findLastIndex(
      interruptPositions,
      (position, index) => {
        if (usedPositions.has(index)) return false;
        const pieceId = position.piece.schemaId ?? position.piece.interruptId;
        return pendingId ? pieceId === pendingId : true;
      },
    );
    if (positionIndex < 0) continue;
    usedPositions.add(positionIndex);
    patchByPosition.set(positionIndex, pending);
  }

  const positionsToPatch = Array.from(patchByPosition.keys());
  if (positionsToPatch.length === 0) return args.messages;

  return args.messages.map((message, messageIndex) => {
    if (!message.contentPieces) return message;

    let changed = false;
    const contentPieces = message.contentPieces.map((piece, pieceIndex) => {
      if (piece.type !== "interrupt") return piece;
      const patchIndex = positionsToPatch.findIndex((positionIndex) => {
        const position = interruptPositions[positionIndex];
        return (
          position?.messageIndex === messageIndex &&
          position.pieceIndex === pieceIndex
        );
      });
      const positionToPatch = positionsToPatch[patchIndex];
      const pending =
        patchIndex >= 0 && typeof positionToPatch === "number"
          ? patchByPosition.get(positionToPatch)
          : undefined;
      if (!pending) return piece;

      changed = true;
      return {
        ...piece,
        resumeToken: pending.token,
        requestId: pending.requestId,
        ...(pending.schema?.kind ? { kind: pending.schema.kind } : {}),
        ...(typeof pending.schema?.multiple === "boolean"
          ? { multiple: pending.schema.multiple }
          : {}),
        ...(typeof pending.schema?.question === "string"
          ? { question: pending.schema.question }
          : {}),
        ...(typeof pending.schema?.schemaId === "string"
          ? { schemaId: pending.schema.schemaId }
          : {}),
        ...(typeof pending.schema?.schemaVersion === "string"
          ? { schemaVersion: pending.schema.schemaVersion }
          : {}),
        ...(typeof pending.schema?.id === "string"
          ? { interruptId: pending.schema.id }
          : {}),
        ...(pending.schema?.meta ? { meta: pending.schema.meta } : {}),
        ...(pending.options ? { options: pending.options } : {}),
      } satisfies HumanInputPiece;
    });

    return changed ? { ...message, contentPieces } : message;
  });
}

function findLastIndex<T>(
  items: T[],
  predicate: (item: T, index: number) => boolean,
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && predicate(item, index)) return index;
  }
  return -1;
}

function buildForkTitle(messages: ChatMsg[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  const raw = firstUser?.content?.trim() ?? "";
  const { body } = extractQuoteFromMessage(raw);
  const title = (body || raw || "Forked chat").trim();
  return `Fork: ${title}`.slice(0, 80);
}

function writeForkedChatStorage({
  chatId,
  messages,
  includeHistory,
}: {
  chatId: string;
  messages: ChatMsg[];
  includeHistory: boolean;
}): void {
  if (typeof window === "undefined") return;
  const prefix = `${CHAT_STORAGE_PREFIX}${chatId}:`;
  try {
    window.localStorage.setItem(`${prefix}messages`, JSON.stringify(messages));
    window.localStorage.setItem(`${prefix}sessionId`, chatId);
    window.localStorage.setItem(
      `${prefix}workflowId`,
      WORKFLOW_IDS.generalChat,
    );
    window.localStorage.setItem(
      `${prefix}includeHistory`,
      includeHistory ? "1" : "0",
    );
    window.localStorage.removeItem(`${prefix}branches`);
    window.localStorage.removeItem(`${prefix}responseVariants`);
  } catch {
    // best-effort
  }
}
