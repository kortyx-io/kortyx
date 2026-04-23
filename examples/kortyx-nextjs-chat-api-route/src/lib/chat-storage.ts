"use client";

import type { ChatMsg, ContentPiece } from "@/lib/chat-types";

type MaybePromise<T> = T | Promise<T>;

export type PersistedChatState = {
  sessionId: string | null;
  workflowId: string;
  includeHistory: boolean;
  messages: ChatMsg[];
};

export type ChatStorage = {
  load: () => MaybePromise<Partial<PersistedChatState>>;
  save: (state: PersistedChatState) => MaybePromise<void>;
  clearMessages: () => MaybePromise<void>;
};

// TODO: Make remote/custom persistence more robust before exporting this shape:
// - add debouncing so repeated message updates do not trigger a full save each time
// - surface save error handling/retry hooks instead of silently ignoring failures
// - define a conflict/version strategy for multi-tab and server-synced storage
// - support partial saves instead of rewriting the full persisted state on each change

const STORAGE_MESSAGES_KEY = "chat.messages.v1";
const STORAGE_INCLUDE_HISTORY_KEY = "chat.includeHistory.v1";
const STORAGE_SESSION_ID_KEY = "chat.sessionId";
const STORAGE_WORKFLOW_ID_KEY = "chat.workflowId";

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

export function createBrowserChatStorage(): ChatStorage {
  return {
    load() {
      try {
        if (typeof localStorage === "undefined") {
          return {};
        }

        const sessionId = localStorage.getItem(STORAGE_SESSION_ID_KEY);
        const workflowId = localStorage.getItem(STORAGE_WORKFLOW_ID_KEY) ?? "";
        const includeHistoryRaw = localStorage.getItem(
          STORAGE_INCLUDE_HISTORY_KEY,
        );
        const rawMessages = localStorage.getItem(STORAGE_MESSAGES_KEY);
        const parsedMessages = rawMessages
          ? (JSON.parse(rawMessages) as unknown)
          : [];
        const messages = Array.isArray(parsedMessages)
          ? parsedMessages
              .map((item) => toStoredChatMessage(item))
              .filter((message): message is ChatMsg => message !== null)
          : [];

        return {
          sessionId,
          workflowId,
          includeHistory: includeHistoryRaw !== "0",
          messages,
        };
      } catch {
        return {};
      }
    },

    save(state) {
      try {
        if (typeof localStorage === "undefined") return;

        if (state.sessionId) {
          localStorage.setItem(STORAGE_SESSION_ID_KEY, state.sessionId);
        } else {
          localStorage.removeItem(STORAGE_SESSION_ID_KEY);
        }

        localStorage.setItem(STORAGE_WORKFLOW_ID_KEY, state.workflowId);
        localStorage.setItem(
          STORAGE_INCLUDE_HISTORY_KEY,
          state.includeHistory ? "1" : "0",
        );

        const trimmedMessages = state.messages.slice(-60).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          ...(message.contentPieces
            ? { contentPieces: message.contentPieces }
            : {}),
        }));

        localStorage.setItem(
          STORAGE_MESSAGES_KEY,
          JSON.stringify(trimmedMessages),
        );
      } catch {}
    },

    clearMessages() {
      try {
        if (typeof localStorage === "undefined") return;
        localStorage.removeItem(STORAGE_MESSAGES_KEY);
      } catch {}
    },
  };
}
