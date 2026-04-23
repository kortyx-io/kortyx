"use client";

import type { StreamChunk } from "kortyx/browser";
import type React from "react";
import { createContext, useEffect, useState } from "react";
import { useChatStreamDebug } from "@/hooks/use-chat-stream-debug";
import { useStructuredStreams } from "@/hooks/use-structured-streams";
import {
  createApiRouteChatTransport,
  type OutgoingChatMessage,
} from "@/lib/chat-transport";
import type { ChatMsg, ContentPiece, HumanInputPiece } from "@/lib/chat-types";
import { createChatPieceAccumulator } from "@/lib/create-chat-piece-accumulator";
import { findActiveTextInterrupt } from "@/lib/find-active-text-interrupt";

const chatTransport = createApiRouteChatTransport();

const toStoredChatMessage = (value: unknown): ChatMsg | null => {
  if (!value || typeof value !== "object") return null;

  const message = value as Record<string, unknown>;
  const role =
    message.role === "user" || message.role === "assistant"
      ? message.role
      : null;
  const id = typeof message.id === "string" ? message.id : null;
  const content = typeof message.content === "string" ? message.content : "";
  const contentPieces = Array.isArray(message.contentPieces)
    ? (message.contentPieces.filter(Boolean) as ContentPiece[])
    : undefined;

  if (!role || !id) return null;

  return {
    id,
    role,
    content,
    ...(contentPieces ? { contentPieces } : {}),
  };
};

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

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContentPieces, setStreamContentPieces] = useState<
    ContentPiece[]
  >([]);
  const [lastAssistantId, setLastAssistantId] = useState<string | null>(null);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [workflowId, setWorkflowId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { streamDebug, clearStreamDebug, createRecorder } =
    useChatStreamDebug();
  const { applyStreamChunk, clear: clearStructuredStreams } =
    useStructuredStreams({
      createId,
    });

  const STORAGE_MESSAGES_KEY = "chat.messages.v1";
  const STORAGE_INCLUDE_HISTORY_KEY = "chat.includeHistory.v1";

  function createId() {
    try {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
      }
    } catch {}
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        const sid = localStorage.getItem("chat.sessionId");
        if (sid) setSessionId(sid);
        const wid = localStorage.getItem("chat.workflowId");
        if (wid !== null) setWorkflowId(wid);
        const ih = localStorage.getItem(STORAGE_INCLUDE_HISTORY_KEY);
        if (ih === "0") setIncludeHistory(false);
        if (ih === "1") setIncludeHistory(true);

        const rawMsgs = localStorage.getItem(STORAGE_MESSAGES_KEY);
        if (rawMsgs) {
          const parsed = JSON.parse(rawMsgs) as unknown;
          if (Array.isArray(parsed)) {
            const restored = parsed
              .map((item) => toStoredChatMessage(item))
              .filter((message): message is ChatMsg => message !== null);
            if (restored.length > 0) setMessages(restored);
          }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("chat.workflowId", workflowId);
      }
    } catch {}
  }, [workflowId]);

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          STORAGE_INCLUDE_HISTORY_KEY,
          includeHistory ? "1" : "0",
        );
      }
    } catch {}
  }, [includeHistory]);

  useEffect(() => {
    try {
      if (typeof localStorage === "undefined") return;
      const trimmed = messages.slice(-60).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        ...(message.contentPieces
          ? { contentPieces: message.contentPieces }
          : {}),
      }));
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(trimmed));
    } catch {}
  }, [messages]);

  const clearChat = () => {
    setMessages([]);
    setStreamContentPieces([]);
    clearStreamDebug();
    clearStructuredStreams();
    setLastAssistantId(null);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_MESSAGES_KEY);
      }
    } catch {}
  };

  const persistSessionId = (sid: string) => {
    setSessionId(sid);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("chat.sessionId", sid);
      }
    } catch {}
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

  const toHumanInputPiece = (chunk: StreamChunk): HumanInputPiece => {
    interface HumanInputStreamChunk {
      type: "interrupt";
      requestId: string | undefined;
      resumeToken: string | undefined;
      input?: {
        kind?: "text" | "choice" | "multi-choice";
        question?: string;
        multiple?: boolean;
        options?: Array<{
          id?: string | number;
          label?: string;
          description?: string;
        }>;
      };
    }

    const hi = chunk as unknown as HumanInputStreamChunk;
    const input = hi.input ?? {};
    const kind = input.kind || (input.multiple ? "multi-choice" : "choice");
    const isText = kind === "text";

    const question = isText
      ? input.question
      : typeof input.question === "string"
        ? input.question
        : "Please choose";

    const optionsSrc = Array.isArray(input.options) ? input.options : [];
    const optionsArr: Array<{
      id: string;
      label: string;
      description?: string;
    }> = optionsSrc
      .map((option) => ({
        id: String(option.id ?? ""),
        label: String(option.label ?? ""),
        ...(typeof option.description === "string" && option.description
          ? { description: option.description }
          : {}),
      }))
      .filter((option) => option.id && option.label);

    return {
      id: createId(),
      type: "interrupt",
      resumeToken: String(hi.resumeToken ?? ""),
      requestId: String(hi.requestId ?? ""),
      kind,
      ...(question !== undefined ? { question } : {}),
      multiple: Boolean(input.multiple),
      options: optionsArr,
    };
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
      toHumanInputPiece,
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
