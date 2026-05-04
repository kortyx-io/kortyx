import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInitialGraphState,
  clearRegisteredNodes,
  createFrameworkAdapterFromEnv,
  createInMemoryPendingRequestStore,
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
  });
});

describe("in-memory checkpoint saver", () => {
  it("reuses named checkpointers and creates request identifiers", () => {
    expect(getCheckpointer("same")).toBe(getCheckpointer("same"));
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

    const tuple = await saver.getTuple(secondConfig);
    expect(tuple?.pendingWrites).toEqual([["task", "messages", "kept"]]);

    await saver.deleteThread("thread-1");
    await expect(saver.get(baseConfig)).resolves.toBeUndefined();
  });
});
