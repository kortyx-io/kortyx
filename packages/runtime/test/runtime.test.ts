import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInitialGraphState,
  clearRegisteredNodes,
  createFrameworkAdapterFromEnv,
  createInMemoryFrameworkAdapter,
  createInMemoryPendingRequestStore,
  createInMemorySessionCheckpointStore,
  createInMemoryWorkflowRegistry,
  getCheckpointer,
  getRegisteredNode,
  listRegisteredNodes,
  makeRequestId,
  makeResumeToken,
  registerNode,
  resolveNode,
} from "../src";
import { createInMemoryCheckpointSaver } from "../src/framework/in-memory-checkpointer";
import type { PendingRequestRecord } from "../src/framework/pending-requests";

const workflow = (id: string) => ({
  id,
  version: "1.0.0",
  nodes: {
    start: { run: "start", params: {} },
  },
  edges: [["__start__", "start"] as [string, string]],
});

const pendingRecord = (overrides: Partial<PendingRequestRecord> = {}) =>
  ({
    token: "token-1",
    requestId: "request-1",
    runId: "run-1",
    workflow: "workflow-1",
    node: "node-1",
    schema: { kind: "choice", multiple: false, question: "Pick" },
    options: [{ id: "a", label: "A" }],
    createdAt: Date.now(),
    ttlMs: 1000,
    ...overrides,
  }) satisfies PendingRequestRecord;

afterEach(() => {
  vi.useRealTimers();
  clearRegisteredNodes();
});

describe("createInMemoryWorkflowRegistry", () => {
  it("selects requested workflows and falls back when configured", async () => {
    const registry = createInMemoryWorkflowRegistry(
      [workflow("general-chat"), workflow("advanced")],
      { fallbackId: "general-chat" },
    );

    await expect(registry.list()).resolves.toHaveLength(2);
    await expect(registry.get("advanced")).resolves.toMatchObject({
      id: "advanced",
    });
    await expect(registry.select("missing")).resolves.toMatchObject({
      id: "general-chat",
    });
    await expect(
      registry.select("missing", { fallbackId: "also-missing" }),
    ).rejects.toThrow(
      'Workflow "missing" not found (fallback "also-missing" missing too).',
    );

    const noFallbackRegistry = createInMemoryWorkflowRegistry([]);
    await expect(noFallbackRegistry.get("missing")).resolves.toBeNull();
    await expect(
      noFallbackRegistry.select("missing", { fallbackId: "" }),
    ).rejects.toThrow('Workflow "missing" not found.');
  });
});

describe("pending request store", () => {
  it("saves, updates, expires, and deletes pending requests", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const store = createInMemoryPendingRequestStore();

    await store.save(pendingRecord());
    await expect(store.get("token-1")).resolves.toMatchObject({
      node: "node-1",
    });

    await store.update("token-1", { node: "node-2" });
    await expect(store.get("token-1")).resolves.toMatchObject({
      node: "node-2",
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    await expect(store.get("token-1")).resolves.toBeNull();

    await store.save(pendingRecord({ token: "token-2" }));
    await store.delete("token-2");
    await expect(store.get("token-2")).resolves.toBeNull();

    await expect(store.update("missing", { node: "ignored" })).resolves.toBe(
      undefined,
    );
  });
});

describe("session checkpoint store", () => {
  it("appends, rolls back, and eagerly forks session state", async () => {
    const store = createInMemorySessionCheckpointStore({
      maxCheckpointsPerSession: 10,
    });
    const baseState = {
      input: "hello",
      lastNode: "__start__",
      currentWorkflow: "workflow-1",
      config: {},
      runtime: {},
      conversationHistory: [],
      awaitingHumanInput: false,
    };

    const first = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: baseState,
      nodes: ["start"],
    });
    const second = await store.append({
      sessionId: "session-1",
      runId: "run-2",
      workflow: "workflow-1",
      state: {
        ...baseState,
        input: "next",
        runtime: { toolResults: { ok: true } },
      },
      nodes: ["writer"],
      structuredStreamIds: ["stream-1"],
      pendingRequests: [pendingRecord({ token: "token-after-first" })],
    });

    await expect(store.list("session-1")).resolves.toMatchObject([
      { id: first.id, turnIndex: 0 },
      { id: second.id, turnIndex: 1 },
    ]);
    await expect(store.getHead("session-1")).resolves.toMatchObject({
      id: second.id,
    });

    await expect(store.rollbackTo(first.id)).resolves.toMatchObject({
      sessionId: "session-1",
      head: first.id,
      invalidatedStructuredStreamIds: ["stream-1"],
      invalidatedInterruptTokens: ["token-after-first"],
      activePendingRequests: [],
    });
    await expect(store.list("session-1")).resolves.toMatchObject([
      { id: first.id },
    ]);

    const fork = await store.fork(first.id, { newSessionId: "child" });
    expect(fork).toMatchObject({
      sessionId: "child",
      parentSessionId: "session-1",
      forkedFrom: first.id,
    });
    await expect(store.getHead("child")).resolves.toMatchObject({
      sessionId: "child",
      parentSessionId: "session-1",
      forkedFrom: first.id,
    });
  });
});

describe("node registry", () => {
  it("registers sorted node ids and resolves handlers", async () => {
    const a = vi.fn(async () => ({ data: { id: "a" } }));
    const b = vi.fn(async () => ({ data: { id: "b" } }));

    registerNode("b", b);
    registerNode("a", a);

    expect(listRegisteredNodes()).toEqual(["a", "b"]);
    expect(getRegisteredNode("a")).toBe(a);
    expect(getRegisteredNode("missing")).toBeNull();
    expect(resolveNode("b")).toBe(b);
    expect(() => resolveNode("missing")).toThrow(
      "Node 'missing' is not registered.",
    );
  });
});

describe("initial graph state and framework adapter", () => {
  it("builds initial graph state from requested or default workflow", async () => {
    await expect(
      buildInitialGraphState({
        input: { message: "hi" },
        runtime: { requestedWorkflow: "requested" },
        config: { debug: true },
      }),
    ).resolves.toMatchObject({
      currentWorkflow: "requested",
      lastNode: "__start__",
      awaitingHumanInput: false,
    });

    await expect(
      buildInitialGraphState({
        input: {},
        runtime: {},
        config: {},
      }),
    ).rejects.toThrow("No workflow selected.");
  });

  it("uses in-memory framework state when redis env is absent", () => {
    const adapter = createFrameworkAdapterFromEnv({
      KORTYX_FRAMEWORK_TTL_MS: "5000",
    });

    expect(adapter.kind).toBe("in-memory");
    expect(adapter.ttlMs).toBe(5000);
    expect(adapter.cleanupRun).toEqual(expect.any(Function));

    const defaultAdapter = createFrameworkAdapterFromEnv({});
    expect(defaultAdapter.kind).toBe("in-memory");
    expect(defaultAdapter.ttlMs).toBe(15 * 60 * 1000);
  });

  it("cleans up in-memory framework checkpoints best-effort", async () => {
    const adapter = createInMemoryFrameworkAdapter();
    const config = {
      configurable: { thread_id: "run-1", checkpoint_ns: "" },
    };
    await adapter.checkpointer.put(
      config,
      {
        v: 4,
        id: "cp-1",
        ts: "2026-01-01T00:00:00.000Z",
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      },
      { source: "input", step: -1, parents: {} },
      {},
    );

    await expect(adapter.cleanupRun?.("run-1", [])).resolves.toBeUndefined();
    await expect(adapter.checkpointer.get(config)).resolves.toBeUndefined();

    adapter.checkpointer.deleteThread = async () => {
      throw new Error("cleanup failed");
    };

    await expect(adapter.cleanupRun?.("run-1", [])).resolves.toBeUndefined();
  });
});

describe("in-memory checkpoint saver", () => {
  it("reuses named checkpointers and creates request identifiers", () => {
    expect(getCheckpointer("same")).toBe(getCheckpointer("same"));
    expect(getCheckpointer("")).toBe(getCheckpointer("__default__"));
    const oldest = getCheckpointer("evict-0");
    for (let i = 1; i <= 201; i++) {
      getCheckpointer(`evict-${i}`);
    }
    expect(getCheckpointer("evict-0")).not.toBe(oldest);
    expect(makeResumeToken()).toEqual(expect.any(String));
    expect(makeRequestId("human")).toMatch(/^human-/);
  });

  it("keeps the latest checkpoint, bounds writes, and deletes threads", async () => {
    const saver = createInMemoryCheckpointSaver({ maxWritesPerCheckpoint: 1 });
    const baseConfig = {
      configurable: { thread_id: "thread-1", checkpoint_ns: "ns" },
    };
    const first = {
      v: 4,
      id: "cp-1",
      ts: "2026-01-01T00:00:00.000Z",
      channel_values: { state: "first" },
      channel_versions: {},
      versions_seen: {},
    };
    const second = { ...first, id: "cp-2", channel_values: { state: "next" } };

    const firstConfig = await saver.put(
      baseConfig,
      first,
      { source: "input", step: -1, parents: {} },
      {},
    );
    await saver.putWrites(firstConfig, [["messages", "first-write"]], "task");

    const secondConfig = await saver.put(
      firstConfig,
      second,
      { source: "loop", step: 0, parents: {} },
      {},
    );
    await saver.putWrites(
      secondConfig,
      [
        ["messages", "kept"],
        ["extra", "dropped"],
      ],
      "task",
    );

    await expect(saver.get(baseConfig)).resolves.toMatchObject({
      id: "cp-2",
      channel_values: { state: "next" },
    });
    await expect(saver.get(firstConfig)).resolves.toBeUndefined();
    await expect(saver.getTuple({ configurable: {} })).resolves.toBeUndefined();
    await expect(
      saver.getTuple({
        configurable: {
          thread_id: "thread-1",
          checkpoint_ns: "ns",
          checkpoint_id: "missing",
        },
      }),
    ).resolves.toBeUndefined();

    const tuple = await saver.getTuple(secondConfig);
    expect(tuple?.parentConfig).toEqual(firstConfig);
    expect(tuple?.pendingWrites).toEqual([["task", "messages", "kept"]]);

    const noParentSaver = createInMemoryCheckpointSaver();
    const noParentConfig = await noParentSaver.put(
      baseConfig,
      first,
      { source: "input", step: -1, parents: {} },
      {},
    );
    const noParentTuple = await noParentSaver.getTuple(noParentConfig);
    expect(noParentTuple?.parentConfig).toBeUndefined();

    const duplicateSaver = createInMemoryCheckpointSaver({
      maxWritesPerCheckpoint: 10,
    });
    const duplicateConfig = await duplicateSaver.put(
      baseConfig,
      first,
      { source: "input", step: -1, parents: {} },
      {},
    );
    await duplicateSaver.putWrites(
      duplicateConfig,
      [["messages", "first"]],
      "task",
    );
    await duplicateSaver.putWrites(
      duplicateConfig,
      [["messages", "ignored"]],
      "task",
    );
    await expect(
      duplicateSaver.getTuple(duplicateConfig),
    ).resolves.toMatchObject({
      pendingWrites: [["task", "messages", "first"]],
    });

    await saver.putWrites({}, [["messages", "ignored"]], "task");
    await saver.putWrites(
      { configurable: { thread_id: "thread-1", checkpoint_ns: "ns" } },
      [["messages", "ignored"]],
      "task",
    );
    await saver.putWrites(
      {
        configurable: {
          thread_id: "thread-1",
          checkpoint_ns: "ns",
          checkpoint_id: "missing",
        },
      },
      [["messages", "ignored"]],
      "task",
    );

    await saver.put(
      {
        configurable: {
          thread_id: "thread-2",
          checkpoint_ns: "ns",
        },
      },
      { ...first, id: "cp-other" },
      { source: "input", step: -1, parents: {} },
      {},
    );

    await saver.deleteThread("thread-1");
    await expect(saver.get(baseConfig)).resolves.toBeUndefined();
    await expect(
      saver.get({
        configurable: {
          thread_id: "thread-2",
          checkpoint_ns: "ns",
        },
      }),
    ).resolves.toMatchObject({ id: "cp-other" });
    await noParentSaver.deleteThread("thread-1");
    await duplicateSaver.deleteThread("thread-1");
  });

  it("serializes values and handles version edge cases", async () => {
    const saver = createInMemoryCheckpointSaver();

    const [, encoded] = await saver.serde.dumpsTyped({ ok: true });
    await expect(saver.serde.loadsTyped("json", encoded)).resolves.toEqual({
      ok: true,
    });
    await expect(
      saver.serde.loadsTyped("json", '{"ok":true}'),
    ).resolves.toEqual({ ok: true });
    expect(saver.getNextVersion(undefined)).toBe(1);
    expect(saver.getNextVersion(2)).toBe(3);
    const getNextVersion = saver.getNextVersion as (
      current: number | string | undefined,
    ) => number;
    expect(() => getNextVersion("v1")).toThrow(
      "Please override this method to use string versions.",
    );
    await expect(
      saver.put(
        {},
        {
          v: 4,
          id: "cp-1",
          ts: "2026-01-01T00:00:00.000Z",
          channel_values: {},
          channel_versions: {},
          versions_seen: {},
        },
        { source: "input", step: -1, parents: {} },
        {},
      ),
    ).rejects.toThrow('missing "thread_id"');

    const listed: unknown[] = [];
    for await (const item of saver.list({ configurable: {} })) {
      listed.push(item);
    }
    expect(listed).toEqual([]);
  });
});
