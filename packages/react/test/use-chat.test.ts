// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("lets apps prepare context messages while appending the outgoing message automatically", async () => {
    const seenContexts: Parameters<
      ChatTransport<{ userId: string }>["stream"]
    >[0][] = [];
    const transport: ChatTransport<{ userId: string }> = {
      stream: async (context) => {
        seenContexts.push(context);
        await context.onChunk({
          type: "done",
        });
      },
    };
    const memory = createMemoryStorage({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "full prior assistant message",
        },
      ],
    });
    const prepareContextMessages = vi.fn(
      async ({
        messages,
        context,
      }: {
        messages: ChatMsg[];
        context: { userId: string };
      }) => [
        {
          role: "system" as const,
          content: `summary for ${context.userId}: ${messages.length} messages`,
        },
      ],
    );

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
        context: { userId: "user-1" },
        prepareContextMessages,
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("next");
    });

    expect(prepareContextMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "send",
        context: { userId: "user-1" },
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: "full prior assistant message",
          },
        ],
      }),
    );
    expect(seenContexts[0]).toMatchObject({
      context: { userId: "user-1" },
      messages: [
        {
          role: "system",
          content: "summary for user-1: 1 messages",
        },
        {
          role: "user",
          content: "next",
        },
      ],
    });
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

  it("keeps text content separate from structured stream data", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({
          type: "text-start",
          node: "writer",
          opId: "op-1",
          segmentId: "text-1",
        });
        await onChunk({
          type: "text-delta",
          node: "writer",
          opId: "op-1",
          segmentId: "text-1",
          delta: "Draft: ",
        });
        await onChunk({
          type: "structured-data",
          streamId: "facts",
          dataType: "demo.facts",
          kind: "set",
          path: "score",
          value: 42,
        });
        await onChunk({
          type: "text-delta",
          node: "writer",
          opId: "op-1",
          segmentId: "text-1",
          delta: "ready",
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
      await result.current.send("hello");
    });

    const assistant = result.current.messages.at(-1);
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "Draft: ready",
      contentPieces: [
        {
          type: "text",
          content: "Draft: ready",
        },
        {
          type: "structured",
          data: {
            streamId: "facts",
            status: "streaming",
            data: {
              score: 42,
            },
          },
        },
      ],
    });
  });

  it("ignores empty sends and concurrent sends while a stream is active", async () => {
    let finishStream: (() => void) | undefined;
    const transport: ChatTransport = {
      stream: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishStream = resolve;
          }),
      ),
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
      await result.current.send("   ");
    });

    expect(transport.stream).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);

    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = result.current.send("first") as Promise<void>;
      await Promise.resolve();
    });

    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      await result.current.send("second");
    });

    expect(transport.stream).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "first",
    });

    await act(async () => {
      finishStream?.();
      await firstSend;
    });
  });

  it("sends explicit resume metadata with workflow context", async () => {
    const contexts: Parameters<ChatTransport["stream"]>[0][] = [];
    const transport: ChatTransport = {
      stream: async (context) => {
        contexts.push(context);
        await context.onChunk({
          type: "done",
        });
      },
    };
    const memory = createMemoryStorage({
      workflowId: "workflow-a",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "Need input",
        },
      ],
    });

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.respondToHumanInput({
        resumeToken: "resume-1",
        requestId: "request-1",
        selected: [],
      });
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      workflowId: "workflow-a",
      messages: [
        {
          role: "assistant",
          content: "Need input",
        },
        {
          role: "user",
          content: "(selection)",
          metadata: {
            resume: {
              token: "resume-1",
              requestId: "request-1",
              selected: [],
            },
          },
        },
      ],
    });
  });

  it("responds to an interrupt piece without exposing resume protocol fields", async () => {
    const contexts: Parameters<ChatTransport["stream"]>[0][] = [];
    const transport: ChatTransport = {
      stream: async (context) => {
        contexts.push(context);
        await context.onChunk({
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
      await result.current.respondToInterrupt(
        {
          id: "interrupt-1",
          type: "interrupt",
          resumeToken: "resume-1",
          requestId: "request-1",
          kind: "choice",
          question: "Pick one",
          multiple: false,
          options: [{ id: "product", label: "Product" }],
        },
        { selected: ["product"] },
      );
    });

    expect(contexts[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "product",
      metadata: {
        resume: {
          token: "resume-1",
          requestId: "request-1",
          selected: ["product"],
        },
      },
    });
  });

  it("separates clearing visible messages from resetting the session", async () => {
    const memory = createMemoryStorage({
      sessionId: "session-1",
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
      result.current.clearMessages();
    });
    await flushEffects();

    expect(result.current.messages).toEqual([]);
    expect(memory.getClearMessagesCalls()).toBe(1);
    expect(memory.getState().sessionId).toBe("session-1");
    expect(memory.getState().messages).toEqual([]);

    act(() => {
      result.current.resetChat();
    });
    await flushEffects();

    expect(memory.getState().sessionId).toBeNull();
  });

  it("uses the latest transport after rerender", async () => {
    const firstTransport: ChatTransport = {
      stream: vi.fn(async ({ onChunk }) => {
        await onChunk({ type: "message", content: "old" });
        await onChunk({ type: "done" });
      }),
    };
    const secondTransport: ChatTransport = {
      stream: vi.fn(async ({ onChunk }) => {
        await onChunk({ type: "message", content: "new" });
        await onChunk({ type: "done" });
      }),
    };
    const memory = createMemoryStorage();

    const { result, rerender } = renderHook(
      ({ transport }) =>
        useChat({
          transport,
          storage: memory.storage,
        }),
      { initialProps: { transport: firstTransport } },
    );

    await flushEffects();
    rerender({ transport: secondTransport });

    await act(async () => {
      await result.current.send("hello");
    });

    expect(firstTransport.stream).not.toHaveBeenCalled();
    expect(secondTransport.stream).toHaveBeenCalledTimes(1);
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "new",
    });
  });

  it("surfaces transport errors and resets streaming state", async () => {
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
    expect(result.current.error).toBe(transportError);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "hello",
    });

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it("aborts an active stream without recording a transport error", async () => {
    let seenSignal: AbortSignal | undefined;
    const transport: ChatTransport = {
      stream: vi.fn(
        ({ signal }) =>
          new Promise<void>((_resolve, reject) => {
            seenSignal = signal;
            signal?.addEventListener("abort", () => {
              const abortError = new Error("aborted");
              abortError.name = "AbortError";
              reject(abortError);
            });
          }),
      ),
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.send("hello") as Promise<void>;
      await Promise.resolve();
    });

    expect(result.current.isStreaming).toBe(true);
    expect(result.current.canAbort).toBe(true);

    await act(async () => {
      result.current.abort();
      await sendPromise;
    });

    expect(seenSignal?.aborted).toBe(true);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
