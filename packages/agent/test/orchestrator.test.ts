import type { GraphState, WorkflowDefinition } from "@kortyx/core";
import {
  createExecutionGraph,
  type FrameworkAdapter,
  type PendingRequestStore,
} from "@kortyx/runtime";
import { describe, expect, it, vi } from "vitest";
import {
  type CompiledGraphLike,
  orchestrateGraphStream,
} from "../src/orchestrator";

const runtimeMocks = vi.hoisted(() => ({
  createExecutionGraph: vi.fn(),
  makeRequestId: vi.fn(() => "human-request"),
  makeResumeToken: vi.fn(() => "resume-token"),
}));

vi.mock("@kortyx/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kortyx/runtime")>();
  return {
    ...actual,
    createExecutionGraph: runtimeMocks.createExecutionGraph,
    makeRequestId: runtimeMocks.makeRequestId,
    makeResumeToken: runtimeMocks.makeResumeToken,
  };
});

vi.mock("../src/stream/transform-graph-stream-for-ui", () => ({
  transformGraphStreamForUI: (
    stream: AsyncIterable<unknown>,
  ): AsyncIterable<unknown> => stream,
}));

const baseState = {
  input: "hello",
  lastNode: "__start__",
  currentWorkflow: "first",
  config: {},
  runtime: {},
  conversationHistory: [],
  awaitingHumanInput: false,
  data: { existing: true },
  ui: {},
} satisfies GraphState;

const collect = async (stream: NodeJS.ReadableStream) => {
  const chunks: unknown[] = [];
  for await (const chunk of stream as AsyncIterable<unknown>) {
    chunks.push(chunk);
  }
  return chunks;
};

const graphWithEvents = (
  run: (
    emit: (event: string, payload: unknown) => void,
  ) => Promise<unknown[]> | unknown[],
): CompiledGraphLike => ({
  config: {},
  streamEvents: vi.fn(function (this: CompiledGraphLike) {
    const self = this;
    return async function* () {
      const chunks = await run(
        self.config?.emit as (event: string, payload: unknown) => void,
      );
      for (const chunk of chunks) yield chunk;
    }.call(self);
  }) as CompiledGraphLike["streamEvents"],
});

type InterruptChunk = {
  type: "interrupt";
  input: {
    meta?: Record<string, unknown>;
  };
};

describe("orchestrateGraphStream", () => {
  it("forwards runtime emits and hides internal interrupt metadata", async () => {
    const pendingRequests = {
      save: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    };
    const graph = graphWithEvents((emit) => {
      emit("status", { message: "working" });
      emit("status", { message: "working" });
      emit("text-start", {
        node: "writer",
        id: "text-1",
        opId: "op-1",
        segmentId: "segment-1",
      });
      emit("text-delta", {
        node: "writer",
        delta: "hello",
        id: "text-1",
        opId: "op-1",
        segmentId: "segment-1",
      });
      emit("text-end", {
        node: "writer",
        id: "text-1",
        opId: "op-1",
        segmentId: "segment-1",
      });
      emit("message", { node: "writer", content: "done" });
      emit("structured_data", {
        node: "writer",
        streamId: "structured-1",
        dataType: "profile",
        kind: "set",
        schemaId: "schema",
        schemaVersion: "1",
        id: "value",
        path: "name",
        value: "Ada",
      });
      emit("structured_data", {
        node: "writer",
        dataType: "profile",
        kind: "append",
        path: "items",
        items: ["one"],
      });
      emit("structured_data", {
        node: "writer",
        dataType: "profile",
        kind: "text-delta",
        path: "summary",
        delta: "A",
      });
      emit("structured_data", {
        node: "writer",
        dataType: "profile",
        kind: "unknown",
        data: { ok: true },
      });
      emit("interrupt", {
        node: "ask",
        workflow: "first",
        input: {
          kind: "choice",
          multiple: true,
          question: "Pick",
          id: "choice-id",
          schemaId: "choice-schema",
          schemaVersion: "2",
          meta: {
            public: "visible",
            __kortyxSecret: "hidden",
          },
          options: [
            {
              id: "a",
              label: "A",
              description: "First",
              value: { value: "a" },
            },
          ],
        },
      });
      emit("interrupt", { node: "ignored" });

      return [
        {
          type: "done",
          data: {
            ...baseState,
            awaitingHumanInput: true,
            data: { paused: true },
          },
        },
      ];
    });

    const stream = await orchestrateGraphStream({
      sessionId: "session-1",
      runId: "run-1",
      graph,
      state: baseState,
      config: { features: { tracing: true }, session: { id: "session-1" } },
      selectWorkflow: vi.fn(),
      frameworkAdapter: {
        pendingRequests: pendingRequests as unknown as PendingRequestStore,
        ttlMs: 123,
      } as unknown as FrameworkAdapter,
    });

    const chunks = await collect(stream);

    expect(chunks).toContainEqual({ type: "session", sessionId: "session-1" });
    expect(chunks).toContainEqual({ type: "status", message: "working" });
    expect(
      chunks.filter(
        (chunk) =>
          typeof chunk === "object" &&
          chunk !== null &&
          (chunk as { type?: string; message?: string }).type === "status" &&
          (chunk as { message?: string }).message === "working",
      ),
    ).toHaveLength(1);
    expect(chunks).toContainEqual({
      type: "text-start",
      node: "writer",
      id: "text-1",
      opId: "op-1",
      segmentId: "segment-1",
    });
    expect(chunks).toContainEqual({
      type: "text-delta",
      delta: "hello",
      node: "writer",
      id: "text-1",
      opId: "op-1",
      segmentId: "segment-1",
    });
    expect(chunks).toContainEqual({
      type: "text-end",
      node: "writer",
      id: "text-1",
      opId: "op-1",
      segmentId: "segment-1",
    });
    expect(chunks).toContainEqual({
      type: "message",
      node: "writer",
      content: "done",
    });
    expect(chunks).toContainEqual({
      type: "structured-data",
      node: "writer",
      streamId: "structured-1",
      dataType: "profile",
      kind: "set",
      schemaId: "schema",
      schemaVersion: "1",
      id: "value",
      path: "name",
      value: "Ada",
    });
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "structured-data",
        streamId: "run-1:structured:0",
        kind: "append",
        items: ["one"],
      }),
    );
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "structured-data",
        streamId: "run-1:structured:1",
        kind: "text-delta",
        delta: "A",
      }),
    );
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "structured-data",
        streamId: "run-1:structured:2",
        kind: "final",
        data: { ok: true },
      }),
    );

    const interrupt = chunks.find(
      (chunk) =>
        typeof chunk === "object" &&
        chunk !== null &&
        (chunk as { type?: string }).type === "interrupt",
    ) as InterruptChunk;
    expect(interrupt).toMatchObject({
      requestId: "human-request",
      resumeToken: "resume-token",
      workflow: "first",
      node: "ask",
      id: "choice-id",
      schemaId: "choice-schema",
      schemaVersion: "2",
      input: {
        kind: "choice",
        multiple: true,
        question: "Pick",
        id: "choice-id",
        schemaId: "choice-schema",
        schemaVersion: "2",
        meta: { public: "visible" },
        options: [{ id: "a", label: "A", description: "First" }],
      },
    });
    expect(interrupt.input.meta).not.toHaveProperty("__kortyxSecret");
    expect(pendingRequests.save).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "resume-token",
        requestId: "human-request",
        ttlMs: 123,
      }),
    );
    expect(pendingRequests.update).toHaveBeenCalledWith("resume-token", {
      state: { ...baseState, awaitingHumanInput: true, data: { paused: true } },
    });
  });

  it("handles text interrupts with default schema fields", async () => {
    const graph = graphWithEvents((emit) => {
      emit("interrupt", {
        input: {
          kind: "text",
          question: "Name?",
          schemaId: "",
          schemaVersion: "",
          id: "",
          meta: ["not-object"],
        },
      });
      return [
        { type: "done", data: { ...baseState, awaitingHumanInput: true } },
      ];
    });

    const stream = await orchestrateGraphStream({
      runId: "run-2",
      graph,
      state: baseState,
      config: {},
      selectWorkflow: vi.fn(),
    });

    const chunks = await collect(stream);
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "interrupt",
        workflow: "first",
        node: "",
        input: expect.objectContaining({
          kind: "text",
          multiple: false,
          question: "Name?",
          options: [],
        }),
      }),
    );
  });

  it("runs transition handoffs with merged state and raw input override", async () => {
    const nextGraph = graphWithEvents(() => [
      {
        type: "done",
        data: {
          ...baseState,
          currentWorkflow: "second",
          data: { final: true },
        },
      },
    ]);
    runtimeMocks.createExecutionGraph.mockResolvedValueOnce(nextGraph);

    const graph = graphWithEvents((emit) => {
      emit("transition", {
        transitionTo: "second",
        payload: { rawInput: "new input", added: true },
      });
      return [
        {
          type: "done",
          data: { ...baseState, data: { fromFinal: true } },
        },
      ];
    });
    const selectWorkflow = vi.fn(
      async (id: string) => ({ id }) as WorkflowDefinition,
    );

    const stream = await orchestrateGraphStream({
      sessionId: "session-1",
      runId: "run-3",
      graph,
      state: baseState,
      config: { app: "config" },
      selectWorkflow,
    });

    const chunks = await collect(stream);

    expect(chunks).toContainEqual({
      type: "transition",
      transitionTo: "second",
      payload: { rawInput: "new input", added: true },
    });
    expect(selectWorkflow).toHaveBeenCalledWith("second");
    expect(createExecutionGraph).toHaveBeenCalledWith(
      { id: "second" },
      expect.objectContaining({ app: "config", emit: expect.any(Function) }),
    );
    expect(nextGraph.streamEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        currentWorkflow: "second",
        input: "new input",
        data: { fromFinal: true, rawInput: "new input", added: true },
        ui: {},
      }),
      expect.objectContaining({
        version: "v2",
        configurable: { thread_id: "run-3", checkpoint_ns: "second" },
      }),
    );
    expect(chunks.at(-1)).toEqual({
      type: "done",
      data: { ...baseState, currentWorkflow: "second", data: { final: true } },
    });
  });

  it("emits an error when transition graph creation fails", async () => {
    runtimeMocks.createExecutionGraph.mockRejectedValueOnce(
      new Error("missing"),
    );
    const graph = graphWithEvents((emit) => {
      emit("transition", { transitionTo: "missing", payload: {} });
      return [{ type: "done", data: baseState }];
    });

    const stream = await orchestrateGraphStream({
      sessionId: "session-1",
      runId: "run-4",
      graph,
      state: baseState,
      config: {},
      selectWorkflow: vi.fn(
        async () => ({ id: "missing" }) as WorkflowDefinition,
      ),
    });

    await expect(collect(stream)).resolves.toContainEqual({
      type: "error",
      message: "Transition failed to 'missing': missing",
    });
  });

  it("cleans up completed runs and falls back to checkpointer deletion", async () => {
    const cleanupRun = vi.fn(async () => undefined);
    const graph = graphWithEvents(() => [{ type: "done", data: baseState }]);

    await collect(
      await orchestrateGraphStream({
        sessionId: "session-1",
        runId: "run-5",
        graph,
        state: baseState,
        config: {},
        selectWorkflow: vi.fn(),
        frameworkAdapter: { cleanupRun } as unknown as FrameworkAdapter,
      }),
    );

    expect(cleanupRun).toHaveBeenCalledWith("run-5", ["first"]);

    const deleteThread = vi.fn(async () => undefined);
    const checkpointerGraph = graphWithEvents(() => [
      { type: "done", data: baseState },
    ]);
    checkpointerGraph.config = { checkpointer: { deleteThread } };

    await collect(
      await orchestrateGraphStream({
        sessionId: "session-1",
        runId: "run-6",
        graph: checkpointerGraph,
        state: baseState,
        config: {},
        selectWorkflow: vi.fn(),
      }),
    );

    expect(deleteThread).toHaveBeenCalledWith("run-6");
  });

  it("emits error and done when runtime emit reports an error", async () => {
    const graph = graphWithEvents((emit) => {
      emit("error", { message: "boom" });
      return [{ type: "message", content: "ignored" }];
    });

    const stream = await orchestrateGraphStream({
      sessionId: "session-1",
      runId: "run-7",
      graph,
      state: baseState,
      config: {},
      selectWorkflow: vi.fn(),
    });

    await expect(collect(stream)).resolves.toEqual([
      { type: "error", message: "boom" },
      { type: "done" },
    ]);
  });

  it("defensively closes when graph stream ends without done", async () => {
    const graph = graphWithEvents(() => [
      { type: "message", content: "partial" },
    ]);

    const stream = await orchestrateGraphStream({
      sessionId: "session-1",
      runId: "run-8",
      graph,
      state: baseState,
      config: {},
      selectWorkflow: vi.fn(),
    });

    await expect(collect(stream)).resolves.toEqual([
      { type: "message", content: "partial" },
      { type: "done" },
    ]);
  });

  it("emits stream errors from thrown graph failures", async () => {
    const graph: CompiledGraphLike = {
      config: {},
      async *streamEvents() {
        if (Date.now() < 0) yield null;
        throw new Error("stream failed");
      },
    };

    const stream = await orchestrateGraphStream({
      sessionId: "session-1",
      runId: "run-9",
      graph,
      state: baseState,
      config: {},
      selectWorkflow: vi.fn(),
    });

    await expect(collect(stream)).resolves.toEqual([
      { type: "error", message: "stream failed" },
      { type: "done" },
    ]);
  });

  it("logs pending save, interrupt emit, and cleanup failures", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const saveFailure = new Error("save failed");
    const cleanupFailure = new Error("cleanup failed");
    const graph = graphWithEvents((emit) => {
      emit("interrupt", {
        node: "ask",
        input: {
          kind: "choice",
          question: "Pick",
          options: [],
        },
      });
      return [{ type: "done", data: baseState }];
    });

    await collect(
      await orchestrateGraphStream({
        sessionId: "session-1",
        runId: "run-10",
        graph,
        state: baseState,
        config: {},
        selectWorkflow: vi.fn(),
        frameworkAdapter: {
          pendingRequests: {
            save: vi.fn(() => Promise.reject(saveFailure)),
          },
        } as unknown as FrameworkAdapter,
      }),
    );

    expect(error).toHaveBeenCalledWith(
      "[orchestrator] failed to save pending request",
      saveFailure,
    );

    const emitFailure = new Error("emit failed");
    const badCatchGraph = graphWithEvents((emit) => {
      emit("interrupt", {
        node: "ask",
        input: {
          kind: "choice",
          question: "Pick",
          options: [],
        },
      });
      return [{ type: "done", data: baseState }];
    });

    await collect(
      await orchestrateGraphStream({
        sessionId: "session-1",
        runId: "run-11",
        graph: badCatchGraph,
        state: baseState,
        config: {},
        selectWorkflow: vi.fn(),
        frameworkAdapter: {
          pendingRequests: {
            save: vi.fn(() => ({
              catch: () => {
                throw emitFailure;
              },
            })),
          },
        } as unknown as FrameworkAdapter,
      }),
    );

    expect(error).toHaveBeenCalledWith(
      "[orchestrator] failed to emit interrupt",
      emitFailure,
    );

    await collect(
      await orchestrateGraphStream({
        sessionId: "session-1",
        runId: "run-12",
        graph: graphWithEvents(() => [{ type: "done", data: baseState }]),
        state: baseState,
        config: {},
        selectWorkflow: vi.fn(),
        frameworkAdapter: {
          cleanupRun: vi.fn(async () => {
            throw cleanupFailure;
          }),
        } as unknown as FrameworkAdapter,
      }),
    );

    expect(error).toHaveBeenCalledWith(
      "[orchestrator] framework cleanup failed",
      cleanupFailure,
    );
    error.mockRestore();
  });

  it("covers optional fallback branches for emits, resumes, and transitions", async () => {
    const originalNow = Date.now;
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(1000).mockReturnValueOnce(2000);

    const graph = graphWithEvents((emit) => {
      emit("status", { message: "" });
      emit("status", { message: null });
      emit("status", { message: "later" });
      emit("text-start", {});
      emit("text-start", { node: "plain" });
      emit("text-delta", { node: "plain", delta: "" });
      emit("text-delta", { node: "plain", delta: "x" });
      emit("text-end", {});
      emit("text-end", { node: "plain" });
      emit("tool-call-start", { tool: 1, toolCallId: "call-invalid" });
      emit("tool-call-start", { tool: "search", toolCallId: 1 });
      emit("tool-call-start", { tool: "search", toolCallId: "call-1" });
      emit("tool-call-start", {
        tool: "search",
        toolCallId: "call-2",
        node: "plain",
        id: "reason-1",
        opId: "op-1",
        input: { query: "kortyx" },
      });
      emit("tool-call-result", { tool: 1, toolCallId: "call-invalid" });
      emit("tool-call-result", { tool: "search", toolCallId: 1 });
      emit("tool-call-result", {
        tool: "search",
        toolCallId: "call-1",
        content: "ok",
      });
      emit("tool-call-result", {
        tool: "search",
        toolCallId: "call-2",
        node: "plain",
        id: "reason-1",
        opId: "op-1",
        content: "ok",
        structuredContent: { results: 1 },
        isError: false,
      });
      emit("tool-call-error", { tool: 1, toolCallId: "call-invalid" });
      emit("tool-call-error", { tool: "search", toolCallId: 1 });
      emit("tool-call-error", { tool: "search", toolCallId: "call-1" });
      emit("tool-call-error", {
        tool: "search",
        toolCallId: "call-2",
        node: "plain",
        id: "reason-1",
        opId: "op-1",
        message: "failed",
      });
      emit("message", {});
      emit("structured_data", {
        kind: "append",
        path: undefined,
        items: "not-array",
      });
      emit("structured_data", {
        kind: "text-delta",
        path: undefined,
        delta: undefined,
      });
      emit("structured_data", {
        kind: "final",
        streamId: "",
        dataType: "",
        schemaId: 1,
        schemaVersion: 1,
        id: 1,
        data: undefined,
      });
      emit("transition", {});
      emit("interrupt", null);
      return [{ type: "done" }];
    });
    delete graph.config;

    await expect(
      collect(
        await orchestrateGraphStream({
          runId: "run-13",
          graph,
          state: { ...baseState, currentWorkflow: "" },
          config: { features: { tracing: true } },
          selectWorkflow: vi.fn(),
        }),
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        { type: "status", message: "later" },
        { type: "text-start", node: "plain" },
        { type: "text-delta", node: "plain", delta: "x" },
        { type: "text-end", node: "plain" },
        {
          type: "tool-call-start",
          tool: "search",
          toolCallId: "call-1",
        },
        {
          type: "tool-call-start",
          tool: "search",
          toolCallId: "call-2",
          node: "plain",
          id: "reason-1",
          opId: "op-1",
          input: { query: "kortyx" },
        },
        {
          type: "tool-call-result",
          tool: "search",
          toolCallId: "call-1",
          content: "ok",
        },
        {
          type: "tool-call-result",
          tool: "search",
          toolCallId: "call-2",
          node: "plain",
          id: "reason-1",
          opId: "op-1",
          content: "ok",
          structuredContent: { results: 1 },
          isError: false,
        },
        {
          type: "tool-call-error",
          tool: "search",
          toolCallId: "call-1",
          message: "",
        },
        {
          type: "tool-call-error",
          tool: "search",
          toolCallId: "call-2",
          node: "plain",
          id: "reason-1",
          opId: "op-1",
          message: "failed",
        },
        { type: "message", node: undefined, content: "" },
        expect.objectContaining({
          type: "structured-data",
          kind: "append",
          path: "",
          items: [],
        }),
        expect.objectContaining({
          type: "structured-data",
          kind: "text-delta",
          path: "",
          delta: "",
        }),
        expect.objectContaining({
          type: "structured-data",
          kind: "final",
          dataType: "generic",
          data: undefined,
        }),
        { type: "transition", transitionTo: undefined, payload: {} },
        { type: "done" },
      ]),
    );

    now.mockRestore();
    Date.now = originalNow;

    const resumeCases = [
      { resume: true },
      { resume: true, resumeValue: "value" },
      { resume: true, resumeUpdate: { data: { updated: true } } },
      {
        resume: true,
        resumeValue: "value",
        resumeUpdate: { data: { updated: true } },
      },
    ];

    for (const [index, config] of resumeCases.entries()) {
      const resumeGraph = graphWithEvents(() => [{ type: "done", data: null }]);
      resumeGraph.config = config;

      await collect(
        await orchestrateGraphStream({
          sessionId: "session-1",
          runId: `run-resume-${index}`,
          graph: resumeGraph,
          state: baseState,
          config: {},
          selectWorkflow: vi.fn(),
        }),
      );

      expect(vi.mocked(resumeGraph.streamEvents).mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({
          configurable: {
            thread_id: `run-resume-${index}`,
            checkpoint_ns: "first",
          },
        }),
      );
    }

    runtimeMocks.createExecutionGraph.mockResolvedValueOnce(
      graphWithEvents(() => [{ type: "done", data: baseState }]),
    );
    const transitionGraph = graphWithEvents((emit) => {
      emit("transition", { transitionTo: "next" });
      return [{ type: "done", data: { ...baseState, data: undefined } }];
    });

    await collect(
      await orchestrateGraphStream({
        sessionId: "session-1",
        runId: "run-transition-defaults",
        graph: transitionGraph,
        state: baseState,
        config: {},
        selectWorkflow: vi.fn(
          async () => ({ id: "next" }) as WorkflowDefinition,
        ),
      }),
    );

    const stringFailure = graphWithEvents((emit) => {
      emit("transition", { transitionTo: "bad" });
      return [{ type: "done", data: baseState }];
    });
    const selectWorkflow = vi.fn(async () => {
      throw "string failure";
    });

    await expect(
      collect(
        await orchestrateGraphStream({
          sessionId: "session-1",
          runId: "run-transition-string-error",
          graph: stringFailure,
          state: baseState,
          config: {},
          selectWorkflow,
        }),
      ),
    ).resolves.toContainEqual({
      type: "error",
      message: "Transition failed to 'bad': string failure",
    });

    const thrownStringGraph: CompiledGraphLike = {
      config: {},
      async *streamEvents() {
        if (Date.now() < 0) yield null;
        throw "string stream failure";
      },
    };
    await expect(
      collect(
        await orchestrateGraphStream({
          sessionId: "session-1",
          runId: "run-string-throw",
          graph: thrownStringGraph,
          state: baseState,
          config: {},
          selectWorkflow: vi.fn(),
        }),
      ),
    ).resolves.toEqual([
      { type: "error", message: "string stream failure" },
      { type: "done" },
    ]);
  });

  it("covers remaining reachable emit fallbacks", async () => {
    await expect(
      collect(
        await orchestrateGraphStream({
          sessionId: "session-1",
          runId: "run-emit-fallbacks",
          graph: graphWithEvents((emit) => {
            emit("status", null);
            emit("status", { message: null });
            emit("status", {});
            emit("text-delta", { node: "plain" });
            emit("structured_data", { kind: "set", value: "value" });
            emit("unknown", {});
            return [{ type: "done", data: baseState }];
          }),
          state: baseState,
          config: {},
          selectWorkflow: vi.fn(),
        }),
      ),
    ).resolves.toContainEqual({
      type: "structured-data",
      node: undefined,
      streamId: "run-emit-fallbacks:structured:0",
      dataType: "generic",
      kind: "set",
      path: "",
      value: "value",
    });

    runtimeMocks.createExecutionGraph.mockResolvedValueOnce(
      graphWithEvents(() => [{ type: "done", data: baseState }]),
    );
    const { data: _data, ...stateWithoutData } = baseState;
    await collect(
      await orchestrateGraphStream({
        sessionId: "session-1",
        runId: "run-transition-without-final-state",
        graph: graphWithEvents((emit) => {
          emit("transition", { transitionTo: "next" });
          return [];
        }),
        state: stateWithoutData,
        config: {},
        selectWorkflow: vi.fn(
          async () => ({ id: "next" }) as WorkflowDefinition,
        ),
      }),
    );

    await expect(
      collect(
        await orchestrateGraphStream({
          sessionId: "session-1",
          runId: "run-error-default",
          graph: graphWithEvents((emit) => {
            emit("error", {});
            return [];
          }),
          state: baseState,
          config: {},
          selectWorkflow: vi.fn(),
        }),
      ),
    ).resolves.toEqual([
      { type: "error", message: "Unexpected error" },
      { type: "done" },
    ]);
  });

  it("wraps runs with an active telemetry span", async () => {
    const runSpan = {
      setAttributes: vi.fn(),
      end: vi.fn(),
      fail: vi.fn(),
    };
    const trace = {
      withSpan: vi.fn(async (_args, fn) => fn(runSpan)),
      startSpan: vi.fn(),
    };

    await collect(
      await orchestrateGraphStream({
        sessionId: "session-1",
        runId: "run-trace-with-span",
        graph: graphWithEvents(() => [{ type: "done", data: baseState }]),
        state: baseState,
        config: {
          context: {
            userId: "user-1",
            tenantId: "tenant-1",
            accountId: "account-1",
          },
          telemetry: {
            trace,
            metadata: { source: "test" },
            tags: ["tag"],
            captureContent: { input: true },
          },
        },
        selectWorkflow: vi.fn(),
      }),
    );

    expect(trace.startSpan).not.toHaveBeenCalled();
    expect(trace.withSpan).toHaveBeenCalledWith(
      {
        name: "kortyx.run",
        attributes: {
          sessionId: "session-1",
          runId: "run-trace-with-span",
          workflowId: "first",
          userId: "user-1",
          tenantId: "tenant-1",
        },
        telemetry: {
          metadata: {
            source: "test",
            userId: "user-1",
            tenantId: "tenant-1",
            accountId: "account-1",
          },
          tags: ["tag"],
          captureContent: { input: true },
          input: "hello",
        },
      },
      expect.any(Function),
    );
    expect(runSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "kortyx.run.final_workflow": "first",
      }),
    );
    expect(runSpan.end).toHaveBeenCalled();
    expect(runSpan.fail).not.toHaveBeenCalled();
  });

  it("falls back to startSpan when active telemetry spans are unavailable", async () => {
    const runSpan = {
      setAttributes: vi.fn(),
      end: vi.fn(),
      fail: vi.fn(),
    };
    const reasonTrace = {
      startSpan: vi.fn(() => runSpan),
    };

    await collect(
      await orchestrateGraphStream({
        runId: "run-trace-start-span",
        graph: graphWithEvents(() => [{ type: "done", data: baseState }]),
        state: baseState,
        config: {
          context: null,
          telemetry: {
            metadata: null,
            tags: "tag",
          },
          reasonTrace,
        },
        selectWorkflow: vi.fn(),
      }),
    );

    expect(reasonTrace.startSpan).toHaveBeenCalledWith({
      name: "kortyx.run",
      attributes: {
        runId: "run-trace-start-span",
        workflowId: "first",
      },
      telemetry: {
        metadata: {},
        tags: undefined,
        captureContent: undefined,
        input: "hello",
      },
    });
    expect(runSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "kortyx.run.final_workflow": "first",
      }),
    );
    expect(runSpan.end).toHaveBeenCalled();
    expect(runSpan.fail).not.toHaveBeenCalled();
  });

  it("ends run telemetry spans with accumulated text output", async () => {
    const runSpan = {
      setAttributes: vi.fn(),
      end: vi.fn(),
      fail: vi.fn(),
    };
    const trace = {
      withSpan: vi.fn(async (_args, fn) => fn(runSpan)),
    };

    await collect(
      await orchestrateGraphStream({
        runId: "run-trace-output",
        graph: graphWithEvents((emit) => {
          emit("text-delta", { node: "writer", delta: "hello" });
          emit("text-delta", { node: "writer", delta: " world" });
          return [{ type: "done", data: baseState }];
        }),
        state: baseState,
        config: {
          telemetry: {
            trace,
          },
        },
        selectWorkflow: vi.fn(),
      }),
    );

    expect(runSpan.end).toHaveBeenCalledWith({
      telemetry: {
        output: "hello world",
      },
    });
  });

  it("separates accumulated telemetry output across text stream boundaries", async () => {
    const runSpan = {
      setAttributes: vi.fn(),
      end: vi.fn(),
      fail: vi.fn(),
    };
    const trace = {
      withSpan: vi.fn(async (_args, fn) => fn(runSpan)),
    };

    await collect(
      await orchestrateGraphStream({
        runId: "run-trace-output-segments",
        graph: graphWithEvents((emit) => {
          emit("text-delta", {
            node: "planner",
            delta: "On it, adjusting the guide now.",
            opId: "op-1",
            segmentId: "segment-1",
          });
          emit("text-delta", {
            node: "writer",
            delta:
              "The Explanation for Cross-functional and Stakeholder Collaboration has been updated.",
            opId: "op-2",
            segmentId: "segment-1",
          });
          return [{ type: "done", data: baseState }];
        }),
        state: baseState,
        config: {
          telemetry: {
            trace,
          },
        },
        selectWorkflow: vi.fn(),
      }),
    );

    expect(runSpan.end).toHaveBeenCalledWith({
      telemetry: {
        output:
          "On it, adjusting the guide now. The Explanation for Cross-functional and Stakeholder Collaboration has been updated.",
      },
    });
  });

  it("does not add run telemetry input for non-string state input", async () => {
    const runSpan = {
      setAttributes: vi.fn(),
      end: vi.fn(),
      fail: vi.fn(),
    };
    const trace = {
      withSpan: vi.fn(async (_args, fn) => fn(runSpan)),
    };

    await collect(
      await orchestrateGraphStream({
        runId: "run-trace-non-string-input",
        graph: graphWithEvents(() => [{ type: "done", data: baseState }]),
        state: { ...baseState, input: { prompt: "hello" } },
        config: {
          telemetry: {
            trace,
          },
        },
        selectWorkflow: vi.fn(),
      }),
    );

    expect(trace.withSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        telemetry: expect.not.objectContaining({
          input: expect.anything(),
        }),
      }),
      expect.any(Function),
    );
  });

  it("emits text interrupts with optional schema metadata", async () => {
    const graph = graphWithEvents((emit) => {
      emit("interrupt", {
        node: "ask",
        workflow: "first",
        input: {
          kind: "text",
          id: "text-id",
          schemaId: "text-schema",
          schemaVersion: "3",
          meta: { public: true },
        },
      });
      return [
        { type: "done", data: { ...baseState, awaitingHumanInput: true } },
      ];
    });

    await expect(
      collect(
        await orchestrateGraphStream({
          sessionId: "session-1",
          runId: "run-text-schema",
          graph,
          state: baseState,
          config: {},
          selectWorkflow: vi.fn(),
        }),
      ),
    ).resolves.toContainEqual(
      expect.objectContaining({
        type: "interrupt",
        id: "text-id",
        schemaId: "text-schema",
        schemaVersion: "3",
        input: expect.objectContaining({
          kind: "text",
          id: "text-id",
          schemaId: "text-schema",
          schemaVersion: "3",
          meta: { public: true },
        }),
      }),
    );

    await expect(
      collect(
        await orchestrateGraphStream({
          sessionId: "session-1",
          runId: "run-multi-choice-default",
          graph: graphWithEvents((emit) => {
            emit("interrupt", {
              input: {
                multiple: true,
              },
            });
            return [
              {
                type: "done",
                data: { ...baseState, awaitingHumanInput: true },
              },
            ];
          }),
          state: baseState,
          config: {},
          selectWorkflow: vi.fn(),
        }),
      ),
    ).resolves.toContainEqual(
      expect.objectContaining({
        type: "interrupt",
        input: expect.objectContaining({
          kind: "multi-choice",
          question: "Please choose an option.",
        }),
      }),
    );
  });
});
