"use client";

import type { StreamChunk } from "@kortyx/stream/browser";
import { type RefObject, useEffect, useRef, useState } from "react";
import { buildAssistantMessage } from "./build-assistant-message";
import { type ChatStorage, createBrowserChatStorage } from "./chat-storage";
import type {
  ChatTransport,
  CheckpointSummary,
  ForkCheckpointResult,
  ForkPendingRequest,
  OutgoingChatMessage,
  RollbackCheckpointResult,
} from "./chat-transport";
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
  checkpoints: CheckpointSummary[];
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
  checkpointForMessage: (messageId: string) => string | null;
  rollbackTo: (id: string) => Promise<RollbackCheckpointResult>;
  fork: (
    id: string,
    options?: { newSessionId?: string },
  ) => Promise<ForkCheckpointResult>;
  regenerate: (assistantMessageId: string) => Promise<void>;
  regenerateFromCheckpoint: (checkpointId: string) => Promise<void>;
  retryWithEdit: (
    assistantMessageId: string,
    newUserContent: string,
  ) => Promise<void>;
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
  const liveInterrupt = [...args.streamContentPieces]
    .reverse()
    .find(
      (piece): piece is HumanInputPiece =>
        piece.type === "interrupt" && piece.kind === "text",
    );
  if (liveInterrupt) return liveInterrupt;

  const latestMessage = args.messages.at(-1);
  if (latestMessage?.role !== "assistant" || !latestMessage.contentPieces) {
    return undefined;
  }

  return [...latestMessage.contentPieces]
    .reverse()
    .find(
      (piece): piece is HumanInputPiece =>
        piece.type === "interrupt" && piece.kind === "text",
    );
}

function trimMessagesToCheckpoint(args: {
  messages: ChatMsg[];
  turnIndex: number;
}): ChatMsg[] {
  const hasCheckpointMetadata = args.messages.some(
    (message) => typeof message.checkpointTurnIndex === "number",
  );
  if (!hasCheckpointMetadata && args.turnIndex > 0) return args.messages;

  const keepThroughIndex = args.messages.reduce((lastIndex, message, index) => {
    return typeof message.checkpointTurnIndex === "number" &&
      message.checkpointTurnIndex <= args.turnIndex
      ? index
      : lastIndex;
  }, -1);

  return keepThroughIndex >= 0
    ? args.messages.slice(0, keepThroughIndex + 1)
    : [];
}

function applyForkedPendingRequests(args: {
  messages: ChatMsg[];
  pendingRequests: ForkPendingRequest[];
}): ChatMsg[] {
  if (args.pendingRequests.length === 0) return args.messages;

  const interruptPositions = args.messages.flatMap((message, messageIndex) =>
    (message.contentPieces ?? []).flatMap((piece, pieceIndex) =>
      piece.type === "interrupt" ? [{ messageIndex, pieceIndex }] : [],
    ),
  );
  const positionsToPatch = interruptPositions.slice(
    -args.pendingRequests.length,
  );
  if (positionsToPatch.length === 0) return args.messages;

  return args.messages.map((message, messageIndex) => {
    if (!message.contentPieces) return message;

    let changed = false;
    const contentPieces = message.contentPieces.map((piece, pieceIndex) => {
      if (piece.type !== "interrupt") return piece;
      const patchIndex = positionsToPatch.findIndex(
        (position) =>
          position.messageIndex === messageIndex &&
          position.pieceIndex === pieceIndex,
      );
      const pending = args.pendingRequests[patchIndex];
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
      };
    });

    return changed ? { ...message, contentPieces } : message;
  });
}

function latestAssistantMessageId(messages: ChatMsg[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === "assistant") return message.id;
  }
  return null;
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
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [workflowId, setWorkflowId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [didHydrateStorage, setDidHydrateStorage] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { streamDebug, clearStreamDebug, createRecorder } =
    useChatStreamDebug();
  const {
    applyStreamChunk,
    clear: clearStructuredStreams,
    delete: deleteStructuredStream,
  } = useStructuredStreams<Record<string, unknown>>({
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
    const nextLastAssistantId = latestAssistantMessageId(messages);
    if (lastAssistantId !== nextLastAssistantId) {
      setLastAssistantId(nextLastAssistantId);
    }
  }, [lastAssistantId, messages]);

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
    setCheckpoints([]);
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
    setCheckpoints([]);
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
    baseMessages?: ChatMsg[] | undefined;
  }): Promise<OutgoingChatMessage[]> => {
    const baseMessages = args.baseMessages ?? messages;
    const prepared = options.prepareContextMessages
      ? await options.prepareContextMessages({
          messages: baseMessages,
          sessionId: args.sid,
          workflowId,
          reason: args.reason,
          context: requestContext,
        })
      : includeHistory
        ? baseMessages.map(toOutgoingHistoryMessage)
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
    let currentCheckpoint:
      | {
          id: string;
          turnIndex: number;
        }
      | undefined;
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

        if (chunk.type === "checkpoint") {
          currentCheckpoint = {
            id: chunk.id,
            turnIndex: chunk.turnIndex,
          };
          setCheckpoints((prev) => {
            const next = {
              id: chunk.id,
              sessionId: chunk.sessionId,
              turnIndex: chunk.turnIndex,
              createdAt: Date.now(),
              nodes: [],
              workflow: workflowId,
              ...(chunk.label ? { label: chunk.label } : {}),
            } satisfies CheckpointSummary;
            return [...prev.filter((item) => item.id !== chunk.id), next].sort(
              (a, b) => a.turnIndex - b.turnIndex,
            );
          });
          return;
        }

        if (chunk.type === "structured-data-invalidated") {
          deleteStructuredStream(chunk.streamId);
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
      checkpoint: currentCheckpoint,
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

  const respondToHumanInputFromBase = async ({
    resumeToken,
    requestId,
    selected,
    text,
    baseMessages,
  }: {
    resumeToken: string;
    requestId: string;
    selected: string[];
    text?: string;
    baseMessages?: ChatMsg[] | undefined;
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
    const userMsg: ChatMsg = {
      id: userId,
      role: "user",
      content: label,
      source: {
        type: "interrupt-response",
        resumeToken,
        requestId,
        selected,
        ...(text !== undefined ? { text } : {}),
      },
    };
    setMessages([...(baseMessages ?? messages), userMsg]);
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
        baseMessages,
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

  const respondToHumanInput = async (args: {
    resumeToken: string;
    requestId: string;
    selected: string[];
    text?: string;
  }) => respondToHumanInputFromBase(args);

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

  const sendFromBase = async (
    text: string,
    baseMessages?: ChatMsg[] | undefined,
  ) => {
    const content = text.trim();
    if (!content || isStreaming) return;
    setError(null);

    const activeTextInterrupt = findActiveTextInterrupt({
      messages: baseMessages ?? messages,
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
    const userMsg: ChatMsg = {
      id: userId,
      role: "user",
      content,
    };
    setMessages([...(baseMessages ?? messages), userMsg]);

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
        baseMessages,
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

  const send = async (text: string) => sendFromBase(text);

  const requireCheckpointTransport = () => {
    const transport = transportRef.current;
    if (
      !transport.listCheckpoints ||
      !transport.rollbackTo ||
      !transport.fork
    ) {
      throw new Error(
        "Checkpoint helpers require a transport with checkpoint methods.",
      );
    }
    return transport;
  };

  const refreshCheckpoints = async (sid: string) => {
    const transport = requireCheckpointTransport();
    const next = await transport.listCheckpoints!(sid);
    setCheckpoints(next);
    return next;
  };

  const applyStructuredInvalidations = (streamIds: string[]) => {
    for (const streamId of streamIds) {
      deleteStructuredStream(streamId);
    }
  };

  const rollbackTo = async (id: string): Promise<RollbackCheckpointResult> => {
    if (isStreaming) {
      throw new Error("Cannot rollback while a stream is active.");
    }
    const transport = requireCheckpointTransport();
    const result = await transport.rollbackTo!(id);
    applyStructuredInvalidations(result.invalidatedStructuredStreamIds);
    const refreshedCheckpoints = await refreshCheckpoints(result.sessionId);
    const target = refreshedCheckpoints.find(
      (checkpoint) => checkpoint.id === result.head,
    );

    if (target) {
      setMessages((current) => {
        return trimMessagesToCheckpoint({
          messages: current,
          turnIndex: target.turnIndex,
        });
      });
    }

    return result;
  };

  const fork = async (
    id: string,
    options?: { newSessionId?: string },
  ): Promise<ForkCheckpointResult> => {
    if (isStreaming) {
      throw new Error("Cannot fork while a stream is active.");
    }
    const transport = requireCheckpointTransport();
    const sid = resolveSessionId();
    let availableCheckpoints =
      checkpoints.length > 0 ? checkpoints : await refreshCheckpoints(sid);
    let target = availableCheckpoints.find(
      (checkpoint) => checkpoint.id === id,
    );
    if (!target && checkpoints.length > 0) {
      availableCheckpoints = await refreshCheckpoints(sid);
      target = availableCheckpoints.find((checkpoint) => checkpoint.id === id);
    }

    const result = await transport.fork!(id, options);
    setSessionId(result.sessionId);
    const childCheckpoints = await refreshCheckpoints(result.sessionId);
    const childHead = childCheckpoints.at(-1);
    const forkTurnIndex = target?.turnIndex ?? childHead?.turnIndex;
    if (typeof forkTurnIndex === "number") {
      setMessages((current) =>
        applyForkedPendingRequests({
          messages: trimMessagesToCheckpoint({
            messages: current,
            turnIndex: forkTurnIndex,
          }),
          pendingRequests: result.checkpoint?.activePendingRequests ?? [],
        }),
      );
    }
    setStreamContentPieces([]);
    clearStructuredStreams();
    return result;
  };

  const checkpointForMessage = (messageId: string): string | null => {
    return (
      messages.find((message) => message.id === messageId)?.checkpointId ?? null
    );
  };

  const resolveRegenerateTarget = async (assistantMessageId: string) => {
    const assistantIndex = messages.findIndex(
      (message) => message.id === assistantMessageId,
    );
    if (assistantIndex < 0) {
      throw new Error(`Assistant message "${assistantMessageId}" not found.`);
    }
    const assistant = messages[assistantIndex]!;
    if (assistant.role !== "assistant") {
      throw new Error("Regenerate expects an assistant message id.");
    }

    let userIndex = -1;
    for (let index = assistantIndex - 1; index >= 0; index--) {
      if (messages[index]?.role === "user") {
        userIndex = index;
        break;
      }
    }
    if (userIndex < 0) {
      throw new Error("No preceding user message found for regenerate.");
    }
    const previousUser = messages[userIndex] as ChatMsg;

    const sid = resolveSessionId();
    let availableCheckpoints =
      checkpoints.length > 0 ? checkpoints : await refreshCheckpoints(sid);
    const assistantTurn = assistant.checkpointTurnIndex;
    const targetTurn =
      typeof assistantTurn === "number" ? assistantTurn - 1 : undefined;
    let target =
      targetTurn !== undefined
        ? availableCheckpoints.find(
            (checkpoint) => checkpoint.turnIndex === targetTurn,
          )
        : availableCheckpoints
            .filter(
              (checkpoint) => checkpoint.turnIndex < Number.MAX_SAFE_INTEGER,
            )
            .at(-2);
    if (!target && checkpoints.length > 0) {
      availableCheckpoints = await refreshCheckpoints(sid);
      target =
        targetTurn !== undefined
          ? availableCheckpoints.find(
              (checkpoint) => checkpoint.turnIndex === targetTurn,
            )
          : availableCheckpoints
              .filter(
                (checkpoint) => checkpoint.turnIndex < Number.MAX_SAFE_INTEGER,
              )
              .at(-2);
    }

    if (!target) {
      throw new Error("No rollback checkpoint found for regenerate.");
    }

    const baseMessages = trimMessagesToCheckpoint({
      messages,
      turnIndex: target.turnIndex,
    });

    return { target, previousUser, baseMessages };
  };

  const replayUserMessage = async (
    userMessage: ChatMsg,
    baseMessages: ChatMsg[],
    editedContent?: string,
  ) => {
    const content = editedContent ?? userMessage.content;
    if (userMessage.source?.type === "interrupt-response") {
      await respondToHumanInputFromBase({
        resumeToken: userMessage.source.resumeToken,
        requestId: userMessage.source.requestId,
        selected:
          editedContent !== undefined
            ? [editedContent]
            : userMessage.source.selected,
        baseMessages,
        ...(editedContent !== undefined
          ? { text: editedContent }
          : userMessage.source.text !== undefined
            ? { text: userMessage.source.text }
            : {}),
      });
      return;
    }
    await sendFromBase(content, baseMessages);
  };

  const regenerate = async (assistantMessageId: string): Promise<void> => {
    const { target, previousUser, baseMessages } =
      await resolveRegenerateTarget(assistantMessageId);
    await rollbackTo(target.id);
    setMessages(baseMessages);
    await replayUserMessage(previousUser, baseMessages);
  };

  const regenerateFromCheckpoint = async (
    checkpointId: string,
  ): Promise<void> => {
    const sid = resolveSessionId();
    let availableCheckpoints =
      checkpoints.length > 0 ? checkpoints : await refreshCheckpoints(sid);
    let target = availableCheckpoints.find(
      (checkpoint) => checkpoint.id === checkpointId,
    );
    if (!target && checkpoints.length > 0) {
      availableCheckpoints = await refreshCheckpoints(sid);
      target = availableCheckpoints.find(
        (checkpoint) => checkpoint.id === checkpointId,
      );
    }
    if (!target) {
      throw new Error(`Checkpoint "${checkpointId}" not found.`);
    }

    const baseMessages = trimMessagesToCheckpoint({
      messages,
      turnIndex: target.turnIndex,
    });
    const previousUser = messages
      .slice(baseMessages.length)
      .find((message) => message.role === "user");
    if (!previousUser) {
      throw new Error("No user message found after checkpoint for regenerate.");
    }

    await rollbackTo(target.id);
    setMessages(baseMessages);
    await replayUserMessage(previousUser, baseMessages);
  };

  const retryWithEdit = async (
    assistantMessageId: string,
    newUserContent: string,
  ): Promise<void> => {
    const { target, previousUser, baseMessages } =
      await resolveRegenerateTarget(assistantMessageId);
    await rollbackTo(target.id);
    setMessages(baseMessages);
    await replayUserMessage(previousUser, baseMessages, newUserContent);
  };

  return {
    messages,
    isStreaming,
    canAbort: isStreaming,
    error,
    streamContentPieces,
    streamDebug,
    lastAssistantId,
    checkpoints,
    workflowId,
    setWorkflowId,
    send,
    respondToHumanInput,
    respondToInterrupt,
    setMessages,
    checkpointForMessage,
    rollbackTo,
    fork,
    regenerate,
    regenerateFromCheckpoint,
    retryWithEdit,
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
