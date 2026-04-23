// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  createBrowserChatStorage,
  type PersistedChatState,
} from "../src/chat-storage";

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const parseMessage = (value: unknown): StoredMessage | null => {
  if (!value || typeof value !== "object") return null;

  const message = value as Record<string, unknown>;
  const id = typeof message.id === "string" ? message.id : null;
  const role =
    message.role === "user" || message.role === "assistant"
      ? message.role
      : null;
  const content = typeof message.content === "string" ? message.content : null;

  if (!id || !role || content === null) return null;

  return {
    id,
    role,
    content,
  };
};

const serializeMessage = (message: StoredMessage) => message;

describe("createBrowserChatStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads and saves persisted chat state", () => {
    const storage = createBrowserChatStorage<StoredMessage>({
      parseMessage,
      serializeMessage,
    });
    const state: PersistedChatState<StoredMessage> = {
      sessionId: "session-1",
      workflowId: "workflow-1",
      includeHistory: true,
      messages: [
        { id: "m1", role: "user", content: "hello" },
        { id: "m2", role: "assistant", content: "world" },
      ],
    };

    storage.save(state);

    expect(storage.load()).toEqual(state);
  });

  it("supports zero-config storage for serializable messages", () => {
    const storage = createBrowserChatStorage<StoredMessage>();
    const state: PersistedChatState<StoredMessage> = {
      sessionId: "session-1",
      workflowId: "workflow-1",
      includeHistory: true,
      messages: [{ id: "m1", role: "user", content: "hello" }],
    };

    storage.save(state);

    expect(storage.load()).toEqual(state);
  });

  it("trims saved messages to the configured maxMessages", () => {
    const storage = createBrowserChatStorage<StoredMessage>({
      parseMessage,
      serializeMessage,
      maxMessages: 2,
    });

    storage.save({
      sessionId: "session-1",
      workflowId: "workflow-1",
      includeHistory: true,
      messages: [
        { id: "m1", role: "user", content: "one" },
        { id: "m2", role: "assistant", content: "two" },
        { id: "m3", role: "user", content: "three" },
      ],
    });

    expect(storage.load().messages).toEqual([
      { id: "m2", role: "assistant", content: "two" },
      { id: "m3", role: "user", content: "three" },
    ]);
  });

  it("clears only saved messages", () => {
    const storage = createBrowserChatStorage<StoredMessage>({
      parseMessage,
      serializeMessage,
    });

    storage.save({
      sessionId: "session-1",
      workflowId: "workflow-1",
      includeHistory: false,
      messages: [{ id: "m1", role: "user", content: "hello" }],
    });

    storage.clearMessages();

    expect(storage.load()).toMatchObject({
      sessionId: "session-1",
      workflowId: "workflow-1",
      includeHistory: false,
      messages: [],
    });
  });
});
