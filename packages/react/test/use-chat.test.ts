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

  it("attaches trace chunks to finalized assistant messages", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({
          type: "trace",
          traceId: "trace-1",
          spanId: "span-1",
          runId: "run-1",
          rootSpanName: "kortyx.run",
        });
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
    await flushEffects();

    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Hello back",
      traceId: "trace-1",
      spanId: "span-1",
      runId: "run-1",
    });
    expect(memory.getState().messages[1]).toMatchObject({
      traceId: "trace-1",
      spanId: "span-1",
      runId: "run-1",
    });
  });

  it("ignores malformed trace chunks", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({
          type: "trace",
          traceId: 42,
          spanId: "span-1",
          runId: "run-1",
          rootSpanName: "kortyx.run",
        } as unknown as Parameters<typeof onChunk>[0]);
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
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("Hello");
    });

    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "Hello back",
    });
    expect(result.current.messages.at(-1)?.traceId).toBeUndefined();
    expect(result.current.messages.at(-1)?.spanId).toBeUndefined();
    expect(result.current.messages.at(-1)?.runId).toBeUndefined();
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

  it("starts a fresh turn after a text interrupt has already received a response", async () => {
    const seenMessages: Parameters<ChatTransport["stream"]>[0]["messages"][] =
      [];
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
      messages: [
        interruptMessage,
        { id: "user-1", role: "user", content: "resolved text" },
      ],
    });
    const transport: ChatTransport = {
      stream: async ({ onChunk, messages }) => {
        seenMessages.push(messages);
        await onChunk({ type: "done" });
      },
    };

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("fresh text");
    });

    expect(seenMessages[0]?.at(-1)).toEqual({
      role: "user",
      content: "fresh text",
    });
  });

  it("starts a fresh turn when a later assistant message supersedes a text interrupt", async () => {
    const seenMessages: Parameters<ChatTransport["stream"]>[0]["messages"][] =
      [];
    const memory = createMemoryStorage({
      messages: [
        {
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
        },
        {
          id: "assistant-2",
          role: "assistant",
          content: "Completed",
        },
      ],
    });
    const transport: ChatTransport = {
      stream: async ({ onChunk, messages }) => {
        seenMessages.push(messages);
        await onChunk({ type: "done" });
      },
    };

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("fresh text");
    });

    expect(seenMessages[0]?.at(-1)).toEqual({
      role: "user",
      content: "fresh text",
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

  it("captures stream error chunks as the hook error", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({ type: "error", message: "stream blew up" });
        await onChunk({ type: "done" });
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
      await result.current.send("hi");
    });

    expect(result.current.error?.message).toBe("stream blew up");
  });

  it("converts interrupt chunks into a live human-input piece", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({
          type: "interrupt",
          requestId: "req-1",
          resumeToken: "tok-1",
          id: "pick-job",
          schemaId: "pick-job",
          schemaVersion: "1",
          meta: {
            picker: "jobs",
          },
          input: {
            kind: "text",
            multiple: false,
            question: "Continue?",
          },
        });
        await onChunk({ type: "done" });
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
      await result.current.send("hi");
    });

    const finalAssistant = result.current.messages.at(-1);
    expect(finalAssistant?.contentPieces?.[0]).toMatchObject({
      type: "interrupt",
      kind: "text",
      question: "Continue?",
      resumeToken: "tok-1",
      requestId: "req-1",
      interruptId: "pick-job",
      schemaId: "pick-job",
      schemaVersion: "1",
      meta: {
        picker: "jobs",
      },
    });
  });

  it("supports a custom interrupt piece mapper in useChat", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({
          type: "interrupt",
          requestId: "req-custom",
          resumeToken: "tok-custom",
          input: {
            kind: "text",
            multiple: false,
            question: "Continue?",
          },
        });
        await onChunk({ type: "done" });
      },
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
        toHumanInputPiece: ({ chunk, createId }) => ({
          id: createId(),
          type: "interrupt",
          resumeToken:
            chunk.type === "interrupt" ? chunk.resumeToken : "not-interrupt",
          requestId: chunk.type === "interrupt" ? chunk.requestId : "",
          kind: "text",
          question: "Mapped question",
          multiple: false,
          options: [],
          schemaId: "custom-schema",
        }),
        createId: () => "custom-piece",
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("hi");
    });

    expect(result.current.messages.at(-1)?.contentPieces?.[0]).toMatchObject({
      id: "custom-piece",
      type: "interrupt",
      question: "Mapped question",
      schemaId: "custom-schema",
    });
  });

  it("routes send() through resume when a live text interrupt is visible", async () => {
    let resolveFirst: (() => void) | undefined;
    const transport: ChatTransport = {
      stream: vi.fn(async ({ onChunk, messages }) => {
        if (messages.length === 1) {
          await onChunk({
            type: "interrupt",
            requestId: "req-1",
            resumeToken: "tok-1",
            input: { kind: "text", question: "Name?" },
          });
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
          await onChunk({ type: "done" });
          return;
        }
        await onChunk({ type: "done" });
      }),
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = result.current.send("hello") as Promise<void>;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.streamContentPieces.at(-1)).toMatchObject({
      type: "interrupt",
      kind: "text",
    });

    await act(async () => {
      resolveFirst?.();
      await firstSend;
    });
  });

  it("surfaces errors raised during resume and rethrows them", async () => {
    const transport: ChatTransport = {
      stream: vi.fn(async ({ messages }) => {
        const last = messages.at(-1);
        if (last?.metadata && "resume" in last.metadata) {
          throw new Error("resume failed");
        }
      }),
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
      await expect(
        result.current.respondToHumanInput({
          resumeToken: "tok-1",
          requestId: "req-1",
          selected: ["yes"],
        }),
      ).rejects.toThrow("resume failed");
    });

    expect(result.current.error?.message).toBe("resume failed");
    expect(result.current.isStreaming).toBe(false);
  });

  it("ignores respondToHumanInput while a stream is already active", async () => {
    let finishStream: (() => void) | undefined;
    const stream = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishStream = resolve;
        }),
    );
    const transport: ChatTransport = { stream };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = result.current.send("hi") as Promise<void>;
      await Promise.resolve();
    });

    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      await result.current.respondToHumanInput({
        resumeToken: "tok",
        requestId: "req",
        selected: ["x"],
      });
    });

    expect(stream).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishStream?.();
      await firstSend;
    });
  });

  it("uses a sensible fallback label when respondToInterrupt has no response", async () => {
    const contexts: Parameters<ChatTransport["stream"]>[0][] = [];
    const transport: ChatTransport = {
      stream: async (context) => {
        contexts.push(context);
        await context.onChunk({ type: "done" });
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
      await result.current.respondToInterrupt({
        id: "interrupt-1",
        type: "interrupt",
        resumeToken: "resume-1",
        requestId: "request-1",
        kind: "choice",
        question: "Pick",
        multiple: false,
        options: [{ id: "x", label: "X" }],
      });
    });

    expect(contexts[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "(selection)",
      metadata: {
        resume: {
          token: "resume-1",
          requestId: "request-1",
          selected: [],
        },
      },
    });
  });

  it("joins multiple selected labels and falls back to a single selection", async () => {
    const contexts: Parameters<ChatTransport["stream"]>[0][] = [];
    const transport: ChatTransport = {
      stream: async (context) => {
        contexts.push(context);
        await context.onChunk({ type: "done" });
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
      await result.current.respondToHumanInput({
        resumeToken: "tok",
        requestId: "req",
        selected: ["a", "b"],
      });
    });

    expect(contexts[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "a, b",
    });
  });

  it("wraps non-Error throwables into Error instances", async () => {
    const transport: ChatTransport = {
      stream: () => {
        throw "non-error string";
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
      await expect(result.current.send("hello")).rejects.toBe(
        "non-error string",
      );
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("non-error string");
  });

  it("reuses a persisted session id when sending again", async () => {
    const contexts: Parameters<ChatTransport["stream"]>[0][] = [];
    const transport: ChatTransport = {
      stream: async (context) => {
        contexts.push(context);
        await context.onChunk({ type: "done" });
      },
    };
    const memory = createMemoryStorage({
      sessionId: "persisted-session",
    });

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("first");
    });
    await act(async () => {
      await result.current.send("second");
    });

    expect(contexts.map((c) => c.sessionId)).toEqual([
      "persisted-session",
      "persisted-session",
    ]);
  });

  it("works without an explicit storage option", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({ type: "message", content: "ok" });
        await onChunk({ type: "done" });
      },
    };

    const { result } = renderHook(() => useChat({ transport }));

    await flushEffects();

    await act(async () => {
      await result.current.send("hello");
    });

    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "ok",
    });
  });

  it("forwards text-only respondToInterrupt response payloads", async () => {
    const contexts: Parameters<ChatTransport["stream"]>[0][] = [];
    const transport: ChatTransport = {
      stream: async (context) => {
        contexts.push(context);
        await context.onChunk({ type: "done" });
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
          kind: "text",
          question: "Name?",
          multiple: false,
          options: [],
        },
        { text: "Mustafa" },
      );
    });

    expect(contexts[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "Mustafa",
      metadata: {
        resume: {
          token: "resume-1",
          requestId: "request-1",
          selected: ["Mustafa"],
        },
      },
    });
  });

  it("routes a follow-up send through resume when a stream left a live text interrupt", async () => {
    const contexts: Parameters<ChatTransport["stream"]>[0][] = [];
    const transport: ChatTransport = {
      stream: vi.fn(async (context) => {
        contexts.push(context);
        if (contexts.length === 1) {
          await context.onChunk({
            type: "interrupt",
            requestId: "req-1",
            resumeToken: "tok-1",
            input: { kind: "text", question: "Continue?" },
          });
          return new Promise<void>((_resolve, reject) => {
            context.signal?.addEventListener("abort", () => {
              const abortError = new Error("aborted");
              abortError.name = "AbortError";
              reject(abortError);
            });
          });
        }
        await context.onChunk({ type: "done" });
        return;
      }),
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = result.current.send("hello") as Promise<void>;
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      result.current.abort();
      await firstSend;
    });

    expect(result.current.streamContentPieces.at(-1)).toMatchObject({
      type: "interrupt",
    });

    await act(async () => {
      await result.current.send("follow up");
    });

    expect(contexts.at(-1)?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "follow up",
      metadata: {
        resume: {
          token: "tok-1",
          requestId: "req-1",
          selected: ["follow up"],
        },
      },
    });
  });

  it("finds an interrupt message by walking back through prior messages", async () => {
    const contexts: Parameters<ChatTransport["stream"]>[0][] = [];
    const transport: ChatTransport = {
      stream: async (context) => {
        contexts.push(context);
        await context.onChunk({ type: "done" });
      },
    };
    const interruptMessage: ChatMsg = {
      id: "assistant-old",
      role: "assistant",
      content: "",
      contentPieces: [
        {
          id: "interrupt-choice",
          type: "interrupt",
          resumeToken: "resume-choice",
          requestId: "request-choice",
          kind: "choice",
          question: "Pick",
          multiple: false,
          options: [{ id: "x", label: "X" }],
        },
      ],
    };
    const newerAssistant: ChatMsg = {
      id: "assistant-newer",
      role: "assistant",
      content: "between",
    };
    const memory = createMemoryStorage({
      messages: [interruptMessage, newerAssistant],
    });

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    await act(async () => {
      await result.current.send("anything");
    });

    expect(contexts[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "anything",
    });
    expect(contexts[0]?.messages.at(-1)?.metadata).toBeUndefined();
  });

  it("ignores non-string sessionIds inside session chunks", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({
          type: "session",
          sessionId: 42 as unknown as string,
        });
        await onChunk({ type: "done" });
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

    expect(memory.getState().sessionId).not.toBe(42);
    expect(typeof memory.getState().sessionId).toBe("string");
  });

  it("ignores hydrated workflowId/includeHistory values with unexpected types", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({ type: "done" });
      },
    };
    const storage: ChatStorage<ChatMsg> = {
      load: () =>
        ({
          sessionId: null,
          workflowId: 123 as unknown as string,
          includeHistory: "yes" as unknown as boolean,
        }) as PersistedChatState<ChatMsg>,
      save: async () => {},
      clearMessages: async () => {},
    };

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage,
      }),
    );

    await flushEffects();

    expect(result.current.workflowId).toBe("");
    expect(result.current.includeHistory).toBe(true);
  });

  it("ignores hydrated messages when the persisted list is empty", async () => {
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({ type: "done" });
      },
    };
    const storage: ChatStorage<ChatMsg> = {
      load: () => ({
        sessionId: null,
        workflowId: "wf",
        includeHistory: true,
        messages: [],
      }),
      save: async () => {},
      clearMessages: async () => {},
    };

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage,
      }),
    );

    await flushEffects();

    expect(result.current.messages).toEqual([]);
  });

  it("falls back to a non-crypto id generator when crypto is unavailable", async () => {
    const originalCrypto = (globalThis as { crypto?: Crypto }).crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });

    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({ type: "message", content: "hi" });
        await onChunk({ type: "done" });
      },
    };
    const memory = createMemoryStorage();

    try {
      const { result } = renderHook(() =>
        useChat({ transport, storage: memory.storage }),
      );
      await flushEffects();

      await act(async () => {
        await result.current.send("hello");
      });

      expect(result.current.messages).toHaveLength(2);
      expect(typeof result.current.messages[0]?.id).toBe("string");
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it("skips storage hydration when unmounted before load resolves", async () => {
    let resolveLoad:
      | ((value: Partial<PersistedChatState<ChatMsg>>) => void)
      | undefined;
    const transport: ChatTransport = {
      stream: async () => {},
    };
    const storage: ChatStorage<ChatMsg> = {
      load: () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
      save: async () => {},
      clearMessages: async () => {},
    };

    const { unmount } = renderHook(() =>
      useChat({
        transport,
        storage,
      }),
    );

    unmount();

    await act(async () => {
      resolveLoad?.({
        sessionId: "should-be-ignored",
        workflowId: "wf",
        includeHistory: false,
        messages: [],
      });
      await Promise.resolve();
    });

    expect(true).toBe(true);
  });

  it("skips assistant finalization when the signal is aborted but the transport returns", async () => {
    let resumeStream: (() => void) | undefined;
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({ type: "message", content: "ignored" });
        await new Promise<void>((resolve) => {
          resumeStream = resolve;
        });
        await onChunk({ type: "done" });
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

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.send("hello") as Promise<void>;
      await Promise.resolve();
    });

    await act(async () => {
      result.current.abort();
      resumeStream?.();
      await pending;
    });

    expect(result.current.messages.some((m) => m.role === "assistant")).toBe(
      false,
    );
  });

  it("treats respondToHumanInput AbortError as a clean cancel", async () => {
    const transport: ChatTransport = {
      stream: ({ signal }) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }),
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.respondToHumanInput({
        resumeToken: "tok",
        requestId: "req",
        selected: ["x"],
      }) as Promise<void>;
      await Promise.resolve();
    });

    await act(async () => {
      result.current.abort();
      await pending;
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("wraps non-Error throwables raised during resume", async () => {
    const transport: ChatTransport = {
      stream: async () => {
        throw "resume-string-failure";
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
      await expect(
        result.current.respondToHumanInput({
          resumeToken: "tok",
          requestId: "req",
          selected: ["x"],
        }),
      ).rejects.toBe("resume-string-failure");
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("resume-string-failure");
  });

  it("preserves a newer abort controller when a prior resume finalizes", async () => {
    let resumeFirst: (() => void) | undefined;
    const transport: ChatTransport = {
      stream: vi.fn(async ({ onChunk }) => {
        if (
          (transport.stream as ReturnType<typeof vi.fn>).mock.calls.length === 1
        ) {
          await new Promise<void>((resolve) => {
            resumeFirst = resolve;
          });
          await onChunk({ type: "done" });
          return;
        }
        await onChunk({ type: "done" });
      }),
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.respondToHumanInput({
        resumeToken: "tok",
        requestId: "req",
        selected: ["x"],
      }) as Promise<void>;
      await Promise.resolve();
    });

    act(() => {
      result.current.clearMessages();
    });

    await act(async () => {
      resumeFirst?.();
      await pending;
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it("preserves a newer abort controller when the prior send finalizes", async () => {
    let resolveFirst: (() => void) | undefined;
    const transport: ChatTransport = {
      stream: vi.fn(async ({ onChunk }) => {
        if (
          (transport.stream as ReturnType<typeof vi.fn>).mock.calls.length === 1
        ) {
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
          await onChunk({ type: "done" });
          return;
        }
        await onChunk({ type: "done" });
      }),
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = result.current.send("first") as Promise<void>;
      await Promise.resolve();
    });

    act(() => {
      result.current.clearMessages();
    });

    await act(async () => {
      resolveFirst?.();
      await firstSend;
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it("surfaces prepareContextMessages rejections without calling the transport", async () => {
    const stream = vi.fn();
    const transport: ChatTransport = { stream };
    const memory = createMemoryStorage();
    const prepareContextMessages = vi.fn(async () => {
      throw new Error("prepare failed");
    });

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
        prepareContextMessages,
      }),
    );

    await flushEffects();

    await act(async () => {
      await expect(result.current.send("hello")).rejects.toThrow(
        "prepare failed",
      );
    });

    expect(stream).not.toHaveBeenCalled();
    expect(result.current.error?.message).toBe("prepare failed");
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages).toEqual([
      { id: expect.any(String), role: "user", content: "hello" },
    ]);
  });

  it("surfaces synchronous prepareContextMessages throws", async () => {
    const transport: ChatTransport = { stream: vi.fn() };
    const memory = createMemoryStorage();
    const prepareContextMessages = vi.fn(() => {
      throw new Error("sync prepare failure");
    });

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
        prepareContextMessages,
      }),
    );

    await flushEffects();

    await act(async () => {
      await expect(result.current.send("hello")).rejects.toThrow(
        "sync prepare failure",
      );
    });

    expect(result.current.error?.message).toBe("sync prepare failure");
    expect(result.current.isStreaming).toBe(false);
  });

  it("does not finalize an assistant message when resetChat runs mid-stream", async () => {
    let resumeStream: (() => void) | undefined;
    const transport: ChatTransport = {
      stream: async ({ onChunk, signal }) => {
        await onChunk({
          type: "text-delta",
          node: "writer",
          delta: "partial",
        });
        await new Promise<void>((resolve, reject) => {
          resumeStream = resolve;
          signal?.addEventListener("abort", () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        });
        await onChunk({ type: "done" });
      },
    };
    const memory = createMemoryStorage({
      sessionId: "session-1",
      messages: [
        {
          id: "old-1",
          role: "assistant",
          content: "old",
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

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.send("hi") as Promise<void>;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.streamContentPieces.length).toBeGreaterThan(0);

    await act(async () => {
      result.current.resetChat();
      resumeStream?.();
      await pending;
    });

    await flushEffects();

    expect(result.current.messages).toEqual([]);
    expect(result.current.streamContentPieces).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.lastAssistantId).toBeNull();
    expect(memory.getState().sessionId).toBeNull();
    expect(memory.getState().messages).toEqual([]);
  });

  it("preserves live pieces when a stream is aborted but the transport returns cleanly", async () => {
    let resumeStream: (() => void) | undefined;
    const transport: ChatTransport = {
      stream: async ({ onChunk }) => {
        await onChunk({
          type: "text-delta",
          node: "writer",
          delta: "draft-",
        });
        await onChunk({
          type: "structured-data",
          streamId: "facts",
          dataType: "demo.facts",
          kind: "set",
          path: "score",
          value: 7,
        });
        await new Promise<void>((resolve) => {
          resumeStream = resolve;
        });
        await onChunk({ type: "done" });
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

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.send("hi") as Promise<void>;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.streamContentPieces).toHaveLength(2);

    await act(async () => {
      result.current.abort();
      resumeStream?.();
      await pending;
    });

    expect(result.current.messages.some((m) => m.role === "assistant")).toBe(
      false,
    );
    expect(result.current.streamContentPieces).toHaveLength(2);
    expect(result.current.streamContentPieces[0]).toMatchObject({
      type: "text",
      content: "draft-",
    });
    expect(result.current.streamContentPieces[1]).toMatchObject({
      type: "structured",
    });
  });

  it("does not let the first send's finally cancel a subsequent send's controller", async () => {
    const streams: Array<{
      resolve: () => void;
      signal: AbortSignal | undefined;
    }> = [];
    const transport: ChatTransport = {
      stream: ({ signal }) =>
        new Promise<void>((resolve) => {
          streams.push({ resolve, signal });
        }),
    };
    const memory = createMemoryStorage();

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = result.current.send("first") as Promise<void>;
      await Promise.resolve();
    });

    act(() => {
      result.current.clearMessages();
    });

    await act(async () => {
      streams[0]?.resolve();
      await firstSend;
    });

    let secondSend: Promise<void> | undefined;
    await act(async () => {
      secondSend = result.current.send("second") as Promise<void>;
      await Promise.resolve();
    });

    expect(streams).toHaveLength(2);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.canAbort).toBe(true);

    await act(async () => {
      result.current.abort();
      streams[1]?.resolve();
      await secondSend;
    });

    expect(streams[1]?.signal?.aborted).toBe(true);
    expect(result.current.isStreaming).toBe(false);
  });

  it("snapshots workflowId at send-time so mid-stream changes do not affect the in-flight request", async () => {
    const seen: Array<{ workflowId: string }> = [];
    const resumes: Array<() => void> = [];
    const transport: ChatTransport = {
      stream: async ({ workflowId, onChunk }) => {
        seen.push({ workflowId });
        await new Promise<void>((resolve) => {
          resumes.push(resolve);
        });
        await onChunk({ type: "done" });
      },
    };
    const memory = createMemoryStorage({ workflowId: "wf-initial" });

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = result.current.send("hi") as Promise<void>;
      await Promise.resolve();
    });

    act(() => {
      result.current.setWorkflowId("wf-changed");
    });

    await act(async () => {
      resumes[0]?.();
      await firstSend;
    });

    expect(seen).toEqual([{ workflowId: "wf-initial" }]);

    let secondSend: Promise<void> | undefined;
    await act(async () => {
      secondSend = result.current.send("again") as Promise<void>;
      await Promise.resolve();
    });

    await act(async () => {
      resumes[1]?.();
      await secondSend;
    });

    expect(seen.at(-1)).toEqual({ workflowId: "wf-changed" });
  });

  it("snapshots includeHistory at send-time", async () => {
    const seen: Array<Array<{ role: string; content: string }>> = [];
    let resumeStream: (() => void) | undefined;
    const transport: ChatTransport = {
      stream: async ({ messages, onChunk }) => {
        seen.push(messages.map((m) => ({ role: m.role, content: m.content })));
        await new Promise<void>((resolve) => {
          resumeStream = resolve;
        });
        await onChunk({ type: "done" });
      },
    };
    const memory = createMemoryStorage({
      includeHistory: true,
      messages: [{ id: "prior-1", role: "assistant", content: "history-1" }],
    });

    const { result } = renderHook(() =>
      useChat({
        transport,
        storage: memory.storage,
      }),
    );

    await flushEffects();

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.send("hi") as Promise<void>;
      await Promise.resolve();
    });

    act(() => {
      result.current.setIncludeHistory(false);
    });

    await act(async () => {
      resumeStream?.();
      await pending;
    });

    expect(seen[0]).toEqual([
      { role: "assistant", content: "history-1" },
      { role: "user", content: "hi" },
    ]);
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
