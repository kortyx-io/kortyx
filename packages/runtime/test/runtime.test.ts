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
import { createRedisCheckpointSaver } from "../src/framework/redis/redis-checkpointer";
import type { RedisFrameworkStore } from "../src/framework/redis/redis-store";
import { createRedisSessionCheckpointStore } from "../src/framework/redis/session-checkpoint-store";

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

const createMemoryRedisStore = (): RedisFrameworkStore => {
  const values = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  return {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      values.delete(key);
      hashes.delete(key);
    }),
    hset: vi.fn(async (key: string, field: string, value: string) => {
      const existing = hashes.get(key) ?? new Map<string, string>();
      existing.set(field, value);
      hashes.set(key, existing);
    }),
    hsetnx: vi.fn(async (key: string, field: string, value: string) => {
      const existing = hashes.get(key) ?? new Map<string, string>();
      if (existing.has(field)) return 0;
      existing.set(field, value);
      hashes.set(key, existing);
      return 1;
    }),
    hgetall: vi.fn(async (key: string) => {
      const existing = hashes.get(key);
      if (!existing) return {};
      return Object.fromEntries(existing.entries());
    }),
    expire: vi.fn(async () => undefined),
    scanKeys: vi.fn(async (prefix: string) =>
      [...values.keys(), ...hashes.keys()].filter((key) =>
        key.startsWith(prefix),
      ),
    ),
    delRaw: vi.fn(async (keys: string[]) => {
      for (const key of keys) {
        values.delete(key);
        hashes.delete(key);
      }
    }),
  };
};

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

  it("deduplicates metadata, preserves optional summary fields, and clones stored state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const store = createInMemorySessionCheckpointStore();
    const state = {
      input: "hello",
      lastNode: "__start__",
      currentWorkflow: "workflow-1",
      config: {},
      runtime: { flags: { nested: { value: 1 } } },
      conversationHistory: [],
      awaitingHumanInput: false,
    };

    const checkpoint = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state,
      nodes: ["writer", "", "writer", undefined as unknown as string],
      structuredStreamIds: ["stream-1", "", "stream-1"],
      pendingRequests: [
        pendingRecord({ token: "token-1" }),
        pendingRecord({ token: "token-1" }),
      ],
      label: "before-report",
      workflowVersion: "v1",
      buildId: "build-1",
    });

    state.runtime.flags = { ...state.runtime.flags, nested: { value: 2 } };
    const stored = await store.get(checkpoint.id);
    expect(stored).toMatchObject({
      label: "before-report",
      workflowVersion: "v1",
      buildId: "build-1",
      nodes: ["writer"],
      effects: {
        structuredStreamIds: ["stream-1"],
        interruptTokens: ["token-1"],
      },
      state: {
        runtime: { flags: { nested: { value: 1 } } },
      },
    });
    if (!stored) throw new Error("Expected checkpoint to exist.");
    stored.state.runtime = { flags: { mutated: true } };
    await expect(store.get(checkpoint.id)).resolves.toMatchObject({
      state: { runtime: { flags: { nested: { value: 1 } } } },
    });
    await expect(store.list("session-1")).resolves.toEqual([
      expect.objectContaining({
        id: checkpoint.id,
        label: "before-report",
        workflowVersion: "v1",
        buildId: "build-1",
      }),
    ]);
    await expect(store.get("missing")).resolves.toBeNull();
    await expect(store.getHead("missing-session")).resolves.toBeNull();
  });

  it("prunes old checkpoints and reports missing rollback or fork targets", async () => {
    const store = createInMemorySessionCheckpointStore({
      maxCheckpointsPerSession: 2,
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
    });
    const second = await store.append({
      sessionId: "session-1",
      runId: "run-2",
      workflow: "workflow-1",
      state: baseState,
    });
    const third = await store.append({
      sessionId: "session-1",
      runId: "run-3",
      workflow: "workflow-1",
      state: baseState,
    });

    await expect(store.get(first.id)).resolves.toBeNull();
    await expect(store.list("session-1")).resolves.toMatchObject([
      { id: second.id, turnIndex: 1 },
      { id: third.id, turnIndex: 2 },
    ]);
    await expect(store.rollbackTo("missing")).rejects.toThrow(
      'Checkpoint "missing" not found.',
    );
    await expect(store.fork("missing")).rejects.toThrow(
      'Checkpoint "missing" not found.',
    );
  });

  it("forks pending requests into an isolated generated child session", async () => {
    const store = createInMemorySessionCheckpointStore();
    const source = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: {
        input: "hello",
        lastNode: "__start__",
        currentWorkflow: "workflow-1",
        config: {},
        runtime: {},
        conversationHistory: [],
        awaitingHumanInput: true,
      },
      pendingRequests: [
        pendingRecord({
          token: "parent-token",
          requestId: "parent-request",
          sessionId: "session-1",
        }),
      ],
    });

    const fork = await store.fork(source.id);
    expect(fork.sessionId).toMatch(/^session-/);
    expect(fork.sessionId).not.toBe("session-1");
    expect(fork.checkpoint.parentCheckpointId).toBeUndefined();
    expect(fork.checkpoint.activePendingRequests).toHaveLength(1);
    expect(fork.checkpoint.activePendingRequests[0]).toMatchObject({
      sessionId: fork.sessionId,
    });
    expect(fork.checkpoint.activePendingRequests[0]?.token).not.toBe(
      "parent-token",
    );
    expect(fork.checkpoint.activePendingRequests[0]?.requestId).toMatch(
      /^human-/,
    );
    await expect(store.list(fork.sessionId)).resolves.toEqual([
      expect.objectContaining({
        parentSessionId: "session-1",
        forkedFrom: source.id,
      }),
    ]);
  });

  it("supports repeated rollback to the same interrupt boundary after alternate branches", async () => {
    const store = createInMemorySessionCheckpointStore();
    const baseState = {
      input: "start",
      lastNode: "__start__",
      currentWorkflow: "workflow-1",
      config: {},
      runtime: {},
      conversationHistory: [],
      awaitingHumanInput: false,
    };

    const firstInterrupt = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: { ...baseState, awaitingHumanInput: true },
      structuredStreamIds: ["capture"],
      pendingRequests: [
        pendingRecord({
          token: "template-token",
          requestId: "template-request",
        }),
      ],
    });
    const launchTurn = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: { ...baseState, runtime: { flags: { template: "launch" } } },
      structuredStreamIds: ["launch-step"],
      pendingRequests: [
        pendingRecord({
          token: "launch-depth-token",
          requestId: "launch-depth-request",
        }),
      ],
    });
    await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: {
        ...baseState,
        runtime: { flags: { template: "launch", depth: "deep" } },
      },
      structuredStreamIds: ["launch-draft"],
    });

    await expect(store.rollbackTo(firstInterrupt.id)).resolves.toMatchObject({
      head: firstInterrupt.id,
      invalidatedStructuredStreamIds: ["launch-step", "launch-draft"],
      invalidatedInterruptTokens: ["launch-depth-token"],
      activePendingRequests: [
        expect.objectContaining({ token: "template-token" }),
      ],
    });
    await expect(store.get(launchTurn.id)).resolves.toBeNull();

    const researchTurn = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: { ...baseState, runtime: { flags: { template: "research" } } },
      structuredStreamIds: ["research-step"],
      pendingRequests: [
        pendingRecord({
          token: "research-depth-token",
          requestId: "research-depth-request",
        }),
      ],
    });

    await expect(store.rollbackTo(firstInterrupt.id)).resolves.toMatchObject({
      head: firstInterrupt.id,
      invalidatedStructuredStreamIds: ["research-step"],
      invalidatedInterruptTokens: ["research-depth-token"],
      activePendingRequests: [
        expect.objectContaining({ token: "template-token" }),
      ],
    });
    await expect(store.get(researchTurn.id)).resolves.toBeNull();
    await expect(store.list("session-1")).resolves.toMatchObject([
      { id: firstInterrupt.id, turnIndex: 0 },
    ]);
  });

  it("covers defensive in-memory checkpoint branches", async () => {
    const baseState = {
      input: "hello",
      lastNode: "__start__",
      currentWorkflow: "workflow-1",
      config: {},
      runtime: {},
      conversationHistory: [],
      awaitingHumanInput: false,
    };
    const empty = createInMemorySessionCheckpointStore({
      maxCheckpointsPerSession: 0,
    });
    const pruned = await empty.append({
      sessionId: "session-pruned",
      runId: "run-1",
      workflow: "workflow-1",
      state: baseState,
    });
    await expect(empty.get(pruned.id)).resolves.toBeNull();
    await expect(empty.getHead("session-pruned")).resolves.toBeNull();
    await expect(empty.list("missing-session")).resolves.toEqual([]);

    const store = createInMemorySessionCheckpointStore();
    const undefinedState = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: undefined as never,
    });
    expect(undefinedState.state).toBeUndefined();
    const sameSessionFork = await store.fork(undefinedState.id, {
      newSessionId: "session-1",
    });
    await expect(store.list("session-1")).resolves.toMatchObject([
      { id: undefinedState.id, turnIndex: 0 },
      {
        id: sameSessionFork.checkpoint.id,
        turnIndex: 0,
        parentSessionId: "session-1",
        forkedFrom: undefinedState.id,
      },
    ]);
  });
});

describe("redis session checkpoint store", () => {
  it("persists, rolls back, prunes, and forks checkpoint state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const redisStore = createMemoryRedisStore();
    const store = createRedisSessionCheckpointStore({
      store: redisStore,
      ttlMs: 5000,
      prefix: "session-cp:",
      maxCheckpointsPerSession: 2,
    });
    const baseState = {
      input: "hello",
      lastNode: "__start__",
      currentWorkflow: "workflow-1",
      config: {},
      runtime: { flags: { nested: { value: 1 } } },
      conversationHistory: [],
      awaitingHumanInput: false,
    };

    const first = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: baseState,
      nodes: ["start", "start", ""],
      label: "start",
      workflowVersion: "v1",
      buildId: "build-1",
    });
    const second = await store.append({
      sessionId: "session-1",
      runId: "run-2",
      workflow: "workflow-1",
      state: { ...baseState, input: "second" },
      structuredStreamIds: ["stream-1"],
      pendingRequests: [pendingRecord({ token: "token-1" })],
      label: "second",
      workflowVersion: "v1",
      buildId: "build-1",
    });
    const third = await store.append({
      sessionId: "session-1",
      runId: "run-3",
      workflow: "workflow-1",
      state: { ...baseState, input: "third" },
      structuredStreamIds: ["stream-2"],
      pendingRequests: [pendingRecord({ token: "token-2" })],
    });

    await expect(store.get(first.id)).resolves.toBeNull();
    await expect(store.get(second.id)).resolves.toMatchObject({
      id: second.id,
      label: "second",
    });
    await expect(store.list("session-1")).resolves.toMatchObject([
      {
        id: second.id,
        turnIndex: 1,
        parentCheckpointId: first.id,
        label: "second",
        workflowVersion: "v1",
        buildId: "build-1",
      },
      { id: third.id, turnIndex: 2, parentCheckpointId: second.id },
    ]);
    await expect(store.getHead("session-1")).resolves.toMatchObject({
      id: third.id,
    });

    await expect(store.rollbackTo(second.id)).resolves.toMatchObject({
      sessionId: "session-1",
      head: second.id,
      invalidatedStructuredStreamIds: ["stream-2"],
      invalidatedInterruptTokens: ["token-2"],
      activePendingRequests: [{ token: "token-1" }],
    });
    await expect(store.get(third.id)).resolves.toBeNull();

    const fork = await store.fork(second.id);
    expect(fork.sessionId).toMatch(/^session-/);
    expect(fork.checkpoint).toMatchObject({
      parentSessionId: "session-1",
      forkedFrom: second.id,
    });
    expect(fork.checkpoint.parentCheckpointId).toBeUndefined();
    expect(fork.checkpoint.activePendingRequests[0]).toMatchObject({
      sessionId: fork.sessionId,
    });
    expect(fork.checkpoint.activePendingRequests[0]?.token).not.toBe("token-1");
    expect(fork.checkpoint.activePendingRequests[0]?.requestId).toMatch(
      /^human-/,
    );

    const sameSessionFork = await store.fork(second.id, {
      newSessionId: "session-1",
    });
    await expect(store.list("session-1")).resolves.toMatchObject([
      { id: second.id, turnIndex: 1 },
      {
        id: sameSessionFork.checkpoint.id,
        turnIndex: 1,
        parentSessionId: "session-1",
        forkedFrom: second.id,
      },
    ]);

    await expect(store.getHead("missing-session")).resolves.toBeNull();
    await expect(store.get("missing")).resolves.toBeNull();
    await expect(store.rollbackTo("missing")).rejects.toThrow(
      'Checkpoint "missing" not found.',
    );
    await expect(store.fork("missing")).rejects.toThrow(
      'Checkpoint "missing" not found.',
    );
  });

  it("supports repeated rollback to the same interrupt boundary after alternate branches", async () => {
    const store = createRedisSessionCheckpointStore({
      store: createMemoryRedisStore(),
      ttlMs: 5000,
      prefix: "session-cp:",
    });
    const baseState = {
      input: "start",
      lastNode: "__start__",
      currentWorkflow: "workflow-1",
      config: {},
      runtime: {},
      conversationHistory: [],
      awaitingHumanInput: false,
    };

    const firstInterrupt = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: { ...baseState, awaitingHumanInput: true },
      structuredStreamIds: ["capture"],
      pendingRequests: [
        pendingRecord({
          token: "template-token",
          requestId: "template-request",
        }),
      ],
    });
    const launchTurn = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: { ...baseState, runtime: { flags: { template: "launch" } } },
      structuredStreamIds: ["launch-step"],
      pendingRequests: [
        pendingRecord({
          token: "launch-depth-token",
          requestId: "launch-depth-request",
        }),
      ],
    });
    await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: {
        ...baseState,
        runtime: { flags: { template: "launch", depth: "deep" } },
      },
      structuredStreamIds: ["launch-draft"],
    });

    await expect(store.rollbackTo(firstInterrupt.id)).resolves.toMatchObject({
      head: firstInterrupt.id,
      invalidatedStructuredStreamIds: ["launch-step", "launch-draft"],
      invalidatedInterruptTokens: ["launch-depth-token"],
      activePendingRequests: [
        expect.objectContaining({ token: "template-token" }),
      ],
    });
    await expect(store.get(launchTurn.id)).resolves.toBeNull();

    const researchTurn = await store.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: { ...baseState, runtime: { flags: { template: "research" } } },
      structuredStreamIds: ["research-step"],
      pendingRequests: [
        pendingRecord({
          token: "research-depth-token",
          requestId: "research-depth-request",
        }),
      ],
    });

    await expect(store.rollbackTo(firstInterrupt.id)).resolves.toMatchObject({
      head: firstInterrupt.id,
      invalidatedStructuredStreamIds: ["research-step"],
      invalidatedInterruptTokens: ["research-depth-token"],
      activePendingRequests: [
        expect.objectContaining({ token: "template-token" }),
      ],
    });
    await expect(store.get(researchTurn.id)).resolves.toBeNull();
    await expect(store.list("session-1")).resolves.toMatchObject([
      { id: firstInterrupt.id, turnIndex: 0 },
    ]);
  });

  it("returns null when a redis head pointer references a missing record", async () => {
    const store = createRedisSessionCheckpointStore({
      store: {
        ...createMemoryRedisStore(),
        get: vi.fn(async (key: string) =>
          key === "session-cp:head:session-1" ? "missing-cp" : null,
        ),
      },
      ttlMs: 5000,
      prefix: "session-cp:",
    });

    await expect(store.getHead("session-1")).resolves.toBeNull();
  });

  it("covers default prefix and scan normalization branches", async () => {
    const defaultPrefixStore = createMemoryRedisStore();
    const defaultPrefixCheckpointStore = createRedisSessionCheckpointStore({
      store: defaultPrefixStore,
      ttlMs: 5000,
    });
    await defaultPrefixCheckpointStore.append({
      sessionId: "session-default-prefix",
      runId: "run-1",
      workflow: "workflow-1",
      state: undefined as never,
    });
    expect(defaultPrefixStore.set).toHaveBeenCalledWith(
      expect.stringContaining("by-id:"),
      expect.any(String),
      5000,
    );

    const record = {
      id: "cp-external",
      sessionId: "session-raw",
      runId: "run-1",
      turnIndex: 0,
      createdAt: 1,
      nodes: [],
      workflow: "workflow-1",
      state: {},
      effects: { structuredStreamIds: [], interruptTokens: [] },
      activePendingRequests: [],
    };
    const scanStore: RedisFrameworkStore = {
      ...createMemoryRedisStore(),
      scanKeys: vi.fn(async () => ["external-record", "missing-record"]),
      get: vi.fn(async (key: string) =>
        key === "external-record" ? JSON.stringify(record) : null,
      ),
    };
    const scanCheckpointStore = createRedisSessionCheckpointStore({
      store: scanStore,
      ttlMs: 5000,
      prefix: "session-cp:",
    });

    await expect(scanCheckpointStore.list("session-raw")).resolves.toEqual([
      expect.objectContaining({ id: "cp-external" }),
    ]);
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

  it("passes session checkpoint retention options through framework adapters", async () => {
    const inMemory = createInMemoryFrameworkAdapter({
      maxSessionCheckpoints: 1,
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

    const first = await inMemory.sessionCheckpoints.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "workflow-1",
      state: baseState,
    });
    const second = await inMemory.sessionCheckpoints.append({
      sessionId: "session-1",
      runId: "run-2",
      workflow: "workflow-1",
      state: baseState,
    });

    await expect(inMemory.sessionCheckpoints.get(first.id)).resolves.toBeNull();
    await expect(
      inMemory.sessionCheckpoints.list("session-1"),
    ).resolves.toEqual([expect.objectContaining({ id: second.id })]);
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

describe("checkpoint savers", () => {
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

  it("keeps checkpoint history, bounds writes, and deletes threads", async () => {
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
    await expect(saver.get(firstConfig)).resolves.toMatchObject({
      id: "cp-1",
      channel_values: { state: "first" },
    });
    await expect(saver.getLatestCheckpointId("thread-1", "ns")).resolves.toBe(
      "cp-2",
    );
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

    await saver.deleteCheckpointWrites("thread-1", "ns", "cp-2");
    await expect(saver.getTuple(secondConfig)).resolves.toMatchObject({
      pendingWrites: [],
    });

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
      saver.getLatestCheckpointId("thread-1", "ns"),
    ).resolves.toBeUndefined();
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

  it("clears Redis checkpoint writes without deleting the checkpoint", async () => {
    const saver = createRedisCheckpointSaver({
      store: createMemoryRedisStore(),
      ttlMs: 60_000,
    });
    const config = await saver.put(
      {
        configurable: {
          thread_id: "thread-1",
          checkpoint_ns: "workflow-1",
        },
      },
      {
        v: 4,
        id: "cp-1",
        ts: "2026-01-01T00:00:00.000Z",
        channel_values: { state: "paused" },
        channel_versions: {},
        versions_seen: {},
      },
      { source: "input", step: -1, parents: {} },
      {},
    );
    await saver.putWrites(config, [["messages", "launch"]], "task");

    await expect(saver.getTuple(config)).resolves.toMatchObject({
      pendingWrites: [["task", "messages", "launch"]],
    });

    await saver.deleteCheckpointWrites("thread-1", "workflow-1", "cp-1");

    await expect(saver.get(config)).resolves.toMatchObject({
      id: "cp-1",
      channel_values: { state: "paused" },
    });
    await expect(saver.getTuple(config)).resolves.toMatchObject({
      pendingWrites: [],
    });
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
