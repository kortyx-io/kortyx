"use client";

import { type StreamChunk, streamChatFromRoute } from "kortyx";
import type React from "react";
import { createContext, useEffect, useRef, useState } from "react";

export type StructuredData = {
  type: "structured-data";
  node?: string;
  dataType?: string;
  data: Record<string, unknown>;
};

export type HumanInputPiece = {
  id: string;
  type: "interrupt";
  resumeToken: string;
  requestId: string;
  kind: "text" | "choice" | "multi-choice";
  question?: string;
  multiple: boolean;
  options: Array<{ id: string; label: string; description?: string }>;
};

export type ContentPiece =
  | { id: string; type: "text"; content: string }
  | { id: string; type: "structured"; data: StructuredData }
  | { id: string; type: "error"; content: string }
  | HumanInputPiece;

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  contentPieces?: ContentPiece[];
  debug?: StreamChunk[];
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
  const [streamDebug, setStreamDebug] = useState<StreamChunk[]>([]);
  const [lastAssistantId, setLastAssistantId] = useState<string | null>(null);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [workflowId, setWorkflowId] = useState("");
  const sawDeltaRef = useRef(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const STORAGE_MESSAGES_KEY = "chat.messages.v1";
  const STORAGE_INCLUDE_HISTORY_KEY = "chat.includeHistory.v1";

  const createId = () => {
    try {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
      }
    } catch {}
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

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
            const restored: ChatMsg[] = parsed
              .map((m: any) => {
                if (!m || typeof m !== "object") return null;
                const role =
                  m.role === "user" || m.role === "assistant" ? m.role : null;
                const id = typeof m.id === "string" ? m.id : null;
                const content = typeof m.content === "string" ? m.content : "";
                const contentPieces = Array.isArray(m.contentPieces)
                  ? (m.contentPieces as any[]).filter(Boolean)
                  : undefined;
                if (!role || !id) return null;
                return {
                  id,
                  role,
                  content,
                  ...(contentPieces ? { contentPieces } : {}),
                } as ChatMsg;
              })
              .filter(Boolean) as ChatMsg[];
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
      const trimmed = messages.slice(-60).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        ...(m.contentPieces ? { contentPieces: m.contentPieces } : {}),
      }));
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(trimmed));
    } catch {}
  }, [messages]);

  const clearChat = () => {
    setMessages([]);
    setStreamContentPieces([]);
    setStreamDebug([]);
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

  type DebugChunk = StreamChunk & {
    _ts: number;
    _dt: number;
    _seq: number;
  };

  const createDebugRecorder = (initialMessage: string) => {
    let seq = 0;
    let lastTs = 0;
    const accDebug: StreamChunk[] = [];

    const push = (chunk: StreamChunk) => {
      const ts = Date.now();
      const withMeta: DebugChunk = {
        ...(chunk as StreamChunk),
        _ts: ts,
        _dt: lastTs ? ts - lastTs : 0,
        _seq: seq++,
      };
      lastTs = ts;
      accDebug.push(withMeta);
      setStreamDebug((d) =>
        d.length > 1000 ? [...d.slice(-1000), withMeta] : [...d, withMeta],
      );
    };

    push({
      type: "status",
      message: initialMessage,
    } as StreamChunk);

    return {
      push,
      getAll: () => accDebug,
    };
  };

  const createPieceAccumulator = () => {
    const accPieces: ContentPiece[] = [];
    const liveBuffers: Record<string, string> = {};
    const liveOrder: string[] = [];
    const livePieceIds: Record<string, string> = {};

    const ensureLiveNode = (node?: string) => {
      const key = node ?? "__unknown__";
      if (!(key in liveBuffers)) {
        liveBuffers[key] = "";
        liveOrder.push(key);
        livePieceIds[key] = createId();
      }
      return key;
    };

    const getLivePiece = (key: string) => {
      const existingId = livePieceIds[key];
      const id = existingId ?? createId();
      if (!existingId) livePieceIds[key] = id;
      const content = liveBuffers[key] ?? "";
      if (liveBuffers[key] === undefined) liveBuffers[key] = "";
      return { id, content };
    };

    const preview = () =>
      [
        ...accPieces,
        ...liveOrder.map((nodeKey) => {
          const { id, content } = getLivePiece(nodeKey);
          return { id, type: "text" as const, content };
        }),
      ] satisfies ContentPiece[];

    const flushLive = () => {
      for (const key of liveOrder) {
        const buf = liveBuffers[key];
        if (buf) {
          accPieces.push({
            id: getLivePiece(key).id,
            type: "text",
            content: buf,
          });
        }
      }
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
        .map((o) => ({
          id: String(o.id ?? ""),
          label: String(o.label ?? ""),
          ...(typeof o.description === "string" && o.description
            ? { description: o.description }
            : {}),
        }))
        .filter((o) => o.id && o.label);

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

    const processChunk = (
      chunk: StreamChunk,
      options?: { openDebugOnInterrupt?: boolean | undefined },
    ): boolean => {
      if (chunk.type === "text-start") {
        ensureLiveNode(chunk.node);
        setStreamContentPieces(preview());
        return true;
      }

      if (chunk.type === "text-delta") {
        sawDeltaRef.current = true;
        const key = ensureLiveNode(chunk.node);
        liveBuffers[key] = (liveBuffers[key] || "") + chunk.delta;
        setStreamContentPieces(preview());
        return true;
      }

      if (chunk.type === "text-end") {
        const key = ensureLiveNode(chunk.node);
        const buf = liveBuffers[key];
        if (buf) {
          accPieces.push({
            id: getLivePiece(key).id,
            type: "text",
            content: buf,
          });
        }
        delete liveBuffers[key];
        delete livePieceIds[key];
        const idx = liveOrder.indexOf(key);
        if (idx >= 0) liveOrder.splice(idx, 1);
        setStreamContentPieces(preview());
        return true;
      }

      if (chunk.type === "structured-data") {
        const structuredChunk: StructuredData = {
          type: "structured-data",
          ...(chunk.node !== undefined && { node: chunk.node }),
          ...(chunk.dataType !== undefined ? { dataType: chunk.dataType } : {}),
          data: chunk.data as unknown as Record<string, unknown>,
        };
        accPieces.push({
          id: createId(),
          type: "structured",
          data: structuredChunk,
        });
        setStreamContentPieces(preview());
        return true;
      }

      if (chunk.type === "interrupt") {
        accPieces.push(toHumanInputPiece(chunk));
        setStreamContentPieces(preview());
        if (options?.openDebugOnInterrupt) openDebugPanel();
        return true;
      }

      if (chunk.type === "message") {
        if (!sawDeltaRef.current) {
          accPieces.push({
            id: createId(),
            type: "text",
            content: chunk.content ?? "",
          });
          setStreamContentPieces(preview());
        }
        return true;
      }

      if (chunk.type === "error") {
        accPieces.push({
          id: createId(),
          type: "error",
          content: chunk.message ?? "An error occurred",
        });
        setStreamContentPieces(preview());
        return true;
      }

      if (chunk.type === "done") {
        return false;
      }

      return true;
    };

    return {
      processChunk,
      flushLive,
      getPieces: () => accPieces,
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
    messagesToSend: Array<{
      role: "user" | "assistant" | "system";
      content: string;
      metadata?: Record<string, unknown>;
    }>;
    debugLabel: string;
    openDebugOnStart?: boolean;
    openDebugOnInterrupt?: boolean;
  }) => {
    if (args.openDebugOnStart) openDebugPanel();

    const debug = createDebugRecorder(
      `${args.debugLabel} sessionId=${args.sid}`,
    );
    const pieces = createPieceAccumulator();

    const stream = streamChatFromRoute({
      endpoint: "/api/chat",
      sessionId: args.sid,
      workflowId,
      messages: args.messagesToSend,
    });

    for await (const chunk of stream) {
      debug.push(chunk);

      if (chunk.type === "session") {
        if (typeof chunk.sessionId === "string") {
          persistSessionId(chunk.sessionId);
        }
        continue;
      }

      const shouldContinue = pieces.processChunk(chunk, {
        openDebugOnInterrupt: args.openDebugOnInterrupt,
      });
      if (!shouldContinue) break;
    }

    pieces.flushLive();

    const assistant = buildAssistantMessage({
      pieces: pieces.getPieces(),
      debug: debug.getAll(),
    });
    setMessages((prev) => [...prev, assistant]);
    setLastAssistantId(assistant.id);
    setStreamContentPieces([]);
    setStreamDebug([]);
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || isStreaming) return;

    // Check if there's an active text interrupt - if so, respond to it instead
    const activeTextInterrupt = streamContentPieces.find(
      (p): p is HumanInputPiece => p.type === "interrupt" && p.kind === "text",
    );

    if (activeTextInterrupt) {
      // Respond to the text interrupt
      await respondToHumanInput({
        resumeToken: activeTextInterrupt.resumeToken,
        requestId: activeTextInterrupt.requestId,
        selected: [content], // User's typed text as the selection
        text: content,
      });
      return;
    }

    const userId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userMsg: ChatMsg = { id: userId, role: "user", content };
    setMessages((prev) => [...prev, userMsg]);

    setIsStreaming(true);
    setStreamContentPieces([]);
    setStreamDebug([]);
    sawDeltaRef.current = false;

    try {
      const sid = resolveSessionId();
      const history = includeHistory
        ? messages.map((m) => ({ role: m.role, content: m.content }))
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
    setStreamDebug([]);
    sawDeltaRef.current = false;

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
        ? messages.map((m) => ({ role: m.role, content: m.content }))
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
