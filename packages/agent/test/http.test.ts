import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../src";
import {
  createChatRouteHandler,
  createCheckpointRouteHandler,
  handleChatRequestBody,
  handleCheckpointRequestBody,
  parseChatRequestBody,
  parseCheckpointRequestBody,
} from "../src/adapters/http";
import { extractLatestUserMessage } from "../src/utils/extract-latest-message";

async function* chunks() {
  yield { type: "message", content: "hello" } as const;
  yield { type: "done" } as const;
}

const createMockAgent = (overrides: Partial<Agent> = {}): Agent =>
  ({
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

  it("returns successful chat responses and stringified non-error failures", async () => {
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

    expect(failed.status).toBe(400);
    await expect(failed.json()).resolves.toEqual({ error: "plain failure" });
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
