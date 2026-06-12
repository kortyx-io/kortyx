"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useDiscoveryCanvasStore } from "@/hooks/use-canvas-store";
import { useChatSessions } from "@/hooks/use-chat-sessions";
import { DiscoveryCanvasStoreProvider } from "@/providers/canvas-store";
import {
  CHAT_STORAGE_PREFIX,
  ChatSessionsProvider,
} from "@/providers/chat-sessions";
import { FacilitatorStylesProvider } from "@/providers/facilitator-styles-store";
import { QuoteStoreProvider } from "@/providers/quote-store";
import type { FacilitatorStyleOption } from "@/services/demo-data";
import { Canvas } from "./canvas";
import { SelectionQuoteToolbar } from "./canvas/selection-quote-toolbar";
import { ChatSidebar } from "./chat/sidebar";
import { ChatBody, ChatHeader, ChatProvider, useChatPanel } from "./chat-panel";
import { DebugPanel } from "./debug-panel";

export function AgentApp({
  facilitatorStyles,
}: {
  facilitatorStyles: FacilitatorStyleOption[];
}) {
  return (
    <FacilitatorStylesProvider facilitatorStyles={facilitatorStyles}>
      <ChatSessionsProvider>
        <SidebarProvider>
          <ChatSidebar />
          <SidebarInset className="flex h-dvh flex-col overflow-hidden">
            <PerSessionTree />
          </SidebarInset>
        </SidebarProvider>
      </ChatSessionsProvider>
    </FacilitatorStylesProvider>
  );
}

/**
 * Everything keyed by the active chat session. Wrapping the canvas/quote/
 * chat-hook stores here and keying the wrapper by `currentChatId` means
 * switching sessions cleanly remounts the per-chat state — no imperative
 * resets needed, and no risk of stale canvas data leaking from a previous
 * session.
 */
function PerSessionTree() {
  const { currentChatId } = useChatSessions();
  // Same prefix the chat panel / sessions store use; building it here so
  // the canvas-store can persist `savedDiscoveryCanvasId` under the active chat's
  // namespace (deleted alongside everything else when the sidebar wipes
  // a chat).
  const chatStorageKey = `${CHAT_STORAGE_PREFIX}${currentChatId}:`;
  return (
    <DiscoveryCanvasStoreProvider
      key={currentChatId}
      chatStorageKey={chatStorageKey}
    >
      <QuoteStoreProvider>
        <ChatProvider>
          <AgentLayout />
        </ChatProvider>
        <SelectionQuoteToolbar />
      </QuoteStoreProvider>
    </DiscoveryCanvasStoreProvider>
  );
}

const CHAT_WIDTH_STORAGE_KEY = "canvas-agent:chatWidth";
const DEFAULT_CHAT_WIDTH = 420;
const MIN_CHAT_WIDTH = 320;
const MAX_CHAT_WIDTH = 800;

const clampChatWidth = (value: number): number =>
  Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, Math.round(value)));

function readStoredChatWidth(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHAT_WIDTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return null;
    return clampChatWidth(parsed);
  } catch {
    return null;
  }
}

function writeStoredChatWidth(value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(value));
  } catch {
    // Storage quota / disabled — silently ignore; persistence is best-effort.
  }
}

/**
 * Chat-first layout. The header spans the full window above both the chat
 * body and the canvas. Before any canvas content exists, the chat body fills
 * the row beneath the header; once the first intro or section arrives,
 * the canvas slides in from the right and the chat shrinks to a
 * user-resizable column (default 420px, persisted in localStorage).
 *
 * The chat body is kept at a stable tree position across this transition,
 * which is critical: a structured stream's first chunk flips `hasContent`,
 * and remounting the body would tear down the live `useChat` subscription.
 */
function AgentLayout() {
  const { hasContent, isCanvasOpen } = useDiscoveryCanvasStore();
  const {
    chat,
    debugChunks,
    isDebugOpen,
    debugForMessageId,
    debugLiveMode,
    toggleDebugLive,
    setDebugOpen,
  } = useChatPanel();
  const canvasVisible = hasContent && isCanvasOpen;
  const rightPanelVisible = canvasVisible || isDebugOpen;
  const [chatWidth, setChatWidth] = useState<number>(DEFAULT_CHAT_WIDTH);
  const debugMessage = chat.messages.find(
    (message) => message.id === debugForMessageId,
  );
  const visibleDebugChunks = useMemo(() => {
    if (!debugLiveMode) {
      return debugMessage?.debug ?? [];
    }

    const fromMessages = chat.messages.flatMap((message) =>
      message.role === "assistant" && message.debug?.length
        ? message.debug
        : [],
    );

    if (chat.isStreaming) {
      return fromMessages.length > 0
        ? [...fromMessages, ...debugChunks]
        : debugChunks;
    }

    return fromMessages.length > 0 ? fromMessages : debugChunks;
  }, [
    chat.isStreaming,
    chat.messages,
    debugChunks,
    debugLiveMode,
    debugMessage?.debug,
  ]);
  const hasSnapshot = Boolean(debugForMessageId ?? chat.lastAssistantId);
  const debugViewKey = debugLiveMode
    ? "live"
    : (debugForMessageId ?? "snapshot");

  // Hydrate from storage on mount.
  useEffect(() => {
    const stored = readStoredChatWidth();
    if (stored != null) setChatWidth(stored);
  }, []);

  // Debounce persistence so a single drag doesn't hammer localStorage with
  // every pointermove event.
  useEffect(() => {
    const id = window.setTimeout(() => writeStoredChatWidth(chatWidth), 150);
    return () => window.clearTimeout(id);
  }, [chatWidth]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
      <ChatHeader />
      <div
        className={
          rightPanelVisible
            ? "grid h-full min-h-0 overflow-hidden"
            : "flex min-h-0 w-full"
        }
        style={
          rightPanelVisible
            ? { gridTemplateColumns: `${chatWidth}px 1fr` }
            : undefined
        }
      >
        <div
          className={
            rightPanelVisible
              ? "flex min-h-0 flex-col border-r border-border"
              : "flex min-h-0 flex-1 flex-col"
          }
        >
          <ChatBody />
        </div>
        {rightPanelVisible ? (
          <div className="canvas-enter relative h-full min-h-0 overflow-hidden">
            <ChatResizeHandle chatWidth={chatWidth} onResize={setChatWidth} />
            {isDebugOpen ? (
              <DebugPanel
                viewKey={debugViewKey}
                chunks={visibleDebugChunks}
                isStreaming={chat.isStreaming && debugLiveMode}
                isLive={debugLiveMode}
                onToggleLive={toggleDebugLive}
                hasSnapshot={hasSnapshot}
                onClose={() => setDebugOpen(false)}
              />
            ) : (
              <Canvas />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Vertical drag handle straddling the chat/canvas border. Visible as a
 * subtle accent only on hover/drag so it doesn't compete with the static
 * border line. Uses pointer-capture so the drag continues even if the
 * pointer briefly leaves the strip.
 */
function ChatResizeHandle({
  chatWidth,
  onResize,
}: {
  chatWidth: number;
  onResize: (next: number) => void;
}) {
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);

  const beginDrag = useCallback(
    (clientX: number, pointerId: number, target: Element) => {
      dragStateRef.current = { startX: clientX, startWidth: chatWidth };
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Older Safari without pointer-capture support — drag still works
        // via the move/up handlers, just without explicit capture.
      }
      setIsDragging(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [chatWidth],
  );

  const endDrag = useCallback(() => {
    dragStateRef.current = null;
    setIsDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    beginDrag(e.clientX, e.pointerId, e.currentTarget);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state) return;
    const next = clampChatWidth(state.startWidth + (e.clientX - state.startX));
    onResize(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignored — see beginDrag
    }
    endDrag();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Keyboard accessibility: arrow keys nudge the divider by 16px.
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onResize(clampChatWidth(chatWidth - 16));
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onResize(clampChatWidth(chatWidth + 16));
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: <hr> is not interactive; this is a draggable resize affordance
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat panel"
      aria-valuenow={chatWidth}
      aria-valuemin={MIN_CHAT_WIDTH}
      aria-valuemax={MAX_CHAT_WIDTH}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={`absolute -left-1 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center focus-visible:outline-none ${isDragging ? "bg-primary/20" : "hover:bg-primary/15"}`}
    >
      <span
        className={`block h-8 w-0.5 rounded-full transition-colors ${isDragging ? "bg-primary" : "bg-transparent group-hover:bg-primary/40"}`}
      />
    </div>
  );
}
