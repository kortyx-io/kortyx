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

    const loaded = storage.load() as Partial<PersistedChatState<StoredMessage>>;
    expect(loaded.messages).toEqual([
      { id: "m2", role: "assistant", content: "two" },
      { id: "m3", role: "user", content: "three" },
    ]);
  });

  it("supports configuring maxMessages without custom serializers", () => {
    const storage = createBrowserChatStorage<StoredMessage>({
      maxMessages: 1,
    });

    storage.save({
      sessionId: null,
      workflowId: "",
      includeHistory: true,
      messages: [
        { id: "m1", role: "user", content: "one" },
        { id: "m2", role: "assistant", content: "two" },
      ],
    });

    expect(storage.load()).toMatchObject({
      messages: [{ id: "m2", role: "assistant", content: "two" }],
    });
  });

  it("returns empty state when localStorage is unavailable", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: undefined,
    });

    try {
      const storage = createBrowserChatStorage<StoredMessage>();
      expect(storage.load()).toEqual({});
      expect(() =>
        storage.save({
          sessionId: null,
          workflowId: "wf",
          includeHistory: true,
          messages: [],
        }),
      ).not.toThrow();
      expect(() => storage.clearMessages()).not.toThrow();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "localStorage", originalDescriptor);
      }
    }
  });

  it("returns empty state when load throws (corrupt JSON)", () => {
    localStorage.setItem("chat.messages.v1", "{not-json");

    const storage = createBrowserChatStorage<StoredMessage>();

    expect(storage.load()).toEqual({});
  });

  it("falls back to empty workflowId when none is persisted", () => {
    localStorage.setItem("chat.sessionId", "session-x");
    localStorage.setItem("chat.includeHistory.v1", "0");

    const storage = createBrowserChatStorage<StoredMessage>();

    expect(storage.load()).toEqual({
      sessionId: "session-x",
      workflowId: "",
      includeHistory: false,
      messages: [],
    });
  });

  it("returns empty messages when persisted payload is not an array", () => {
    localStorage.setItem("chat.messages.v1", JSON.stringify({ not: "array" }));

    const storage = createBrowserChatStorage<StoredMessage>();

    expect(storage.load()).toMatchObject({
      messages: [],
    });
  });

  it("ignores failures during save and clearMessages", () => {
    const failingStorage: Storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
      clear: () => {},
      key: () => null,
      length: 0,
    };
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: failingStorage,
    });

    try {
      const storage = createBrowserChatStorage<StoredMessage>();
      expect(() =>
        storage.save({
          sessionId: "session-1",
          workflowId: "wf",
          includeHistory: true,
          messages: [{ id: "m1", role: "user", content: "x" }],
        }),
      ).not.toThrow();
      expect(() =>
        storage.save({
          sessionId: null,
          workflowId: "wf",
          includeHistory: false,
          messages: [],
        }),
      ).not.toThrow();
      expect(() => storage.clearMessages()).not.toThrow();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "localStorage", originalDescriptor);
      }
    }
  });

  it("supports a custom storage keys override", () => {
    const storage = createBrowserChatStorage<StoredMessage>({
      keys: { messages: "custom.messages" },
    });
    storage.save({
      sessionId: "session-1",
      workflowId: "wf",
      includeHistory: true,
      messages: [{ id: "m1", role: "user", content: "x" }],
    });

    expect(localStorage.getItem("custom.messages")).toContain("m1");
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
