import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../src";
import {
  createChatRouteHandler,
  createCheckpointRouteHandler,
  createFailureResponse,
  handleChatRequestBody,
  handleCheckpointRequestBody,
  parseChatRequestBody,
  parseCheckpointRequestBody,
  readRequestJson,
} from "../src/adapters/http";
import { extractLatestUserMessage } from "../src/utils/extract-latest-message";

async function* chunks() {
  yield { type: "message", content: "hello" } as const;
  yield { type: "done" } as const;
}

const createMockAgent = (overrides: Partial<Agent> = {}): Agent =>
  ({
    listInterrupts: vi.fn(async () => []),
    getInterrupt: vi.fn(async () => null),
    execute: vi.fn(),
    resume: vi.fn(),
    streamChat: vi.fn(async () => chunks()),
    listCheckpoints: vi.fn(async () => []),
    getCheckpoint: vi.fn(async () => null),
    rollbackTo: vi.fn(async (id: string) => ({
      sessionId: "session-1",
      head: id,
      invalidatedStructuredStreamIds: [],
      invalidatedInterruptTokens: [],
      activePendingRequests: [],
    })),
    fork: vi.fn(async (id: string) => ({
      sessionId: "child-session",
      parentSessionId: "session-1",
      forkedFrom: id,
      checkpoint: {
        id: "child-checkpoint",
        sessionId: "child-session",
        runId: "run-1",
        turnIndex: 1,
        createdAt: 1,
        nodes: [],
        workflow: "workflow-1",
        state: {} as never,
        effects: { structuredStreamIds: [], interruptTokens: [] },
        activePendingRequests: [],
      },
    })),
    ...overrides,
  }) satisfies Agent;

describe("parseChatRequestBody", () => {
  it.each([
    null,
    [],
    "text",
    42,
    false,
  ])("rejects non-object JSON commands: %j", async (value) => {
    await expect(
      readRequestJson(
        new Request("https://kortyx.test/api", {
          method: "POST",
          body: JSON.stringify(value),
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST", retryable: false });
  });

  it("propagates request cancellation through JSON parsing and custom responses", async () => {
    const aborted = new DOMException("Cancelled", "AbortError");
    const request = new Request("https://kortyx.test/api");
    vi.spyOn(request, "json").mockRejectedValue(aborted);
    await expect(readRequestJson(request)).rejects.toBe(aborted);
    expect(() => createFailureResponse(aborted)).toThrow(aborted);
  });

  it("trims optional ids and preserves valid messages", () => {
    expect(
      parseChatRequestBody({
        sessionId: " session-1 ",
        workflowId: " support ",
        stream: false,
        context: { userId: "user-1" },
        ignored: true,
        messages: [
          {
            role: "user",
            content: "hello",
            metadata: { resume: { selected: ["a"] } },
          },
        ],
      }),
    ).toEqual({
      sessionId: "session-1",
      workflowId: "support",
      stream: false,
      context: { userId: "user-1" },
      messages: [
        {
          role: "user",
          content: "hello",
          metadata: { resume: { selected: ["a"] } },
        },
      ],
    });
  });

  it("rejects invalid message shapes", () => {
    expect(() =>
      parseChatRequestBody({
        messages: [{ role: "tool", content: "bad" }],
      }),
    ).toThrow();
  });
});

describe("handleChatRequestBody", () => {
  it("rejects direct finalization without a stable session and turn ID", async () => {
    const streamChat = vi.fn(async () => chunks());
    await expect(
      handleChatRequestBody({
        agent: createMockAgent({ streamChat }),
        body: { messages: [{ role: "user", content: "hello" }] },
        onResponseFinalized: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(streamChat).not.toHaveBeenCalled();
  });

  it("buffers the agent stream when stream=false", async () => {
    const streamChat = vi.fn(async () => chunks());
    const response = await handleChatRequestBody({
      agent: createMockAgent({ streamChat }),
      body: {
        sessionId: "session-1",
        workflowId: "workflow-1",
        context: { userId: "user-1" },
        stream: false,
        messages: [{ role: "user", content: "hello" }],
      },
    });

    expect(response.headers.get("content-type")).toBe("application/json");
    expect(streamChat).toHaveBeenCalledWith(
      [{ role: "user", content: "hello" }],
      {
        sessionId: "session-1",
        workflowId: "workflow-1",
        context: { userId: "user-1" },
      },
    );
    await expect(response.json()).resolves.toMatchObject({
      text: "hello",
      chunks: [{ type: "message", content: "hello" }, { type: "done" }],
    });
  });

  it("returns an SSE response by default", async () => {
    const streamChat = vi.fn(async () => chunks());
    const response = await handleChatRequestBody({
      agent: createMockAgent({ streamChat }),
      body: {
        messages: [{ role: "user", content: "hello" }],
      },
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });
});

describe("createChatRouteHandler", () => {
  it("requires a user message for lifecycle hooks", async () => {
    const streamChat = vi.fn(async () => chunks());
    const handler = createChatRouteHandler({
      agent: createMockAgent({ streamChat }),
      onTurnAccepted: vi.fn(),
    });
    const response = await handler(
      new Request("https://kortyx.test/chat", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          clientTurnId: "turn-1",
          messages: [{ role: "assistant", content: "hello" }],
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it("marks a valid resume message as an interrupt response", async () => {
    const onTurnAccepted = vi.fn();
    const handler = createChatRouteHandler({
      agent: createMockAgent(),
      onTurnAccepted,
    });
    const response = await handler(
      new Request("https://kortyx.test/chat", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          clientTurnId: "turn-1",
          stream: false,
          messages: [
            {
              role: "user",
              content: "yes",
              metadata: {
                resume: {
                  token: "token",
                  requestId: "request",
                  selected: ["yes"],
                },
              },
            },
          ],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(onTurnAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "interrupt-response" }),
    );
  });

  it("contains errors thrown by the lifecycle error reporter", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const handler = createChatRouteHandler({
        agent: createMockAgent(),
        onTurnAccepted: () => {
          throw new Error("save failed");
        },
        onLifecycleError: () => {
          throw new Error("report failed");
        },
      });
      const response = await handler(
        new Request("https://kortyx.test/chat", {
          method: "POST",
          body: JSON.stringify({
            sessionId: "session-1",
            clientTurnId: "turn-1",
            messages: [{ role: "user", content: "hello" }],
          }),
        }),
      );
      expect(response.status).toBe(503);
      expect(log).toHaveBeenCalledWith(
        "[chat:onLifecycleError]",
        expect.any(Object),
      );
    } finally {
      log.mockRestore();
    }
  });

  it("logs a hook failure when no error reporter is configured", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const handler = createChatRouteHandler({
        agent: createMockAgent(),
        onTurnAccepted: () => {
          throw new Error("save failed");
        },
      });
      const response = await handler(
        new Request("https://kortyx.test/chat", {
          method: "POST",
          body: JSON.stringify({
            sessionId: "session-1",
            clientTurnId: "turn-1",
            messages: [{ role: "user", content: "hello" }],
          }),
        }),
      );
      expect(response.status).toBe(503);
      expect(log).toHaveBeenCalledWith(
        "[chat:lifecycle]",
        expect.objectContaining({ code: "CHAT_LIFECYCLE_HOOK_FAILED" }),
      );
    } finally {
      log.mockRestore();
    }
  });

  it("requires stable IDs with lifecycle hooks and writes the accepted turn before starting", async () => {
    const order: string[] = [];
    const streamChat = vi.fn(async () => {
      order.push("run");
      return chunks();
    });
    const handler = createChatRouteHandler({
      agent: createMockAgent({ streamChat }),
      onTurnAccepted: async (event) => {
        order.push("accepted");
        expect(event).toMatchObject({
          sessionId: "session-1",
          clientTurnId: "turn-1",
          kind: "prompt",
          userMessage: { role: "user", content: "hello" },
        });
      },
    });
    const missingId = await handler(
      new Request("https://kortyx.test/chat", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );
    expect(missingId.status).toBe(400);
    expect(streamChat).not.toHaveBeenCalled();

    const response = await handler(
      new Request("https://kortyx.test/chat", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          clientTurnId: "turn-1",
          stream: false,
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(order).toEqual(["accepted", "run"]);
  });

  it("rejects a failed acceptance hook before execution with a typed error", async () => {
    const streamChat = vi.fn(async () => chunks());
    const onLifecycleError = vi.fn();
    const handler = createChatRouteHandler({
      agent: createMockAgent({ streamChat }),
      onTurnAccepted: () => {
        throw new Error("database unavailable");
      },
      onLifecycleError,
    });
    const response = await handler(
      new Request("https://kortyx.test/chat", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          clientTurnId: "turn-1",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );
    expect(response.status).toBe(503);
    expect(streamChat).not.toHaveBeenCalled();
    expect(onLifecycleError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "turn-accepted",
        clientTurnId: "turn-1",
        error: expect.objectContaining({ code: "CHAT_LIFECYCLE_HOOK_FAILED" }),
      }),
    );
  });

  it("requires a host lifetime callback to continue after disconnect", () => {
    expect(() =>
      createChatRouteHandler({
        agent: createMockAgent(),
        disconnect: "continue",
      }),
    ).toThrow("requires onExecution");
  });
  it("returns JSON errors with the configured status", async () => {
    const handler = createChatRouteHandler({
      agent: createMockAgent(),
      errorStatus: 422,
    });

    const response = await handler(
      new Request("https://kortyx.test/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "bad", content: "x" }] }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });

  it("returns successful chat responses and safe server failure descriptors", async () => {
    const handler = createChatRouteHandler({
      agent: createMockAgent(),
    });

    const response = await handler(
      new Request("https://kortyx.test/api/chat", {
        method: "POST",
        body: JSON.stringify({
          stream: false,
          messages: [{ role: "user", content: "x" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ text: "hello" });

    const failing = createChatRouteHandler({
      agent: createMockAgent({
        streamChat: vi.fn(async () => {
          throw "plain failure";
        }),
      }),
    });
    const failed = await failing(
      new Request("https://kortyx.test/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "x" }],
        }),
      }),
    );

    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toMatchObject({
      error: "An unexpected error occurred.",
      failure: { code: "EXECUTION_FAILED" },
    });
  });
});

describe("checkpoint HTTP helpers", () => {
  it("parses checkpoint actions", () => {
    expect(
      parseCheckpointRequestBody({
        action: "list",
        sessionId: "session-1",
      }),
    ).toEqual({ action: "list", sessionId: "session-1" });
    expect(() =>
      parseCheckpointRequestBody({
        action: "rollback",
        checkpointId: "",
      }),
    ).toThrow();
  });

  it("dispatches list, get, rollback, and fork checkpoint requests to the agent", async () => {
    const listCheckpoints = vi.fn(async () => [
      {
        id: "cp-1",
        sessionId: "session-1",
        turnIndex: 0,
        createdAt: 1,
        nodes: [],
        workflow: "workflow-1",
      },
    ]);
    const getCheckpoint = vi.fn(async (id: string) => ({
      id,
      sessionId: "session-1",
      runId: "run-1",
      turnIndex: 0,
      createdAt: 1,
      nodes: [],
      workflow: "workflow-1",
      state: {} as never,
      effects: { structuredStreamIds: [], interruptTokens: [] },
      activePendingRequests: [],
    }));
    const rollbackTo = vi.fn(async (id: string) => ({
      sessionId: "session-1",
      head: id,
      invalidatedStructuredStreamIds: ["stream-1"],
      invalidatedInterruptTokens: ["token-1"],
      activePendingRequests: [],
    }));
    const fork = vi.fn(
      async (id: string, options?: { newSessionId?: string }) => ({
        sessionId: options?.newSessionId ?? "child-session",
        parentSessionId: "session-1",
        forkedFrom: id,
        checkpoint: {
          id: "child-checkpoint",
          sessionId: options?.newSessionId ?? "child-session",
          runId: "run-1",
          turnIndex: 0,
          createdAt: 1,
          nodes: [],
          workflow: "workflow-1",
          state: {} as never,
          effects: { structuredStreamIds: [], interruptTokens: [] },
          activePendingRequests: [],
        },
      }),
    );
    const agent = createMockAgent({
      listCheckpoints,
      getCheckpoint,
      rollbackTo,
      fork,
    });

    const listResponse = await handleCheckpointRequestBody({
      agent,
      body: { action: "list", sessionId: "session-1" },
    });
    expect(listCheckpoints).toHaveBeenCalledWith("session-1");
    await expect(listResponse.json()).resolves.toMatchObject([{ id: "cp-1" }]);

    const getResponse = await handleCheckpointRequestBody({
      agent,
      body: { action: "get", checkpointId: "cp-1" },
    });
    expect(getCheckpoint).toHaveBeenCalledWith("cp-1");
    await expect(getResponse.json()).resolves.toMatchObject({ id: "cp-1" });

    const rollbackResponse = await handleCheckpointRequestBody({
      agent,
      body: { action: "rollback", checkpointId: "cp-1" },
    });
    expect(rollbackTo).toHaveBeenCalledWith("cp-1");
    await expect(rollbackResponse.json()).resolves.toMatchObject({
      head: "cp-1",
      invalidatedStructuredStreamIds: ["stream-1"],
    });

    const forkResponse = await handleCheckpointRequestBody({
      agent,
      body: { action: "fork", checkpointId: "cp-1", newSessionId: "child" },
    });
    expect(fork).toHaveBeenCalledWith("cp-1", { newSessionId: "child" });
    await expect(forkResponse.json()).resolves.toMatchObject({
      sessionId: "child",
      forkedFrom: "cp-1",
    });
  });

  it("omits fork options when no child session id is provided", async () => {
    const fork = vi.fn(createMockAgent().fork);
    await handleCheckpointRequestBody({
      agent: createMockAgent({ fork }),
      body: { action: "fork", checkpointId: "cp-1" },
    });

    expect(fork).toHaveBeenCalledWith("cp-1", {});
  });

  it("reports completed checkpoint mutations without treating app hook failures as runtime failures", async () => {
    const onForked = vi.fn(async () => {
      throw new Error("app database failed");
    });
    const onRolledBack = vi.fn();
    const onLifecycleError = vi.fn();
    const handler = createCheckpointRouteHandler({
      agent: createMockAgent(),
      onForked,
      onRolledBack,
      onLifecycleError,
    });
    const forked = await handler(
      new Request("https://kortyx.test/checkpoints", {
        method: "POST",
        body: JSON.stringify({ action: "fork", checkpointId: "cp-1" }),
      }),
    );
    expect(forked.status).toBe(200);
    expect(onForked).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSessionId: "session-1",
        newSessionId: "child-session",
        sourceCheckpointId: "cp-1",
        newCheckpointId: "child-checkpoint",
      }),
    );
    expect(onLifecycleError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "forked",
        error: expect.objectContaining({ code: "CHAT_LIFECYCLE_HOOK_FAILED" }),
      }),
    );

    const rolledBack = await handler(
      new Request("https://kortyx.test/checkpoints", {
        method: "POST",
        body: JSON.stringify({ action: "rollback", checkpointId: "cp-1" }),
      }),
    );
    expect(rolledBack.status).toBe(200);
    expect(onRolledBack).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        headCheckpointId: "cp-1",
        invalidatedStructuredStreamIds: [],
      }),
    );
  });

  it("preserves a rollback when its app hook fails", async () => {
    const onLifecycleError = vi.fn();
    const handler = createCheckpointRouteHandler({
      agent: createMockAgent(),
      onRolledBack: () => {
        throw new Error("save failed");
      },
      onLifecycleError,
    });
    const response = await handler(
      new Request("https://kortyx.test/checkpoints", {
        method: "POST",
        body: JSON.stringify({ action: "rollback", checkpointId: "cp-1" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(onLifecycleError).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "rolled-back" }),
    );
  });

  it("returns JSON errors from the checkpoint route", async () => {
    const handler = createCheckpointRouteHandler({
      agent: createMockAgent(),
      errorStatus: 422,
    });
    const response = await handler(
      new Request("https://kortyx.test/api/checkpoints", {
        method: "POST",
        body: JSON.stringify({ action: "missing" }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });
});

describe("extractLatestUserMessage", () => {
  it("classifies request JSON and server failures independently in both route handlers", async () => {
    for (const create of [
      createChatRouteHandler,
      createCheckpointRouteHandler,
    ]) {
      const invalid = await create({ agent: createMockAgent() })(
        new Request("https://kortyx.test/api", { method: "POST", body: "{" }),
      );
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({
        failure: { code: "INVALID_REQUEST", category: "request" },
      });
    }
    const handler = createCheckpointRouteHandler({
      agent: createMockAgent({
        getCheckpoint: async () => {
          throw new SyntaxError("secret database content");
        },
      }),
    });
    const response = await handler(
      new Request("https://kortyx.test/api", {
        method: "POST",
        body: JSON.stringify({ action: "get", checkpointId: "cp" }),
      }),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(
      "secret database content",
    );
  });
  it("returns the last non-empty user message", () => {
    expect(
      extractLatestUserMessage([
        { role: "user", content: " first " },
        { role: "assistant", content: "reply" },
        { role: "user", content: "   " },
        { role: "user", content: " latest " },
      ]),
    ).toBe("latest");
    expect(extractLatestUserMessage([])).toBe("");
    expect(
      extractLatestUserMessage([
        { role: "assistant", content: "reply" },
        { role: "system", content: "system" },
      ]),
    ).toBe("");
  });
});
