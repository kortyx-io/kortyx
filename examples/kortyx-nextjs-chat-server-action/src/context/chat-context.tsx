"use client";

import type { StreamChunk } from "kortyx/browser";
import type React from "react";
import { createContext, useEffect, useState } from "react";
import { useChatStreamDebug } from "@/hooks/use-chat-stream-debug";
import { useStructuredStreams } from "@/hooks/use-structured-streams";
import { type ChatStorage, createBrowserChatStorage } from "@/lib/chat-storage";
import {
  createServerActionChatTransport,
  type OutgoingChatMessage,
} from "@/lib/chat-transport";
import type { ChatMsg, ContentPiece } from "@/lib/chat-types";
import { createChatPieceAccumulator } from "@/lib/create-chat-piece-accumulator";
import { findActiveTextInterrupt } from "@/lib/find-active-text-interrupt";
import { toHumanInputPiece } from "@/lib/to-human-input-piece";

const chatTransport = createServerActionChatTransport();
const defaultChatStorage = createBrowserChatStorage();

export type ChatContextValue = {
  messages: ChatMsg[];
  isStreaming: boolean;
  streamContentPieces: ContentPiece[];
  streamDebug: StreamChunk[];
  lastAssistantId: string | null;
  workflowId: string;
  setWorkflowId: React.Dispatch<React.SetStateAction<string>>;
  send: (text: string) => Promise<void> | void;
  respondToHumanInput: (args: {
    resumeToken: string;
    requestId: string;
    selected: string[];
    text?: string;
  }) => Promise<void> | void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
  clearChat: () => void;
  includeHistory: boolean;
  setIncludeHistory: React.Dispatch<React.SetStateAction<boolean>>;
};

export const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({
  children,
  storage = defaultChatStorage,
}: {
  children: React.ReactNode;
  storage?: ChatStorage;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContentPieces, setStreamContentPieces] = useState<
    ContentPiece[]
  >([]);
  const [lastAssistantId, setLastAssistantId] = useState<string | null>(null);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [workflowId, setWorkflowId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [didHydrateStorage, setDidHydrateStorage] = useState(false);
  const { streamDebug, clearStreamDebug, createRecorder } =
    useChatStreamDebug();
  const { applyStreamChunk, clear: clearStructuredStreams } =
    useStructuredStreams({
      createId,
    });

  function createId() {
    try {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
      }
    } catch {}
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve(storage.load()).then((storedState) => {
      if (cancelled) return;

      if (typeof storedState.sessionId === "string") {
        setSessionId(storedState.sessionId);
      }
      if (typeof storedState.workflowId === "string") {
        setWorkflowId(storedState.workflowId);
      }
      if (typeof storedState.includeHistory === "boolean") {
        setIncludeHistory(storedState.includeHistory);
      }
      if (
        Array.isArray(storedState.messages) &&
        storedState.messages.length > 0
      ) {
        setMessages(storedState.messages);
      }

      setDidHydrateStorage(true);
    });

    return () => {
      cancelled = true;
    };
  }, [storage]);

  useEffect(() => {
    if (!didHydrateStorage) return;

    void storage.save({
      sessionId,
      workflowId,
      includeHistory,
      messages,
    });
  }, [
    didHydrateStorage,
    includeHistory,
    messages,
    sessionId,
    storage,
    workflowId,
  ]);

  const clearChat = () => {
    setMessages([]);
    setStreamContentPieces([]);
    clearStreamDebug();
    clearStructuredStreams();
    setLastAssistantId(null);
    void storage.clearMessages();
  };

  const persistSessionId = (sid: string) => {
    setSessionId(sid);
  };

  const resolveSessionId = () => {
    const sid = sessionId ?? createId();
    if (!sessionId) persistSessionId(sid);
    return sid;
  };

  const openDebugPanel = () => {
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("chat:open-debug"));
      }
    } catch {}
  };

  const buildAssistantMessage = (args: {
    pieces: ContentPiece[];
    debug: StreamChunk[];
  }): ChatMsg => {
    const plainTextContent = args.pieces
      .filter(
        (piece): piece is Extract<ContentPiece, { type: "text" }> =>
          piece.type === "text",
      )
      .map((piece) => piece.content)
      .join("");

    const base = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role: "assistant" as const,
      content: plainTextContent,
      debug: args.debug,
    };

    return args.pieces.length > 0
      ? { ...base, contentPieces: args.pieces }
      : base;
  };

  const streamAssistantResponse = async (args: {
    sid: string;
    messagesToSend: OutgoingChatMessage[];
    debugLabel: string;
    openDebugOnStart?: boolean;
    openDebugOnInterrupt?: boolean;
  }) => {
    if (args.openDebugOnStart) openDebugPanel();

    clearStructuredStreams();
    setStreamContentPieces([]);

    const debug = createRecorder(`${args.debugLabel} sessionId=${args.sid}`);
    const pieces = createChatPieceAccumulator({
      createId,
      onChange: setStreamContentPieces,
      structuredStreams: {
        applyStreamChunk,
      },
      toHumanInputPiece: (chunk) =>
        toHumanInputPiece({
          chunk,
          createId,
        }),
      openDebugPanel,
    });

    await chatTransport.stream({
      sessionId: args.sid,
      workflowId,
      messages: args.messagesToSend,
      onChunk: (chunk: StreamChunk) => {
        debug.push(chunk);

        if (chunk.type === "session") {
          if (typeof chunk.sessionId === "string") {
            persistSessionId(chunk.sessionId);
          }
          return;
        }

        return pieces.processChunk(chunk, {
          openDebugOnInterrupt: args.openDebugOnInterrupt,
        });
      },
    });

    const assistant = buildAssistantMessage({
      pieces: pieces.getPieces(),
      debug: debug.getAll(),
    });
    setMessages((prev) => [...prev, assistant]);
    setLastAssistantId(assistant.id);
    clearStructuredStreams();
    setStreamContentPieces([]);
    clearStreamDebug();
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || isStreaming) return;

    const activeTextInterrupt = findActiveTextInterrupt({
      messages,
      streamContentPieces,
    });

    if (activeTextInterrupt) {
      await respondToHumanInput({
        resumeToken: activeTextInterrupt.resumeToken,
        requestId: activeTextInterrupt.requestId,
        selected: [content],
        text: content,
      });
      return;
    }

    const userId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userMsg: ChatMsg = { id: userId, role: "user", content };
    setMessages((prev) => [...prev, userMsg]);

    setIsStreaming(true);
    setStreamContentPieces([]);
    clearStreamDebug();
    clearStructuredStreams();

    try {
      const sid = resolveSessionId();
      const history = includeHistory
        ? messages.map((message) => ({
            role: message.role,
            content: message.content,
          }))
        : [];
      const messagesToSend = [...history, { role: "user" as const, content }];
      await streamAssistantResponse({
        sid,
        messagesToSend,
        debugLabel: "runChat (send)",
        openDebugOnInterrupt: true,
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const respondToHumanInput = async ({
    resumeToken,
    requestId,
    selected,
    text,
  }: {
    resumeToken: string;
    requestId: string;
    selected: string[];
    text?: string;
  }) => {
    if (isStreaming) return;
    const label: string =
      typeof text === "string" && text.length > 0
        ? text
        : selected.length > 0
          ? selected.length === 1
            ? (selected[0] as string)
            : selected.join(", ")
          : "(selection)";
    const userId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userMsg: ChatMsg = { id: userId, role: "user", content: label };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamContentPieces([]);
    clearStreamDebug();
    clearStructuredStreams();

    try {
      const resumePayload: Record<string, unknown> = {
        resume: { token: resumeToken, requestId, selected },
      };
      const outgoing = {
        role: "user" as const,
        content: label,
        metadata: resumePayload,
      };
      const sid = resolveSessionId();
      const history = includeHistory
        ? messages.map((message) => ({
            role: message.role,
            content: message.content,
          }))
        : [];
      const messagesToSend = [...history, outgoing];

      await streamAssistantResponse({
        sid,
        messagesToSend,
        debugLabel: "runChat (resume)",
        openDebugOnStart: true,
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const value: ChatContextValue = {
    messages,
    isStreaming,
    streamContentPieces,
    streamDebug,
    lastAssistantId,
    workflowId,
    setWorkflowId,
    send,
    respondToHumanInput,
    setMessages,
    clearChat,
    includeHistory,
    setIncludeHistory,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
