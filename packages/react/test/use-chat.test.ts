// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  ChatMsg,
  ChatStorage,
  ChatTransport,
  PersistedChatState,
} from "../src";
import { useChat } from "../src";

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const createMemoryStorage = (
  initial?: Partial<{
    sessionId: string | null;
    workflowId: string;
    includeHistory: boolean;
    messages: ChatMsg[];
  }>,
): {
  storage: ChatStorage<ChatMsg>;
  saves: PersistedChatState<ChatMsg>[];
  getState: () => PersistedChatState<ChatMsg>;
  getClearMessagesCalls: () => number;
} => {
  let current = {
    sessionId: initial?.sessionId ?? null,
    workflowId: initial?.workflowId ?? "",
    includeHistory: initial?.includeHistory ?? true,
    messages: initial?.messages ?? [],
  };
  const saves: PersistedChatState<ChatMsg>[] = [];
  let clearMessagesCalls = 0;

  return {
    storage: {
      load: async () => current,
      save: async (state) => {
        current = state;
        saves.push(state);
      },
      clearMessages: async () => {
        clearMessagesCalls += 1;
        current = {
          ...current,
          messages: [],
        };
      },
    },
    saves,
    getState: () => current,
    getClearMessagesCalls: () => clearMessagesCalls,
  };
};

describe("useChat", () => {
  it("sends a user message and finalizes an assistant message from streamed chunks", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({
          type: "message",
          content: "Hello back",
        });
        await onChunk({
          type: "done",
        });
      },
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
        createId: (() => {
          let seq = 0;
          return () => `id-${seq++}`;
        })(),
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("Hello");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "Hello",
    });
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Hello back",
      contentPieces: [
        {
          type: "text",
          content: "Hello back",
        },
      ],
    });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamContentPieces).toEqual([]);
  });

  it("routes send() through resume when a text interrupt is active", async () => {
    const seenMessages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
      metadata?: Record<string, unknown>;
    }> = [];

    const transport: ChatTransport = {
      stream: async ({ onChunk, messages }) => {
        seenMessages.push(...messages);
        await onChunk({
          type: "done",
        });
      },
    };

    const interruptMessage: ChatMsg = {
      id: "assistant-1",
      role: "assistant",
      content: "",
      contentPieces: [
        {
          id: "interrupt-1",
          type: "interrupt",
          resumeToken: "resume-1",
          requestId: "request-1",
          kind: "text",
          question: "Enter text",
          multiple: false,
          options: [],
        },
      ],
    };
    const memory = createMemoryStorage({
      messages: [interruptMessage],
    });

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("resume text");
    });

    expect(seenMessages.at(-1)).toMatchObject({
      role: "user",
      content: "resume text",
      metadata: {
        resume: {
          token: "resume-1",
          requestId: "request-1",
          selected: ["resume text"],
        },
      },
    });
  });

  it("omits prior history when includeHistory is false", async () => {
    let seenMessages:
      | Array<{
          role: "user" | "assistant" | "system";
          content: string;
          metadata?: Record<string, unknown>;
        }>
      | undefined;

    const transport: ChatTransport = {
      stream: async ({ onChunk, messages }) => {
        seenMessages = messages;
        await onChunk({
          type: "done",
        });
      },
    };
    const historyMessage: ChatMsg = {
      id: "assistant-1",
      role: "assistant",
      content: "history",
    };
    const memory = createMemoryStorage({
      messages: [historyMessage],
      includeHistory: true,
    });

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    act(() => {
      result.current.setIncludeHistory(false);
    });

    await act(async () => {
      await result.current.send("fresh");
    });

    expect(seenMessages).toEqual([
      {
        role: "user",
        content: "fresh",
      },
    ]);
  });

  it("persists session chunks into storage state", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({
          type: "session",
          sessionId: "server-session",
        });
        await onChunk({
          type: "done",
        });
      },
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("hello");
    });
    await flushEffects();

    expect(memory.getState().sessionId).toBe("server-session");
    expect(memory.saves.at(-1)?.sessionId).toBe("server-session");
  });

  it("stores structured chunks in the finalized assistant message", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({
          type: "structured-data",
          streamId: "stream-1",
          dataType: "demo.data",
          kind: "final",
          data: {
            body: "Final",
          },
        });
        await onChunk({
          type: "done",
        });
      },
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("hello");
    });

    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "",
      contentPieces: [
        {
          type: "structured",
          data: {
            streamId: "stream-1",
            status: "done",
            data: {
              body: "Final",
            },
          },
        },
      ],
    });
  });

  it("clears messages and calls storage.clearMessages()", async () => {
    const memory = createMemoryStorage({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "existing",
        },
      ],
    });

    const { result } = renderHook(() =>
      useChat({
        transport: {
          stream: async () => {},
        },
        storage: memory.storage,
      }),
    );

    await flushEffects();

    act(() => {
      result.current.clearChat();
    });
    await flushEffects();

    expect(result.current.messages).toEqual([]);
    expect(memory.getClearMessagesCalls()).toBe(1);
    expect(memory.getState().messages).toEqual([]);
  });

  it("resets streaming state when transport throws", async () => {
    const transportError = new Error("transport failed");
    const transport: ChatTransport = {
      stream: async () => {
        throw transportError;
      },
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    await act(async () => {
      await expect(result.current.send("hello")).rejects.toThrow(
        "transport failed",
      );
    });
    await flushEffects();

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "hello",
    });
  });
});
