"use client";

import type { StreamChunk } from "@kortyx/stream/browser";
import { useEffect, useRef, useState } from "react";
import { buildAssistantMessage } from "./build-assistant-message";
import { type ChatStorage, createBrowserChatStorage } from "./chat-storage";
import type { ChatTransport, OutgoingChatMessage } from "./chat-transport";
import type { ChatMsg, ContentPiece, HumanInputPiece } from "./chat-types";
import { createLiveChatPieces } from "./create-live-chat-pieces";
import { toHumanInputPiece } from "./to-human-input-piece";
import { useChatStreamDebug } from "./use-chat-stream-debug";
import { useStructuredStreams } from "./use-structured-streams";

const defaultCreateId = () => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export type UseChatValue = {
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

export type UseChatOptions = {
  transport: ChatTransport;
  storage?: ChatStorage<ChatMsg> | undefined;
  createId?: (() => string) | undefined;
};

const defaultStorage = createBrowserChatStorage<ChatMsg>();

function useInitialValue<T>(value: T): T {
  const ref = useRef<T | undefined>(undefined);

  if (ref.current === undefined) {
    ref.current = value;
  }

  return ref.current;
}

function findActiveTextInterrupt(args: {
  messages: ChatMsg[];
  streamContentPieces: ContentPiece[];
}): HumanInputPiece | undefined {
  const liveInterrupt = args.streamContentPieces.find(
    (piece): piece is HumanInputPiece =>
      piece.type === "interrupt" && piece.kind === "text",
  );
  if (liveInterrupt) return liveInterrupt;

  for (let i = args.messages.length - 1; i >= 0; i -= 1) {
    const message = args.messages[i];
    if (!message) continue;
    if (message.role !== "assistant" || !message.contentPieces) continue;

    const messageInterrupt = [...message.contentPieces]
      .reverse()
      .find(
        (piece): piece is HumanInputPiece =>
          piece.type === "interrupt" && piece.kind === "text",
      );
    if (messageInterrupt) return messageInterrupt;
  }

  return undefined;
}

export function useChat(options: UseChatOptions): UseChatValue {
  const transport = useInitialValue(options.transport);
  const storage = useInitialValue(options.storage ?? defaultStorage);
  const createId = useInitialValue(options.createId ?? defaultCreateId);

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
    useStructuredStreams<Record<string, unknown>>({
      createId,
    });

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

  const streamAssistantResponse = async (args: {
    sid: string;
    messagesToSend: OutgoingChatMessage[];
    debugLabel: string;
    openDebugOnInterrupt?: boolean;
  }) => {
    clearStructuredStreams();
    setStreamContentPieces([]);

    const debug = createRecorder(`${args.debugLabel} sessionId=${args.sid}`);
    const pieces = createLiveChatPieces({
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
    });

    await transport.stream({
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
      createId,
      pieces: pieces.getPieces(),
      debug: debug.getAll(),
    });
    setMessages((prev) => [...prev, assistant]);
    setLastAssistantId(assistant.id);
    clearStructuredStreams();
    setStreamContentPieces([]);
    clearStreamDebug();
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
    const userId = createId();
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
      });
    } finally {
      setIsStreaming(false);
    }
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

    const userId = createId();
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

  return {
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
}
