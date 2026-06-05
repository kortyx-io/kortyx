import type { WorkflowDefinition } from "@kortyx/core";
import {
  buildInitialGraphState,
  createExecutionGraph,
  type FrameworkAdapter,
  makeRequestId,
  type WorkflowRegistry,
} from "@kortyx/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "../src/chat/process-chat";
import { tryPrepareResumeStream } from "../src/interrupt/resume-handler";
import { orchestrateGraphStream } from "../src/orchestrator";

const workflowDefinition = (id: string): WorkflowDefinition => ({
  id,
  version: "1.0.0",
  nodes: {},
  edges: [],
});

const mocks = vi.hoisted(() => ({
  buildInitialGraphState: vi.fn(
    async ({ input, config, runtime, defaultWorkflowId }) => ({
      input,
      config,
      runtime,
      lastNode: "__start__",
      currentWorkflow: defaultWorkflowId ?? "general-chat",
      conversationHistory: [],
      data: {},
      ui: {},
    }),
  ),
  createExecutionGraph: vi.fn(async () => ({
    config: {},
    streamEvents: vi.fn(),
  })),
  makeRequestId: vi.fn(() => "run-request"),
  parseResumeMeta: vi.fn(() => null),
  tryPrepareResumeStream: vi.fn(async () => null),
  orchestrateGraphStream: vi.fn(async function* () {
    yield { type: "done" };
  }),
}));

vi.mock("@kortyx/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kortyx/runtime")>();
  return {
    ...actual,
    buildInitialGraphState: mocks.buildInitialGraphState,
    createExecutionGraph: mocks.createExecutionGraph,
    makeRequestId: mocks.makeRequestId,
  };
});

vi.mock("../src/interrupt/resume-handler", () => ({
  parseResumeMeta: mocks.parseResumeMeta,
  tryPrepareResumeStream: mocks.tryPrepareResumeStream,
}));

vi.mock("../src/orchestrator", () => ({
  orchestrateGraphStream: mocks.orchestrateGraphStream,
}));

describe("streamChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildInitialGraphState.mockImplementation(
      async ({ input, config, runtime, defaultWorkflowId }) => ({
        input,
        config,
        runtime,
        lastNode: "__start__",
        currentWorkflow: defaultWorkflowId ?? "general-chat",
        conversationHistory: [],
        data: {},
        ui: {},
      }),
    );
    mocks.createExecutionGraph.mockResolvedValue({
      config: {},
      streamEvents: vi.fn(),
    });
    mocks.makeRequestId.mockReturnValue("run-request");
    mocks.parseResumeMeta.mockReturnValue(null);
    mocks.tryPrepareResumeStream.mockResolvedValue(null);
    mocks.orchestrateGraphStream.mockImplementation(async function* () {
      yield { type: "done" };
    });
  });

  it("requires a workflow selector", async () => {
    await expect(
      streamChat({
        messages: [],
        loadRuntimeConfig: async () => ({}),
        getProvider: vi.fn(),
      }),
    ).rejects.toThrow(
      "streamChat requires selectWorkflow or workflowRegistry to resolve workflows.",
    );
  });

  it("builds and orchestrates a normal chat request", async () => {
    const selectWorkflow = vi.fn(async (id: string) => workflowDefinition(id));
    const getProvider = vi.fn();
    const frameworkAdapter = {
      checkpointer: "checkpoint",
    } as unknown as FrameworkAdapter;

    const stream = await streamChat({
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "hello" },
      ],
      options: { sessionId: "option-session", workflowId: "requested" },
      defaultWorkflowId: "default-workflow",
      loadRuntimeConfig: async () => ({ features: { tracing: true } }),
      selectWorkflow,
      frameworkAdapter,
      getProvider,
      applyResumeSelection: vi.fn(),
    });

    await expect(async () => {
      for await (const _chunk of stream) {
        // drain stream
      }
    }).not.toThrow();

    expect(buildInitialGraphState).toHaveBeenCalledWith({
      input: "hello",
      config: {
        features: { tracing: true },
        getProvider,
        checkpointer: "checkpoint",
      },
      runtime: {
        priorMessages: [{ role: "system", content: "system" }],
        requestedWorkflow: "requested",
      },
      defaultWorkflowId: "default-workflow",
    });
    expect(tryPrepareResumeStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "option-session",
        frameworkAdapter,
        defaultWorkflowId: "default-workflow",
        applyResumeSelection: expect.any(Function),
      }),
    );
    expect(selectWorkflow).toHaveBeenCalledWith("default-workflow");
    expect(createExecutionGraph).toHaveBeenCalledWith(
      workflowDefinition("default-workflow"),
      expect.objectContaining({ getProvider, checkpointer: "checkpoint" }),
    );
    expect(orchestrateGraphStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "option-session",
        runId: "run-request",
        frameworkAdapter,
      }),
    );
    expect(makeRequestId).toHaveBeenCalledWith("run");
  });

  it("uses a registry selector, anonymous sessions, and ignores blank workflow ids", async () => {
    const registry = {
      select: vi.fn(async (id: string) => workflowDefinition(id)),
    } as unknown as WorkflowRegistry;

    await streamChat({
      messages: [{ role: "user", content: "hello" }],
      options: { workflowId: "   " },
      loadRuntimeConfig: async () => ({}),
      workflowRegistry: registry,
      getProvider: vi.fn(),
    });

    expect(buildInitialGraphState).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: {},
      }),
    );
    expect(orchestrateGraphStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "anonymous-session",
      }),
    );

    await streamChat({
      messages: [{ role: "user", content: "hello" }],
      options: { workflowId: 123 },
      loadRuntimeConfig: async () => ({}),
      workflowRegistry: registry,
      getProvider: vi.fn(),
    });

    expect(buildInitialGraphState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runtime: {},
      }),
    );

    await streamChat({
      messages: [{ role: "user", content: "hello" }],
      options: "not-an-object" as unknown as { workflowId?: string },
      loadRuntimeConfig: async () => ({}),
      workflowRegistry: registry,
      getProvider: vi.fn(),
    });

    expect(buildInitialGraphState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runtime: {},
      }),
    );
  });

  it("starts non-resume runs from the current session checkpoint head", async () => {
    const selectWorkflow = vi.fn(async (id: string) => workflowDefinition(id));
    mocks.buildInitialGraphState.mockResolvedValueOnce({
      input: "next",
      config: {},
      runtime: {
        priorMessages: [{ role: "assistant", content: "previous" }],
        requestedWorkflow: "requested-workflow",
      },
      lastNode: "__start__",
      currentWorkflow: "requested-workflow",
      conversationHistory: [],
      data: {},
      ui: {},
    });
    const frameworkAdapter = {
      checkpointer: "checkpoint",
      sessionCheckpoints: {
        getHead: vi.fn(async () => ({
          id: "cp-1",
          sessionId: "session-1",
          runId: "run-previous",
          turnIndex: 1,
          createdAt: 1,
          nodes: [],
          workflow: "checkpoint-workflow",
          state: {
            input: "old",
            config: {},
            runtime: { persisted: true },
            lastNode: "__end__",
            currentWorkflow: "checkpoint-workflow",
            conversationHistory: [],
            data: { fromCheckpoint: true },
            ui: {},
            awaitingHumanInput: true,
          },
          effects: { structuredStreamIds: [], interruptTokens: [] },
          activePendingRequests: [],
        })),
        append: vi.fn(),
      },
    } as unknown as FrameworkAdapter;

    await streamChat({
      messages: [
        { role: "assistant", content: "previous" },
        { role: "user", content: "next" },
      ],
      options: { sessionId: "session-1", workflowId: "requested-workflow" },
      loadRuntimeConfig: async () => ({ session: { id: "session-1" } }),
      selectWorkflow,
      frameworkAdapter,
      getProvider: vi.fn(),
    });

    expect(frameworkAdapter.sessionCheckpoints.getHead).toHaveBeenCalledWith(
      "session-1",
    );
    expect(selectWorkflow).toHaveBeenCalledWith("requested-workflow");
    expect(orchestrateGraphStream).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          input: "next",
          currentWorkflow: "requested-workflow",
          awaitingHumanInput: false,
          runtime: {
            persisted: true,
            requestedWorkflow: "requested-workflow",
            priorMessages: [{ role: "assistant", content: "previous" }],
          },
          data: { fromCheckpoint: true },
        }),
      }),
    );
  });

  it("starts from checkpoint heads without saved runtime metadata", async () => {
    const frameworkAdapter = {
      checkpointer: "checkpoint",
      sessionCheckpoints: {
        getHead: vi.fn(async () => ({
          id: "cp-1",
          sessionId: "session-1",
          runId: "run-previous",
          turnIndex: 1,
          createdAt: 1,
          nodes: [],
          workflow: "checkpoint-workflow",
          state: {
            input: "old",
            config: {},
            lastNode: "__end__",
            currentWorkflow: "checkpoint-workflow",
            conversationHistory: [],
            data: {},
            ui: {},
            awaitingHumanInput: true,
          },
          effects: { structuredStreamIds: [], interruptTokens: [] },
          activePendingRequests: [],
        })),
        append: vi.fn(),
      },
    } as unknown as FrameworkAdapter;

    await streamChat({
      messages: [{ role: "user", content: "next" }],
      options: { sessionId: "session-1" },
      loadRuntimeConfig: async () => ({}),
      selectWorkflow: vi.fn(async (id: string) => workflowDefinition(id)),
      frameworkAdapter,
      getProvider: vi.fn(),
    });

    expect(orchestrateGraphStream).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          currentWorkflow: "checkpoint-workflow",
          runtime: {},
        }),
      }),
    );
  });

  it("returns prepared resume streams without creating a new graph", async () => {
    const resumeStream = (async function* () {
      yield { type: "done" };
    })();
    mocks.parseResumeMeta.mockReturnValue({
      token: "t",
      requestId: "r",
      selected: [],
    } as never);
    mocks.tryPrepareResumeStream.mockResolvedValue(resumeStream as never);

    const result = await streamChat({
      messages: [
        {
          role: "user",
          content: "resume",
          metadata: { resume: { token: "t", requestId: "r" } },
        },
      ],
      sessionId: "explicit-session",
      loadRuntimeConfig: async () => ({}),
      selectWorkflow: vi.fn(),
      getProvider: vi.fn(),
    });

    expect(result).toBe(resumeStream);
    expect(createExecutionGraph).not.toHaveBeenCalled();
    expect(orchestrateGraphStream).not.toHaveBeenCalled();
    expect(tryPrepareResumeStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "explicit-session",
      }),
    );
  });
});
