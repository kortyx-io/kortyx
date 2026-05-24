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
