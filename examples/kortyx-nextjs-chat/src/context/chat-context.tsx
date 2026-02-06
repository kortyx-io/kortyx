"use client";

import type { StreamChunk } from "kortyx";
import type React from "react";
import { createContext, useEffect, useRef, useState } from "react";
import { runChat } from "@/app/actions/chat";

async function* runChatStream(args: {
  sessionId: string;
  workflowId?: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}): AsyncGenerator<StreamChunk, void, void> {
  const chunks = await runChat(args);
  for (const chunk of chunks) {
    yield chunk;
  }
}

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
      const sid = sessionId ?? createId();
      if (!sessionId) {
        setSessionId(sid);
        try {
          if (typeof localStorage !== "undefined")
            localStorage.setItem("chat.sessionId", sid);
        } catch {}
      }

      const history = includeHistory
        ? messages.map((m) => ({ role: m.role, content: m.content }))
        : [];
      const messagesToSend = [...history, { role: "user" as const, content }];

      const preDebug: StreamChunk = {
        type: "status",
        message: `runChat (send) sessionId=${sid}`,
      } as StreamChunk;
      let seq = 0;
      const preDebugWithMeta = {
        ...(preDebug as unknown as Record<string, unknown>),
        _ts: Date.now(),
        _dt: 0,
        _seq: seq++,
      } as unknown as StreamChunk;
      setStreamDebug((d) => [...d, preDebugWithMeta]);

      // Finalized pieces in arrival order
      const accPieces: ContentPiece[] = [];
      // In-flight text buffers keyed by node so multiple nodes can stream concurrently
      const liveBuffers: Record<string, string> = {};
      const liveOrder: string[] = [];
      const livePieceIds: Record<string, string> = {};
      const accDebug: StreamChunk[] = [preDebugWithMeta];
      let lastTs = 0;

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

      const previewPieces = () => [
        ...accPieces,
        ...liveOrder.map((n) => {
          const { id, content } = getLivePiece(n);
          return { id, type: "text" as const, content };
        }),
      ];

      type DebugChunk = StreamChunk & {
        _ts: number;
        _dt: number;
        _seq: number;
      };
      const stream = (async function* (): AsyncGenerator<
        StreamChunk,
        void,
        void
      > {
        try {
          yield* runChatStream({
            sessionId: sid,
            workflowId,
            messages: messagesToSend,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to run chat.";
          yield { type: "error", message };
          yield { type: "done" };
        }
      })();

      for await (const chunk of stream) {
        const ts = Date.now();
        const withMeta: DebugChunk = {
          ...chunk,
          _ts: ts,
          _dt: lastTs ? ts - lastTs : 0,
          _seq: seq++,
        };
        lastTs = ts;
        accDebug.push(withMeta);
        setStreamDebug((d) =>
          d.length > 1000 ? [...d.slice(-1000), withMeta] : [...d, withMeta],
        );

        // Capture server-issued session id on first response
        if (chunk.type === "session") {
          const sid = (chunk as { type: "session"; sessionId: string })
            .sessionId;
          setSessionId(sid);
          try {
            if (typeof localStorage !== "undefined")
              localStorage.setItem("chat.sessionId", sid);
          } catch {}
          continue;
        }

        if (chunk.type === "text-start") {
          const chunkNode = chunk.node;
          ensureLiveNode(chunkNode);
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "text-delta") {
          sawDeltaRef.current = true;
          const deltaStr = chunk.delta;
          const key = ensureLiveNode(chunk.node);
          liveBuffers[key] = (liveBuffers[key] || "") + deltaStr;
          // Show finalized pieces + all live buffers in stable order
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "text-end") {
          const key = ensureLiveNode(chunk.node);
          const buf = liveBuffers[key];
          if (buf)
            accPieces.push({
              id: getLivePiece(key).id,
              type: "text",
              content: buf,
            });
          // remove from live tracking
          delete liveBuffers[key];
          delete livePieceIds[key];
          const idx = liveOrder.indexOf(key);
          if (idx >= 0) liveOrder.splice(idx, 1);
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "structured-data") {
          // Keep live buffers as-is; append structured data as a finalized piece
          const structuredChunk: StructuredData = {
            type: "structured-data",
            ...(chunk.node !== undefined && { node: chunk.node }),
            ...(chunk.dataType !== undefined && { dataType: chunk.dataType }),
            data: chunk.data as unknown as Record<string, unknown>,
          };
          accPieces.push({
            id: createId(),
            type: "structured",
            data: structuredChunk,
          });
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "interrupt") {
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
          const kind =
            input.kind || (input.multiple ? "multi-choice" : "choice");
          const isText = kind === "text";

          const question = isText
            ? input.question // Optional for text
            : typeof input.question === "string"
              ? input.question
              : "Please choose"; // Required for choice

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
          const humanPiece: HumanInputPiece = {
            id: createId(),
            type: "interrupt",
            resumeToken: String(hi.resumeToken ?? ""),
            requestId: String(hi.requestId ?? ""),
            kind,
            ...(question !== undefined ? { question } : {}),
            multiple: Boolean(input.multiple),
            options: optionsArr,
          };
          accPieces.push(humanPiece);
          setStreamContentPieces(previewPieces());
          // Auto-open debug panel to show request line and chunks
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("chat:open-debug"));
            }
          } catch {}
        } else if (chunk.type === "message") {
          if (!sawDeltaRef.current) {
            const content = chunk.content ?? "";
            accPieces.push({ id: createId(), type: "text", content });
            setStreamContentPieces(previewPieces());
          }
        } else if (chunk.type === "error") {
          // Add error message as error piece
          accPieces.push({
            id: createId(),
            type: "error",
            content: chunk.message ?? "An error occurred",
          });
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "done") {
          break;
        }
      }

      // Flush any remaining live buffers into finalized pieces
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

      const aId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // Extract plain text content for the content field
      const plainTextContent = accPieces
        .filter(
          (p): p is Extract<ContentPiece, { type: "text" }> =>
            p.type === "text",
        )
        .map((p) => p.content)
        .join("");
      const assistantBase = {
        id: aId,
        role: "assistant" as const,
        content: plainTextContent,
        debug: accDebug,
      };
      const assistantMsg: ChatMsg =
        accPieces.length > 0
          ? { ...assistantBase, contentPieces: accPieces }
          : assistantBase;
      setMessages((prev) => [...prev, assistantMsg]);
      setLastAssistantId(aId);
      setStreamContentPieces([]);
      setStreamDebug([]);
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
      const sid = sessionId ?? createId();
      if (!sessionId) {
        setSessionId(sid);
        try {
          if (typeof localStorage !== "undefined")
            localStorage.setItem("chat.sessionId", sid);
        } catch {}
      }
      const history = includeHistory
        ? messages.map((m) => ({ role: m.role, content: m.content }))
        : [];
      const messagesToSend = [...history, outgoing];
      // Auto-open debug panel when sending resume
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("chat:open-debug"));
        }
      } catch {}
      const preDebug: StreamChunk = {
        type: "status",
        message: `runChat (resume) sessionId=${sid}`,
      } as StreamChunk;
      let seq = 0;
      const preDebugWithMeta = {
        ...(preDebug as unknown as Record<string, unknown>),
        _ts: Date.now(),
        _dt: 0,
        _seq: seq++,
      } as unknown as StreamChunk;
      setStreamDebug((d) => [...d, preDebugWithMeta]);
      // Reuse the same stream-reading logic
      const accPieces: ContentPiece[] = [];
      const liveBuffers: Record<string, string> = {};
      const liveOrder: string[] = [];
      const livePieceIds: Record<string, string> = {};
      const accDebug: StreamChunk[] = [preDebugWithMeta];
      let lastTs = 0;
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

      const previewPieces = () => [
        ...accPieces,
        ...liveOrder.map((n) => {
          const { id, content } = getLivePiece(n);
          return { id, type: "text" as const, content };
        }),
      ];

      type DebugChunk = StreamChunk & {
        _ts: number;
        _dt: number;
        _seq: number;
      };
      const stream = (async function* (): AsyncGenerator<
        StreamChunk,
        void,
        void
      > {
        try {
          yield* runChatStream({
            sessionId: sid,
            workflowId,
            messages: messagesToSend,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to run chat.";
          yield { type: "error", message };
          yield { type: "done" };
        }
      })();

      for await (const chunk of stream) {
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
        if (chunk.type === "session") {
          const sid = (chunk as { type: "session"; sessionId: string })
            .sessionId;
          setSessionId(sid);
          try {
            if (typeof localStorage !== "undefined")
              localStorage.setItem("chat.sessionId", sid);
          } catch {}
          continue;
        }
        if (chunk.type === "text-start") {
          const chunkNode = chunk.node;
          ensureLiveNode(chunkNode);
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "text-delta") {
          sawDeltaRef.current = true;
          const deltaStr = chunk.delta as string;
          const key = ensureLiveNode(chunk.node);
          liveBuffers[key] = (liveBuffers[key] || "") + deltaStr;
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "text-end") {
          const key = ensureLiveNode(chunk.node);
          const buf = liveBuffers[key];
          if (buf)
            accPieces.push({
              id: getLivePiece(key).id,
              type: "text",
              content: buf,
            });
          delete liveBuffers[key];
          delete livePieceIds[key];
          const idx = liveOrder.indexOf(key);
          if (idx >= 0) liveOrder.splice(idx, 1);
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "structured-data") {
          const structuredChunk: StructuredData = {
            type: "structured-data",
            ...(chunk.node !== undefined && { node: chunk.node }),
            ...(chunk.dataType !== undefined && { dataType: chunk.dataType }),
            data: chunk.data as unknown as Record<string, unknown>,
          };
          accPieces.push({
            id: createId(),
            type: "structured",
            data: structuredChunk,
          });
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "interrupt") {
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
          const kind =
            input.kind || (input.multiple ? "multi-choice" : "choice");
          const isText = kind === "text";

          const question = isText
            ? input.question // Optional for text
            : typeof input.question === "string"
              ? input.question
              : "Please choose"; // Required for choice

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
          const humanPiece: HumanInputPiece = {
            id: createId(),
            type: "interrupt",
            resumeToken: String(hi.resumeToken ?? ""),
            requestId: String(hi.requestId ?? ""),
            kind,
            ...(question !== undefined ? { question } : {}),
            multiple: Boolean(input.multiple),
            options: optionsArr,
          };
          accPieces.push(humanPiece);
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "message") {
          if (!sawDeltaRef.current) {
            const content = chunk.content ?? "";
            accPieces.push({ id: createId(), type: "text", content });
            setStreamContentPieces(previewPieces());
          }
        } else if (chunk.type === "error") {
          accPieces.push({
            id: createId(),
            type: "error",
            content: chunk.message ?? "An error occurred",
          });
          setStreamContentPieces(previewPieces());
        } else if (chunk.type === "done") {
          break;
        }
      }
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
      const aId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const plainTextContent = accPieces
        .filter(
          (p): p is Extract<ContentPiece, { type: "text" }> =>
            p.type === "text",
        )
        .map((p) => p.content)
        .join("");
      const assistantMsg: ChatMsg =
        accPieces.length > 0
          ? {
              id: aId,
              role: "assistant",
              content: plainTextContent,
              contentPieces: accPieces,
              debug: accDebug,
            }
          : {
              id: aId,
              role: "assistant",
              content: plainTextContent,
              debug: accDebug,
            };
      setMessages((prev) => [...prev, assistantMsg]);
      setLastAssistantId(aId);
      setStreamContentPieces([]);
      setStreamDebug([]);
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
