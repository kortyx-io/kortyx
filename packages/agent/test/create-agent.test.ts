import type { WorkflowDefinition } from "@kortyx/core";
import {
  createFileWorkflowRegistry,
  createFrameworkAdapterFromEnv,
  createInMemoryWorkflowRegistry,
  type FrameworkAdapter,
  type WorkflowRegistry,
} from "@kortyx/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgent } from "../src";
import { streamChat as runStreamChat } from "../src/chat/process-chat";

const mocks = vi.hoisted(() => ({
  createFrameworkAdapterFromEnv: vi.fn(() => ({
    checkpointer: "env-checkpointer",
  })),
  createInMemoryWorkflowRegistry: vi.fn(() => ({ select: vi.fn() })),
  createFileWorkflowRegistry: vi.fn(() => ({ select: vi.fn() })),
  runStreamChat: vi.fn(async function* () {
    yield { type: "done" };
  }),
}));

vi.mock("@kortyx/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kortyx/runtime")>();
  return {
    ...actual,
    createFrameworkAdapterFromEnv: mocks.createFrameworkAdapterFromEnv,
    createInMemoryWorkflowRegistry: mocks.createInMemoryWorkflowRegistry,
    createFileWorkflowRegistry: mocks.createFileWorkflowRegistry,
  };
});

vi.mock("../src/chat/process-chat", () => ({
  streamChat: mocks.runStreamChat,
}));

describe("createAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createFrameworkAdapterFromEnv.mockReturnValue({
      checkpointer: "env-checkpointer",
    });
    mocks.createInMemoryWorkflowRegistry.mockReturnValue({ select: vi.fn() });
    mocks.createFileWorkflowRegistry.mockReturnValue({ select: vi.fn() });
    mocks.runStreamChat.mockImplementation(async function* () {
      yield { type: "done" };
    });
  });

  it("rejects invalid construction arguments", () => {
    expect(() =>
      createAgent({
        getProvider: "bad",
      } as unknown as Parameters<typeof createAgent>[0]),
    ).toThrow("Expected `args.getProvider` to be a function.");
    expect(() =>
      createAgent({
        workflows: [],
        workflowsDir: "src/workflows",
      }),
    ).toThrow(
      "Use only one workflow source: `workflows`, `workflowsDir`, or `workflowRegistry`.",
    );
  });

  it("creates an in-memory registry from workflow definitions", async () => {
    const getProvider = vi.fn();
    const frameworkAdapter = { checkpointer: "custom-checkpointer" };
    const workflow = { id: "workflow-1" } as WorkflowDefinition;
    const trace = { startSpan: vi.fn() };
    const agent = createAgent({
      workflows: [workflow],
      defaultWorkflowId: "workflow-1",
      frameworkAdapter: frameworkAdapter as unknown as FrameworkAdapter,
      getProvider,
      telemetry: { trace },
    });

    await agent.streamChat([{ role: "user", content: "hello" }], {
      sessionId: "session-1",
      workflowId: "workflow-1",
      context: { userId: "user-1" },
    });

    expect(createInMemoryWorkflowRegistry).toHaveBeenCalledWith([workflow], {
      fallbackId: "workflow-1",
    });
    expect(runStreamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultWorkflowId: "workflow-1",
        messages: [{ role: "user", content: "hello" }],
        options: {
          sessionId: "session-1",
          workflowId: "workflow-1",
          context: { userId: "user-1" },
        },
        frameworkAdapter,
        getProvider,
      }),
    );
    const args = vi.mocked(runStreamChat).mock.calls[0]?.[0];
    expect(args).toBeDefined();
    if (!args) throw new Error("Expected streamChat to be called.");
    expect(args.loadRuntimeConfig({ sessionId: "session-1" })).toEqual({
      session: { id: "session-1" },
      telemetry: { trace },
    });
    expect(
      args.loadRuntimeConfig({
        sessionId: "session-1",
        context: { userId: "user-1" },
      }),
    ).toEqual({
      session: { id: "session-1" },
      context: { userId: "user-1" },
      telemetry: { trace },
    });
    expect(args.loadRuntimeConfig()).toEqual({ telemetry: { trace } });
  });

  it("delegates checkpoint APIs through the framework adapter and syncs pending requests", async () => {
    const pendingRequests = {
      delete: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    };
    const getLatestCheckpointId = vi.fn(
      async (_runId: string, checkpointNs?: string) =>
        checkpointNs === "" ? "graph-cp-1" : undefined,
    );
    const deleteCheckpointWrites = vi.fn(async () => undefined);
    const sessionCheckpoints = {
      list: vi.fn(async () => [
        {
          id: "cp-1",
          sessionId: "session-1",
          turnIndex: 0,
          createdAt: 1,
          nodes: [],
          workflow: "workflow-1",
        },
      ]),
      get: vi.fn(async (id: string) => ({
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
      })),
      rollbackTo: vi.fn(async (id: string) => ({
        sessionId: "session-1",
        head: id,
        invalidatedStructuredStreamIds: ["stream-1"],
        invalidatedInterruptTokens: ["old-token"],
        activePendingRequests: [
          {
            token: "active-token",
            requestId: "human-1",
            runId: "run-1",
            workflow: "workflow-1",
            node: "ask",
            schema: { kind: "choice", multiple: false },
            options: [],
            createdAt: 1,
            ttlMs: 1000,
          },
        ],
      })),
      fork: vi.fn(async (id: string, options?: { newSessionId?: string }) => ({
        sessionId: options?.newSessionId ?? "child",
        parentSessionId: "session-1",
        forkedFrom: id,
        checkpoint: {
          id: "child-cp",
          sessionId: options?.newSessionId ?? "child",
          runId: "run-1",
          turnIndex: 0,
          createdAt: 1,
          nodes: [],
          workflow: "workflow-1",
          state: {} as never,
          effects: { structuredStreamIds: [], interruptTokens: [] },
          activePendingRequests: [
            {
              token: "child-token",
              requestId: "human-2",
              runId: "run-1",
              workflow: "workflow-1",
              node: "ask",
              schema: { kind: "choice", multiple: false },
              options: [],
              createdAt: 1,
              ttlMs: 1000,
            },
          ],
        },
      })),
    };
    const agent = createAgent({
      workflows: [{ id: "workflow-1" } as WorkflowDefinition],
      frameworkAdapter: {
        checkpointer: { getLatestCheckpointId, deleteCheckpointWrites },
        pendingRequests,
        sessionCheckpoints,
      } as unknown as FrameworkAdapter,
    });

    await expect(agent.listCheckpoints("session-1")).resolves.toMatchObject([
      { id: "cp-1" },
    ]);
    await expect(agent.getCheckpoint("cp-1")).resolves.toMatchObject({
      id: "cp-1",
    });

    await expect(agent.rollbackTo("cp-1")).resolves.toMatchObject({
      head: "cp-1",
      invalidatedInterruptTokens: ["old-token"],
    });
    expect(pendingRequests.delete).toHaveBeenCalledWith("old-token");
    expect(getLatestCheckpointId).toHaveBeenCalledWith("run-1", "workflow-1");
    expect(getLatestCheckpointId).toHaveBeenCalledWith("run-1", "");
    expect(deleteCheckpointWrites).toHaveBeenCalledWith(
      "run-1",
      "workflow-1",
      "graph-cp-1",
    );
    expect(deleteCheckpointWrites).toHaveBeenCalledWith(
      "run-1",
      "",
      "graph-cp-1",
    );
    expect(pendingRequests.save).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "active-token",
        graphCheckpointId: "graph-cp-1",
      }),
    );

    await expect(
      agent.fork("cp-1", { newSessionId: "child-session" }),
    ).resolves.toMatchObject({
      sessionId: "child-session",
      forkedFrom: "cp-1",
    });
    expect(pendingRequests.save).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "child-token",
        graphCheckpointId: "graph-cp-1",
      }),
    );
    expect(deleteCheckpointWrites).toHaveBeenCalledTimes(4);
  });

  it("clears graph writes for every hydrated rollback pending request", async () => {
    const pendingRequests = {
      delete: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    };
    const getLatestCheckpointId = vi.fn(
      async (runId: string, checkpointNs?: string) => {
        if (runId === "run-hydrate" && checkpointNs === "workflow-1") {
          return "workflow-graph-cp";
        }
        return undefined;
      },
    );
    const deleteCheckpointWrites = vi.fn(async () => undefined);
    const sessionCheckpoints = {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      rollbackTo: vi.fn(async (id: string) => ({
        sessionId: "session-1",
        head: id,
        invalidatedStructuredStreamIds: [],
        invalidatedInterruptTokens: ["old-depth-token", "old-final-token"],
        activePendingRequests: [
          {
            token: "hydrate-token",
            requestId: "human-hydrate",
            runId: "run-hydrate",
            workflow: "workflow-1",
            node: "selectTemplate",
            schema: { kind: "choice", multiple: false },
            options: [],
            createdAt: 1,
            ttlMs: 1000,
          },
          {
            token: "stored-token",
            requestId: "human-stored",
            runId: "run-stored",
            workflow: "workflow-2",
            node: "selectDepth",
            schema: { kind: "choice", multiple: false },
            options: [],
            createdAt: 1,
            ttlMs: 1000,
            graphCheckpointId: "stored-graph-cp",
          },
          {
            token: "unhydrated-token",
            requestId: "human-unhydrated",
            runId: "run-unhydrated",
            workflow: "workflow-3",
            node: "ask",
            schema: { kind: "text" },
            options: [],
            createdAt: 1,
            ttlMs: 1000,
          },
        ],
      })),
      fork: vi.fn(),
    };
    const agent = createAgent({
      workflows: [{ id: "workflow-1" } as WorkflowDefinition],
      frameworkAdapter: {
        checkpointer: { getLatestCheckpointId, deleteCheckpointWrites },
        pendingRequests,
        sessionCheckpoints,
      } as unknown as FrameworkAdapter,
    });

    const result = await agent.rollbackTo("cp-template");
    expect(result.activePendingRequests).toEqual([
      expect.objectContaining({
        token: "hydrate-token",
        graphCheckpointId: "workflow-graph-cp",
      }),
      expect.objectContaining({
        token: "stored-token",
        graphCheckpointId: "stored-graph-cp",
      }),
      expect.objectContaining({
        token: "unhydrated-token",
      }),
    ]);
    expect(result.activePendingRequests[2]).not.toHaveProperty(
      "graphCheckpointId",
    );

    expect(pendingRequests.delete).toHaveBeenCalledWith("old-depth-token");
    expect(pendingRequests.delete).toHaveBeenCalledWith("old-final-token");
    expect(pendingRequests.save).toHaveBeenCalledTimes(3);
    expect(deleteCheckpointWrites).toHaveBeenCalledTimes(4);
    expect(deleteCheckpointWrites).toHaveBeenCalledWith(
      "run-hydrate",
      "workflow-1",
      "workflow-graph-cp",
    );
    expect(deleteCheckpointWrites).toHaveBeenCalledWith(
      "run-hydrate",
      "",
      "workflow-graph-cp",
    );
    expect(deleteCheckpointWrites).toHaveBeenCalledWith(
      "run-stored",
      "workflow-2",
      "stored-graph-cp",
    );
    expect(deleteCheckpointWrites).toHaveBeenCalledWith(
      "run-stored",
      "",
      "stored-graph-cp",
    );
    expect(getLatestCheckpointId).toHaveBeenCalledWith(
      "run-hydrate",
      "workflow-1",
    );
    expect(getLatestCheckpointId).toHaveBeenCalledWith(
      "run-unhydrated",
      "workflow-3",
    );
    expect(getLatestCheckpointId).toHaveBeenCalledWith("run-unhydrated", "");
  });

  it("uses the general-chat fallback for in-memory workflows without a default", async () => {
    const workflow = { id: "workflow-1" } as WorkflowDefinition;
    const agent = createAgent({ workflows: [workflow] });

    await agent.streamChat([{ role: "user", content: "hello" }]);

    expect(createInMemoryWorkflowRegistry).toHaveBeenLastCalledWith(
      [workflow],
      {
        fallbackId: "general-chat",
      },
    );
  });

  it("creates file registries from explicit and default workflow directories", async () => {
    const explicit = createAgent({ workflowsDir: "custom/workflows" });
    await explicit.streamChat([{ role: "user", content: "hello" }]);

    expect(createFileWorkflowRegistry).toHaveBeenCalledWith({
      workflowsDir: "custom/workflows",
      fallbackId: "general-chat",
    });

    const cwd = process.cwd();
    const implicit = createAgent({});
    await implicit.streamChat([{ role: "user", content: "hello" }]);

    expect(createFrameworkAdapterFromEnv).toHaveBeenCalled();
    expect(createFileWorkflowRegistry).toHaveBeenLastCalledWith({
      workflowsDir: `${cwd}/src/workflows`,
      fallbackId: "general-chat",
    });
  });

  it("rejects invalid stream options and missing registries", async () => {
    const agent = createAgent({
      workflowRegistry: { select: vi.fn() } as unknown as WorkflowRegistry,
    });
    await expect(
      agent.streamChat([{ role: "user", content: "hello" }], {
        sessionId: "session-1",
        extra: true,
      } as unknown as Parameters<typeof agent.streamChat>[1]),
    ).rejects.toThrow("Unrecognized key");

    mocks.createFileWorkflowRegistry.mockReturnValueOnce(undefined as never);
    const missing = createAgent({ workflowsDir: "missing" });
    await expect(
      missing.streamChat([{ role: "user", content: "hello" }]),
    ).rejects.toThrow(
      "createAgent requires workflows, workflowsDir, or workflowRegistry.",
    );
  });
});
