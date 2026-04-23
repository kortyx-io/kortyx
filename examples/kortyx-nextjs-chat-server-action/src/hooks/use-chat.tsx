"use client";

import {
  type UseStructuredStreamsOptions,
  type UseStructuredStreamsResult,
  useStructuredStreams,
} from "@kortyx/react";
import type { StreamChunk } from "kortyx/browser";
import { useEffect, useRef, useState } from "react";
import { useChatStreamDebug } from "@/hooks/use-chat-stream-debug";
import { buildAssistantMessage } from "@/lib/build-assistant-message";
import { type ChatStorage, createBrowserChatStorage } from "@/lib/chat-storage";
import {
  type ChatTransport,
  createServerActionChatTransport,
  type OutgoingChatMessage,
} from "@/lib/chat-transport";
import type { ChatMsg, ContentPiece, HumanInputPiece } from "@/lib/chat-types";
import { createChatPieceAccumulator } from "@/lib/create-chat-piece-accumulator";
import { findActiveTextInterrupt } from "@/lib/find-active-text-interrupt";
import { toHumanInputPiece } from "@/lib/to-human-input-piece";

const defaultTransport = createServerActionChatTransport();
const defaultStorage = createBrowserChatStorage();

const defaultCreateId = () => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const defaultOpenDebugPanel = () => {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("chat:open-debug"));
    }
  } catch {}
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

type StructuredStreamsHook = (
  options?: UseStructuredStreamsOptions<Record<string, unknown>> | undefined,
) => UseStructuredStreamsResult<Record<string, unknown>>;
type ChatStreamDebugHook = typeof useChatStreamDebug;

export type UseChatOptions = {
  transport?: ChatTransport | undefined;
  storage?: ChatStorage | undefined;
  useStructuredStreamsImpl?: StructuredStreamsHook | undefined;
  useChatStreamDebugImpl?: ChatStreamDebugHook | undefined;
  mapInterruptChunk?:
    | ((args: {
        chunk: StreamChunk;
        createId: () => string;
      }) => HumanInputPiece)
    | undefined;
  buildAssistantMessageImpl?:
    | ((args: {
        createId: () => string;
        pieces: ContentPiece[];
        debug: StreamChunk[];
      }) => ChatMsg)
    | undefined;
  createId?: (() => string) | undefined;
  openDebugPanel?: (() => void) | undefined;
};

function useInitialValue<T>(value: T): T {
  const ref = useRef<T | undefined>(undefined);

  if (ref.current === undefined) {
    ref.current = value;
  }

  return ref.current;
}

export function useChat(options?: UseChatOptions | undefined): UseChatValue {
  const transport = useInitialValue(options?.transport ?? defaultTransport);
  const storage = useInitialValue(options?.storage ?? defaultStorage);
  const createId = useInitialValue(options?.createId ?? defaultCreateId);
  const openDebugPanel = useInitialValue(
    options?.openDebugPanel ?? defaultOpenDebugPanel,
  );
  const mapInterruptChunk = useInitialValue(
    options?.mapInterruptChunk ?? toHumanInputPiece,
  );
  const buildAssistantMessageImpl = useInitialValue(
    options?.buildAssistantMessageImpl ?? buildAssistantMessage,
  );
  const useStructuredStreamsImpl = useInitialValue(
    options?.useStructuredStreamsImpl ??
      (useStructuredStreams as StructuredStreamsHook),
  );
  const useChatStreamDebugImpl = useInitialValue(
    options?.useChatStreamDebugImpl ?? useChatStreamDebug,
  );

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
    useChatStreamDebugImpl();
  const { applyStreamChunk, clear: clearStructuredStreams } =
    useStructuredStreamsImpl({
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
        mapInterruptChunk({
          chunk,
          createId,
        }),
      openDebugPanel,
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

    const assistant = buildAssistantMessageImpl({
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
        openDebugOnStart: true,
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
