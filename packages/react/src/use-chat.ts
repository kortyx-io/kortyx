"use client";

import type { StreamChunk } from "@kortyx/stream/browser";
import { type RefObject, useEffect, useRef, useState } from "react";
import { buildAssistantMessage } from "./build-assistant-message";
import { type ChatStorage, createBrowserChatStorage } from "./chat-storage";
import type { ChatTransport, OutgoingChatMessage } from "./chat-transport";
import type { ChatMsg, ContentPiece, HumanInputPiece } from "./chat-types";
import { createLiveChatPieces } from "./create-live-chat-pieces";
import {
  toHumanInputPiece as defaultToHumanInputPiece,
  type ToHumanInputPiece,
} from "./to-human-input-piece";
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

type DefaultChatContext = Record<string, unknown>;

type ChatTraceMetadata = {
  traceId: string;
  spanId: string;
  runId: string;
};

export type PrepareContextMessagesArgs<TContext = DefaultChatContext> = {
  messages: ChatMsg[];
  sessionId: string;
  workflowId: string;
  reason: "send" | "resume";
  context: TContext;
};

export type PrepareContextMessages<TContext = DefaultChatContext> = (
  args: PrepareContextMessagesArgs<TContext>,
) => OutgoingChatMessage[] | Promise<OutgoingChatMessage[]>;

export type UseChatValue = {
  messages: ChatMsg[];
  isStreaming: boolean;
  canAbort: boolean;
  error: Error | null;
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
  respondToInterrupt: (
    piece: HumanInputPiece,
    response?: { selected?: string[] | undefined; text?: string | undefined },
  ) => Promise<void> | void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
  clearMessages: () => void;
  resetSession: () => void;
  resetChat: () => void;
  clearChat: () => void;
  abort: () => void;
  clearError: () => void;
  includeHistory: boolean;
  setIncludeHistory: React.Dispatch<React.SetStateAction<boolean>>;
};

export type UseChatOptions<TContext = DefaultChatContext> = {
  transport: ChatTransport<TContext>;
  storage?: ChatStorage<ChatMsg> | undefined;
  createId?: (() => string) | undefined;
  context?: TContext | undefined;
  prepareContextMessages?: PrepareContextMessages<TContext> | undefined;
  toHumanInputPiece?: ToHumanInputPiece | undefined;
};

const defaultStorage = createBrowserChatStorage<ChatMsg>();

function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
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

  for (const message of [...args.messages].reverse()) {
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

export function useChat<TContext = DefaultChatContext>(
  options: UseChatOptions<TContext>,
): UseChatValue {
  const resolvedStorage = options.storage ?? defaultStorage;
  const transportRef = useLatestRef(options.transport);
  const storageRef = useLatestRef(resolvedStorage);
  const toHumanInputPieceRef = useLatestRef(
    options.toHumanInputPiece ?? defaultToHumanInputPiece,
  );
  const requestContext =
    options.context ?? ({} as unknown as NonNullable<TContext>);
  const createId = useRef(options.createId ?? defaultCreateId).current;

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [streamContentPieces, setStreamContentPieces] = useState<
    ContentPiece[]
  >([]);
  const [lastAssistantId, setLastAssistantId] = useState<string | null>(null);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [workflowId, setWorkflowId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [didHydrateStorage, setDidHydrateStorage] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { streamDebug, clearStreamDebug, createRecorder } =
    useChatStreamDebug();
  const { applyStreamChunk, clear: clearStructuredStreams } =
    useStructuredStreams<Record<string, unknown>>({
      createId,
    });

  useEffect(() => {
    let cancelled = false;
    const storage = resolvedStorage;

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
  }, [resolvedStorage]);

  useEffect(() => {
    if (!didHydrateStorage) return;
    const storage = storageRef.current;

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
    storageRef,
    workflowId,
  ]);

  const clearActiveStream = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
    setMessages([]);
    setStreamContentPieces([]);
    clearStreamDebug();
    clearStructuredStreams();
    setLastAssistantId(null);
  };

  const clearMessages = () => {
    clearActiveStream();
    void storageRef.current.clearMessages();
  };

  const resetSession = () => {
    setSessionId(null);
  };

  const resetChat = () => {
    clearActiveStream();
    resetSession();
    setError(null);
    void storageRef.current.clearMessages();
  };

  const clearChat = resetChat;

  const clearError = () => {
    setError(null);
  };

  const abort = () => {
    abortControllerRef.current?.abort();
  };

  const persistSessionId = (sid: string) => {
    setSessionId(sid);
  };

  const resolveSessionId = () => {
    const sid = sessionId ?? createId();
    if (!sessionId) persistSessionId(sid);
    return sid;
  };

  const toOutgoingHistoryMessage = (message: ChatMsg): OutgoingChatMessage => ({
    role: message.role,
    content: message.content,
  });

  const prepareMessagesToSend = async (args: {
    sid: string;
    outgoingMessage: OutgoingChatMessage;
    reason: "send" | "resume";
  }): Promise<OutgoingChatMessage[]> => {
    const prepared = options.prepareContextMessages
      ? await options.prepareContextMessages({
          messages,
          sessionId: args.sid,
          workflowId,
          reason: args.reason,
          context: requestContext,
        })
      : includeHistory
        ? messages.map(toOutgoingHistoryMessage)
        : [];

    return [...prepared, args.outgoingMessage];
  };

  const streamAssistantResponse = async (args: {
    sid: string;
    messagesToSend: OutgoingChatMessage[];
    debugLabel: string;
    openDebugOnInterrupt?: boolean;
    signal: AbortSignal;
  }) => {
    clearStructuredStreams();
    setStreamContentPieces([]);

    const debug = createRecorder(`${args.debugLabel} sessionId=${args.sid}`);
    let currentTrace: ChatTraceMetadata | undefined;
    let completedTrace: ChatTraceMetadata | undefined;
    const pieces = createLiveChatPieces({
      createId,
      onChange: setStreamContentPieces,
      structuredStreams: {
        applyStreamChunk,
      },
      toHumanInputPiece: (chunk) =>
        toHumanInputPieceRef.current({
          chunk,
          createId,
        }),
    });

    await transportRef.current.stream({
      sessionId: args.sid,
      workflowId,
      messages: args.messagesToSend,
      context: requestContext,
      signal: args.signal,
      onChunk: (chunk: StreamChunk) => {
        debug.push(chunk);

        if (chunk.type === "session") {
          if (typeof chunk.sessionId === "string") {
            persistSessionId(chunk.sessionId);
          }
          return;
        }

        if (chunk.type === "trace") {
          if (
            typeof chunk.traceId === "string" &&
            typeof chunk.spanId === "string" &&
            typeof chunk.runId === "string"
          ) {
            currentTrace = {
              traceId: chunk.traceId,
              spanId: chunk.spanId,
              runId: chunk.runId,
            };
          }
          return;
        }

        if (chunk.type === "error") {
          setError(new Error(chunk.message));
        }

        if (chunk.type === "done") {
          completedTrace = currentTrace;
          currentTrace = undefined;
        }

        return pieces.processChunk(chunk, {
          openDebugOnInterrupt: args.openDebugOnInterrupt,
        });
      },
    });

    if (args.signal.aborted) return;

    const assistant = buildAssistantMessage({
      createId,
      pieces: pieces.getPieces(),
      debug: debug.getAll(),
      trace: completedTrace ?? currentTrace,
    });
    setMessages((prev) => [...prev, assistant]);
    setLastAssistantId(assistant.id);
    clearStructuredStreams();
    setStreamContentPieces([]);
    clearStreamDebug();
  };

  const isAbortError = (value: unknown, signal: AbortSignal): boolean => {
    if (signal.aborted) return true;
    if (!(value instanceof Error)) return false;
    return value.name === "AbortError";
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
    setError(null);
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
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

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
      const messagesToSend = await prepareMessagesToSend({
        sid,
        outgoingMessage: outgoing,
        reason: "resume",
      });

      await streamAssistantResponse({
        sid,
        messagesToSend,
        debugLabel: "runChat (resume)",
        signal: abortController.signal,
      });
    } catch (err) {
      if (isAbortError(err, abortController.signal)) return;
      const nextError = err instanceof Error ? err : new Error(String(err));
      setError(nextError);
      throw err;
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsStreaming(false);
    }
  };

  const respondToInterrupt = async (
    piece: HumanInputPiece,
    response?: { selected?: string[] | undefined; text?: string | undefined },
  ) => {
    const text = response?.text;
    const selected =
      response?.selected ??
      (typeof text === "string" && text.length > 0 ? [text] : []);

    return respondToHumanInput({
      resumeToken: piece.resumeToken,
      requestId: piece.requestId,
      selected,
      ...(text !== undefined ? { text } : {}),
    });
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || isStreaming) return;
    setError(null);

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
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const sid = resolveSessionId();
      const messagesToSend = await prepareMessagesToSend({
        sid,
        outgoingMessage: { role: "user" as const, content },
        reason: "send",
      });
      await streamAssistantResponse({
        sid,
        messagesToSend,
        debugLabel: "runChat (send)",
        openDebugOnInterrupt: true,
        signal: abortController.signal,
      });
    } catch (err) {
      if (isAbortError(err, abortController.signal)) return;
      const nextError = err instanceof Error ? err : new Error(String(err));
      setError(nextError);
      throw err;
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsStreaming(false);
    }
  };

  return {
    messages,
    isStreaming,
    canAbort: isStreaming,
    error,
    streamContentPieces,
    streamDebug,
    lastAssistantId,
    workflowId,
    setWorkflowId,
    send,
    respondToHumanInput,
    respondToInterrupt,
    setMessages,
    clearMessages,
    resetSession,
    resetChat,
    clearChat,
    abort,
    clearError,
    includeHistory,
    setIncludeHistory,
  };
}
