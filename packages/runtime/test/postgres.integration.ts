import { randomUUID } from "node:crypto";
import type { GraphState } from "@kortyx/core";
import { emptyCheckpoint } from "@langchain/langgraph-checkpoint";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createFrameworkAdapterFromEnv } from "../src/framework/adapter";
import {
  captureGraphSnapshot,
  restoreGraphSnapshot,
} from "../src/framework/graph-snapshot";
import type { PendingRequestRecord } from "../src/framework/pending-requests";
import {
  createPostgresFrameworkAdapter,
  type PostgresFrameworkAdapter,
} from "../src/framework/postgres/adapter";
import { PostgresCheckpointSaver } from "../src/framework/postgres/checkpointer";
import { PostgresRuntimeStore } from "../src/framework/postgres/store";
import { createRedisClient } from "../src/framework/redis/redis-client";

const url = process.env.KORTYX_TEST_POSTGRES_URL;
if (!url)
  throw new Error(
    "Set KORTYX_TEST_POSTGRES_URL to a disposable PostgreSQL database to run persistence integration tests.",
  );
const redisUrl = process.env.KORTYX_TEST_REDIS_URL;
const sql = postgres(url, { onnotice: () => {} });
const DAY = 86_400_000;
const state: GraphState = {
  input: "hello",
  currentWorkflow: "root",
  lastNode: "__start__",
  config: {},
  runtime: {},
  conversationHistory: [],
  awaitingHumanInput: false,
};
const metadata = { source: "loop" as const, step: 1, parents: {} };
const graph = (id = `g-${randomUUID()}`) => ({
  ...emptyCheckpoint(),
  id,
  channel_values: { ...state, runtime: { saved: true } },
});
const config = (id?: string, run = "run-1", ns = "") => ({
  configurable: {
    thread_id: run,
    checkpoint_ns: ns,
    ...(id ? { checkpoint_id: id } : {}),
  },
});
let adapter: PostgresFrameworkAdapter;
let scope: string;
const extras: Array<{ close: () => Promise<void> }> = [];

beforeEach(async () => {
  scope = `test-${randomUUID()}`;
  adapter = createPostgresFrameworkAdapter({
    connectionString: url,
    namespace: scope,
  });
  await adapter.maintenance.setup();
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all([
    adapter.close(),
    ...extras.splice(0).map((extra) => extra.close()),
  ]);
  await sql`DELETE FROM kortyx_runtime_pending_requests WHERE scope = ${scope}`;
  await sql`DELETE FROM kortyx_runtime_sessions WHERE scope = ${scope}`;
  await sql`DELETE FROM kortyx_runtime_runs WHERE scope = ${scope}`;
});
afterAll(() => sql.end());

const append = (runId = "run-1", sessionId = "session-1") =>
  adapter.sessionCheckpoints.append({
    runId,
    sessionId,
    workflow: "root",
    state,
  });
const pending = (
  overrides: Partial<PendingRequestRecord> = {},
): PendingRequestRecord => ({
  token: `token-${randomUUID()}`,
  requestId: "human-1",
  runId: "run-1",
  sessionId: "session-1",
  workflow: "root",
  node: "approval",
  schema: { kind: "text", multiple: false },
  options: [],
  createdAt: Date.now(),
  ttlMs: DAY,
  ...overrides,
});
const age = async (days = 31) => {
  const timestamp = Date.now() - days * DAY;
  await sql`UPDATE kortyx_runtime_sessions SET last_activity = ${timestamp} WHERE scope = ${scope}`;
  await sql`UPDATE kortyx_runtime_session_checkpoints SET created_at = ${timestamp} WHERE scope = ${scope}`;
  await sql`UPDATE kortyx_runtime_runs SET last_activity = ${timestamp} WHERE scope = ${scope}`;
};

describe("PostgreSQL runtime persistence", () => {
  it("sets up idempotently, stores history and reconstructs the adapter after restart", async () => {
    await adapter.maintenance.setup();
    const first = await append();
    const second = await append();
    expect(second.parentCheckpointId).toBe(first.id);
    const restarted = createPostgresFrameworkAdapter({
      connectionString: url,
      namespace: scope,
    });
    extras.push(restarted);
    expect(
      await restarted.sessionCheckpoints.getHead("session-1"),
    ).toMatchObject({ id: second.id, state });
    expect(await restarted.sessionCheckpoints.list("session-1")).toHaveLength(
      2,
    );
    expect(await restarted.sessionCheckpoints.get("missing")).toBeNull();
    expect(await restarted.sessionCheckpoints.getHead("missing")).toBeNull();
  });

  it("serializes concurrent appends across workers without losing lineage", async () => {
    const other = createPostgresFrameworkAdapter({
      connectionString: url,
      namespace: scope,
    });
    extras.push(other);
    const checkpoints = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? adapter : other).sessionCheckpoints.append({
          runId: `run-${index}`,
          sessionId: "session-1",
          workflow: "root",
          state,
        }),
      ),
    );
    const ordered = checkpoints.sort((a, b) => a.turnIndex - b.turnIndex);
    expect(ordered.map((checkpoint) => checkpoint.turnIndex)).toEqual(
      Array.from({ length: 12 }, (_, index) => index),
    );
    for (let index = 1; index < ordered.length; index++)
      expect(ordered[index]?.parentCheckpointId).toBe(ordered[index - 1]?.id);
  });

  it("retains abandoned rollback branches and can fork or reactivate them", async () => {
    const first = await append();
    const second = await adapter.sessionCheckpoints.append({
      runId: "run-2",
      sessionId: "session-1",
      workflow: "root",
      state,
      structuredStreamIds: ["stream-2", "stream-2"],
    });
    const rolledBack = await adapter.sessionCheckpoints.rollbackTo(first.id);
    expect(rolledBack.invalidatedStructuredStreamIds).toEqual(["stream-2"]);
    expect(await adapter.sessionCheckpoints.get(second.id)).toMatchObject({
      branchStatus: "abandoned",
    });
    const third = await append("run-3");
    expect(third.turnIndex).toBe(2);
    expect(third.parentCheckpointId).toBe(first.id);
    const forked = await adapter.sessionCheckpoints.fork(second.id, {
      newSessionId: "fork-1",
    });
    expect(forked.checkpoint).toMatchObject({
      parentSessionId: "session-1",
      forkedFrom: second.id,
      state,
    });
    await adapter.sessionCheckpoints.rollbackTo(second.id);
    expect(await adapter.sessionCheckpoints.getHead("session-1")).toMatchObject(
      { id: second.id },
    );
    expect(await adapter.sessionCheckpoints.get(third.id)).toMatchObject({
      branchStatus: "abandoned",
    });
    await expect(
      adapter.sessionCheckpoints.fork(second.id, { newSessionId: "fork-1" }),
    ).rejects.toHaveProperty("code", "SESSION_EXISTS");
    await expect(
      adapter.sessionCheckpoints.rollbackTo("missing"),
    ).rejects.toHaveProperty("code", "NOT_FOUND");
    await expect(
      adapter.sessionCheckpoints.fork("missing"),
    ).rejects.toHaveProperty("code", "NOT_FOUND");
  });

  it("persists graph checkpoints, namespaces, writes, filters, and snapshots", async () => {
    const first = await adapter.checkpointer.put(
      config(),
      graph("g-001"),
      metadata,
      {},
    );
    await adapter.checkpointer.putWrites(
      first,
      [["result", { original: true }]],
      "task-1",
    );
    await adapter.checkpointer.putWrites(
      first,
      [["result", { duplicate: true }]],
      "task-1",
    );
    await adapter.checkpointer.putWrites(
      first,
      [["__error__", "first"]],
      "task-2",
    );
    await adapter.checkpointer.putWrites(
      first,
      [["__error__", "updated"]],
      "task-2",
    );
    const second = await adapter.checkpointer.put(
      first,
      graph("g-002"),
      { ...metadata, step: 2 },
      {},
    );
    await adapter.checkpointer.put(
      config(undefined, "run-1", "child"),
      graph("g-child"),
      metadata,
      {},
    );
    expect(await adapter.checkpointer.getLatestCheckpointId("run-1")).toBe(
      "g-002",
    );
    expect(
      await adapter.checkpointer.getLatestCheckpointId("run-1", "child"),
    ).toBe("g-child");
    const saved = await adapter.checkpointer.getTuple(first);
    expect(saved?.pendingWrites).toEqual([
      ["task-1", "result", { original: true }],
      ["task-2", "__error__", "updated"],
    ]);
    expect(await adapter.checkpointer.getTuple(second)).toMatchObject({
      parentConfig: first,
    });
    const filtered = [];
    for await (const tuple of adapter.checkpointer.list(config(), {
      before: config("g-002"),
      filter: { step: 1 },
      limit: 1,
    }))
      filtered.push(tuple.checkpoint.id);
    expect(filtered).toEqual(["g-001"]);
    const all = [];
    for await (const tuple of adapter.checkpointer.list({})) all.push(tuple);
    expect(all).toHaveLength(3);
    const exact = [];
    for await (const tuple of adapter.checkpointer.list(first))
      exact.push(tuple);
    expect(exact).toHaveLength(1);
    const snapshot = await captureGraphSnapshot(
      adapter.checkpointer,
      "run-1",
      "g-001",
    );
    expect(snapshot).toBeDefined();
    await restoreGraphSnapshot(adapter.checkpointer, snapshot!, "restored");
    expect(
      (await adapter.checkpointer.getTuple(config(undefined, "restored")))
        ?.pendingWrites,
    ).toEqual(saved?.pendingWrites);
    await adapter.cleanupRun?.("run-1", [""]);
    expect(await adapter.checkpointer.getTuple(first)).toBeDefined();
    await adapter.checkpointer.deleteCheckpointWrites("run-1", "", "g-001");
    expect((await adapter.checkpointer.getTuple(first))?.pendingWrites).toEqual(
      [],
    );
    await adapter.checkpointer.deleteThread("restored");
    expect(
      await adapter.checkpointer.get(config(undefined, "restored")),
    ).toBeUndefined();
    expect(await adapter.checkpointer.getTuple({})).toBeUndefined();
    await expect(
      adapter.checkpointer.put({}, graph(), metadata, {}),
    ).rejects.toHaveProperty("code", "PERSISTENCE_ERROR");
    await expect(
      adapter.checkpointer.putWrites({}, [], "task"),
    ).rejects.toHaveProperty("code", "PERSISTENCE_ERROR");
  });

  it("consumes a pending interrupt exactly once across adapters", async () => {
    const request = pending();
    await adapter.pendingRequests.save(request);
    await adapter.pendingRequests.update(request.token, {
      ready: true,
      createdAt: 0,
      ttlMs: 1,
    });
    expect(await adapter.pendingRequests.get(request.token)).toMatchObject({
      ready: true,
      createdAt: request.createdAt,
      ttlMs: request.ttlMs,
    });
    const other = createPostgresFrameworkAdapter({
      connectionString: url,
      namespace: scope,
    });
    extras.push(other);
    const taken = await Promise.all([
      adapter.pendingRequests.take!(request.token),
      other.pendingRequests.take!(request.token),
    ]);
    expect(taken.filter(Boolean)).toHaveLength(1);
    expect(await adapter.pendingRequests.list!()).toEqual([]);
    await adapter.pendingRequests.update("missing", {});
    await adapter.pendingRequests.delete("missing");
    expect(await adapter.pendingRequests.get("missing")).toBeNull();
  });

  it("never revives expired approvals through save, update, rollback, or fork", async () => {
    const checkpoint = await adapter.checkpointer.put(
      config(),
      graph(),
      metadata,
      {},
    );
    const request = pending({
      graphCheckpointId: checkpoint.configurable?.checkpoint_id as string,
      createdAt: Date.now() - 2 * DAY,
    });
    await adapter.pendingRequests.save(request);
    expect(await adapter.pendingRequests.get(request.token)).toBeNull();
    const saved = await adapter.sessionCheckpoints.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "root",
      state,
      pendingRequests: [request],
    });
    await expect(
      adapter.sessionCheckpoints.rollbackTo(saved.id),
    ).rejects.toHaveProperty("code", "INTERRUPT_EXPIRED");
    await expect(
      adapter.sessionCheckpoints.fork(saved.id),
    ).rejects.toHaveProperty("code", "INTERRUPT_EXPIRED");
    const expired = pending();
    await adapter.pendingRequests.save(expired);
    await sql`UPDATE kortyx_runtime_pending_requests SET expires_at = 0 WHERE scope = ${scope}`;
    await adapter.pendingRequests.update(expired.token, { ready: true });
    expect(await adapter.pendingRequests.get(expired.token)).toBeNull();
    expect(await adapter.pendingRequests.take!(expired.token)).toBeNull();
    await expect(
      adapter.pendingRequests.save(pending({ ttlMs: 0 })),
    ).rejects.toThrow();
    await expect(
      adapter.pendingRequests.save(pending({ createdAt: NaN })),
    ).rejects.toThrow();
  });

  it("seals self-contained paused snapshots and gives forks independent tokens", async () => {
    await adapter.checkpointer.put(config(), graph(), metadata, {});
    const request = pending();
    await adapter.pendingRequests.save(request);
    const paused = await adapter.sessionCheckpoints.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "root",
      state,
      pendingRequests: [request],
    });
    expect(paused.activePendingRequests[0]?.graphSnapshot).toBeDefined();
    const forked = await adapter.sessionCheckpoints.fork(paused.id);
    expect(forked.checkpoint.activePendingRequests[0]?.token).not.toBe(
      request.token,
    );
    expect(forked.checkpoint.runId).not.toBe(request.runId);
    await adapter.checkpointer.deleteThread("run-1");
    expect(
      forked.checkpoint.activePendingRequests[0]?.graphSnapshot,
    ).toBeDefined();
    const later = await adapter.sessionCheckpoints.append({
      sessionId: "session-1",
      runId: "later",
      workflow: "root",
      state,
      pendingRequests: [],
    });
    expect(later.parentCheckpointId).toBe(paused.id);
    expect(
      (await adapter.sessionCheckpoints.rollbackTo(paused.id))
        .activePendingRequests,
    ).toHaveLength(1);
    await expect(
      adapter.sessionCheckpoints.append({
        sessionId: "incomplete",
        runId: "missing",
        workflow: "root",
        state,
        pendingRequests: [pending({ runId: "missing" })],
      }),
    ).rejects.toHaveProperty("code", "CHECKPOINT_INCOMPLETE");
  });

  it("enforces expiry before physical cleanup and removes associated state in bounded batches", async () => {
    for (let index = 0; index < 4; index++) {
      const run = `run-${index}`;
      const cfg = await adapter.checkpointer.put(
        config(undefined, run),
        graph(),
        metadata,
        {},
      );
      await adapter.checkpointer.putWrites(cfg, [["result", "done"]], "task");
      await append(run);
    }
    await adapter.pendingRequests.save(pending());
    await age();
    await sql`UPDATE kortyx_runtime_pending_requests SET expires_at = 0 WHERE scope = ${scope}`;
    expect(await adapter.sessionCheckpoints.getHead("session-1")).toBeNull();
    expect(await adapter.sessionCheckpoints.list("session-1")).toEqual([]);
    expect(
      await adapter.checkpointer.getTuple(config(undefined, "run-0")),
    ).toBeUndefined();
    await expect(append()).rejects.toHaveProperty("code", "SESSION_EXPIRED");
    const first = await adapter.maintenance.prune({ batchSize: 2 });
    expect(first.hasMore).toBe(true);
    expect(first.deleted.sessionCheckpoints).toBe(2);
    for (const count of Object.values(first.deleted))
      expect(count).toBeLessThanOrEqual(2);
    for (let iteration = 0; iteration < 5; iteration++)
      await adapter.maintenance.prune({ batchSize: 2 });
    expect(
      (
        await sql`SELECT * FROM kortyx_runtime_graph_writes WHERE scope = ${scope}`
      ).length,
    ).toBe(0);
    expect(
      (await sql`SELECT * FROM kortyx_runtime_runs WHERE scope = ${scope}`)
        .length,
    ).toBe(0);
    expect((await adapter.maintenance.prune()).deleted).toEqual({
      pendingRequests: 0,
      sessionCheckpoints: 0,
      graphCheckpoints: 0,
      sessions: 0,
      runs: 0,
    });
  });

  it("prunes history while retaining the current head and the head's graph", async () => {
    await adapter.checkpointer.put(config(), graph(), metadata, {});
    const first = await append();
    const head = await append();
    await age();
    await sql`UPDATE kortyx_runtime_sessions SET last_activity = ${Date.now()} WHERE scope = ${scope}`;
    expect(await adapter.sessionCheckpoints.get(first.id)).toBeNull();
    expect(await adapter.sessionCheckpoints.get(head.id)).toBeDefined();
    expect((await adapter.maintenance.prune()).deleted.sessionCheckpoints).toBe(
      1,
    );
    expect(await adapter.checkpointer.getTuple(config())).toBeDefined();
  });

  it("protects unexpired pauses past session and history windows", async () => {
    await adapter.checkpointer.put(config(), graph(), metadata, {});
    const request = pending({ ttlMs: 90 * DAY });
    await adapter.pendingRequests.save(request);
    const saved = await adapter.sessionCheckpoints.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "root",
      state,
      pendingRequests: [request],
    });
    await age(60);
    expect(await adapter.sessionCheckpoints.get(saved.id)).toBeDefined();
    expect((await adapter.maintenance.prune()).deleted.sessionCheckpoints).toBe(
      0,
    );
    expect(await adapter.checkpointer.getTuple(config())).toBeDefined();
    const embedded = saved.activePendingRequests[0]!;
    const second = await adapter.sessionCheckpoints.append({
      sessionId: "session-1",
      runId: "run-1",
      workflow: "root",
      state,
      pendingRequests: [embedded],
      label: "saved",
      workflowVersion: "v1",
      buildId: "build-1",
      nodes: ["approval"],
      graphCheckpointId: embedded.graphSnapshot!.checkpoint.id,
    });
    expect(second).toMatchObject({
      label: "saved",
      workflowVersion: "v1",
      buildId: "build-1",
    });
  });

  it("protects an executing run and session, rejects concurrent execution/rollback, and releases its lease", async () => {
    const saved = await append();
    await adapter.checkpointer.put(config(), graph(), metadata, {});
    const release = await adapter.acquireRunLease!({
      runId: "run-1",
      sessionId: "session-1",
      onLost: vi.fn(),
    });
    await age(60);
    expect(await adapter.sessionCheckpoints.get(saved.id)).toBeDefined();
    expect((await adapter.maintenance.prune()).deleted.sessions).toBe(0);
    await expect(
      adapter.acquireRunLease!({
        runId: "run-1",
        sessionId: "session-1",
        onLost: vi.fn(),
      }),
    ).rejects.toThrow("already executing");
    await expect(
      adapter.sessionCheckpoints.rollbackTo(saved.id),
    ).rejects.toHaveProperty("code", "SESSION_BUSY");
    await release();
    await age(60);
    await adapter.maintenance.prune();
    expect(await adapter.sessionCheckpoints.get(saved.id)).toBeNull();
  });

  it("renews leases and reports lost ownership", async () => {
    // Fake only interval scheduling; PostgreSQL networking continues on real timers.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const lost = vi.fn();
    const release = await adapter.acquireRunLease!({
      runId: "run-1",
      onLost: lost,
    });
    const previous = (
      await sql`SELECT lease_until FROM kortyx_runtime_runs WHERE scope = ${scope}`
    )[0]?.lease_until;
    await sql`UPDATE kortyx_runtime_runs SET lease_until = ${Date.now() + 10_000} WHERE scope = ${scope}`;
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(async () =>
      expect(
        Number(
          (
            await sql`SELECT lease_until FROM kortyx_runtime_runs WHERE scope = ${scope}`
          )[0]?.lease_until,
        ),
      ).toBeGreaterThanOrEqual(Number(previous)),
    );
    await sql`UPDATE kortyx_runtime_runs SET lease_token = 'other-owner' WHERE scope = ${scope}`;
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(lost).toHaveBeenCalledOnce());
    await release();
  });

  it("skips cleanup while a mutation owns the shared maintenance lock", async () => {
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`kortyx:runtime:${scope}`}, 0))`;
      expect((await adapter.maintenance.prune()).skipped).toBe(true);
    });
    expect((await adapter.maintenance.prune()).skipped).toBe(false);
    await expect(adapter.maintenance.prune({ batchSize: 0 })).rejects.toThrow();
    await expect(
      adapter.maintenance.prune({ batchSize: 1001 }),
    ).rejects.toThrow();
    await expect(
      adapter.maintenance.prune({ now: new Date(Date.now() + DAY) }),
    ).rejects.toThrow();
    await expect(
      adapter.maintenance.prune({ now: new Date(NaN) }),
    ).rejects.toThrow();
  });

  it("isolates namespaces sharing a database and cleans only its own records", async () => {
    const saved = await append();
    const other = createPostgresFrameworkAdapter({
      connectionString: url,
      namespace: `${scope}-other`,
    });
    extras.push(other);
    expect(await other.sessionCheckpoints.get(saved.id)).toBeNull();
    await other.maintenance.prune();
    expect(await adapter.sessionCheckpoints.get(saved.id)).toBeDefined();
  });

  it("supports explicit retention windows and env selection without using the app DATABASE_URL", async () => {
    const configured = createPostgresFrameworkAdapter({
      connectionString: url,
      namespace: scope,
      ttlMs: DAY,
      retention: { checkpointHistoryDays: 1, inactiveSessionDays: 3 },
    });
    extras.push(configured);
    const first = await append();
    const head = await append();
    await age(2);
    expect(await configured.sessionCheckpoints.get(first.id)).toBeNull();
    expect(await configured.sessionCheckpoints.get(head.id)).toBeDefined();
    expect(configured.ttlMs).toBe(DAY);
    const env = createFrameworkAdapterFromEnv({
      KORTYX_POSTGRES_URL: url,
      KORTYX_TTL_MS: "1000",
      ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
    });
    expect(env.kind).toBe("postgres");
    await (env as PostgresFrameworkAdapter).close();
    expect(createFrameworkAdapterFromEnv({ DATABASE_URL: url }).kind).toBe(
      "in-memory",
    );
    expect(() =>
      createPostgresFrameworkAdapter({ connectionString: "redis://localhost" }),
    ).toThrow();
    expect(() =>
      createPostgresFrameworkAdapter({ connectionString: url, namespace: "" }),
    ).toThrow();
    expect(() =>
      createPostgresFrameworkAdapter({
        connectionString: url,
        retention: { checkpointHistoryDays: -1 },
      }),
    ).toThrow();
    expect(() =>
      createPostgresFrameworkAdapter({
        connectionString: url,
        retention: { inactiveSessionDays: 1e20 },
      }),
    ).toThrow();
    expect(() =>
      createPostgresFrameworkAdapter({
        connectionString: url,
        redis: { url: "redis://localhost", ttlMs: 0 },
      }),
    ).toThrow();
  });

  it("validates PostgreSQL visibility on cached reads, versions graph writes, and tolerates cache errors", async () => {
    const cacheValues = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => cacheValues.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        cacheValues.set(key, value);
      }),
    };
    const store = new PostgresRuntimeStore(url, scope, {}, cache);
    extras.push(store);
    const saver = new PostgresCheckpointSaver(store);
    const cfg = await saver.put(config(), graph(), metadata, {});
    expect(await saver.getTuple(cfg)).toBeDefined();
    expect(await saver.getTuple(cfg)).toBeDefined();
    expect(cache.set).toHaveBeenCalledOnce();
    await saver.putWrites(cfg, [["result", "new"]], "task");
    expect((await saver.getTuple(cfg))?.pendingWrites).toEqual([
      ["task", "result", "new"],
    ]);
    cache.get.mockRejectedValueOnce(new Error("Redis unavailable"));
    cache.set.mockRejectedValueOnce(new Error("Redis unavailable"));
    expect(await saver.getTuple(cfg)).toBeDefined();
    cache.get.mockResolvedValueOnce("invalid-json");
    expect(await saver.getTuple(cfg)).toBeDefined();
    await age();
    expect(await saver.getTuple(cfg)).toBeUndefined();
    await saver.deleteThread("run-1");
    expect(await saver.getTuple(cfg)).toBeUndefined();
  });

  it.runIf(Boolean(redisUrl))(
    "hydrates real Redis from PostgreSQL after cache expiry and cannot serve physically deleted checkpoints",
    async () => {
      const cached = createPostgresFrameworkAdapter({
        connectionString: url,
        namespace: scope,
        redis: { url: redisUrl!, ttlMs: 10 },
      });
      extras.push(cached);
      const saved = await append();
      expect(await cached.sessionCheckpoints.get(saved.id)).toMatchObject({
        state,
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(await cached.sessionCheckpoints.get(saved.id)).toMatchObject({
        state,
      });
      await sql`DELETE FROM kortyx_runtime_sessions WHERE scope = ${scope}`;
      expect(await cached.sessionCheckpoints.get(saved.id)).toBeNull();
      const client = createRedisClient({ url: redisUrl! });
      expect(await client.command("PING")).toBe("PONG");
      await client.close?.();
      expect(await client.command("PING")).toBe("PONG");
      await client.close?.();
    },
  );
  it("preserves null writes and serializer round trips", async () => {
    const cfg = await adapter.checkpointer.put(config(), graph(), metadata, {});
    await adapter.checkpointer.putWrites(
      cfg,
      [
        ["nullable", null],
        ["optional", undefined],
      ],
      "task-null",
    );
    expect((await adapter.checkpointer.getTuple(cfg))?.pendingWrites).toEqual([
      ["task-null", "nullable", null],
      ["task-null", "optional", null],
    ]);
    const [type, bytes] = await adapter.checkpointer.serde.dumpsTyped({
      saved: true,
    });
    expect(await adapter.checkpointer.serde.loadsTyped(type, bytes)).toEqual({
      saved: true,
    });
    expect(
      await adapter.checkpointer.serde.loadsTyped(type, '{"saved":true}'),
    ).toEqual({ saved: true });
  });

  it("bounds cache latency when Redis stops replying", async () => {
    const cache = {
      get: vi.fn(() => new Promise<string | null>(() => {})),
      set: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const store = new PostgresRuntimeStore(url, scope, {}, cache);
    extras.push(store);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const read = store.payload(["timeout"], async () => "postgres-value");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(read).resolves.toBe("postgres-value");
    expect(cache.close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("classifies PostgreSQL read failures as persistence errors", async () => {
    await adapter.close();
    await expect(
      adapter.sessionCheckpoints.get("missing"),
    ).rejects.toHaveProperty("code", "PERSISTENCE_ERROR");
    await expect(adapter.pendingRequests.get("missing")).rejects.toHaveProperty(
      "code",
      "PERSISTENCE_ERROR",
    );
    await expect(
      adapter.checkpointer.getTuple(config()),
    ).rejects.toHaveProperty("code", "PERSISTENCE_ERROR");
    await expect(adapter.maintenance.prune()).rejects.toHaveProperty(
      "code",
      "PERSISTENCE_ERROR",
    );
  });
});
