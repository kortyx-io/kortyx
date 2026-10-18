import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import type { EvalExecutionSubmission } from "../src/framework/eval-executions";
import { createPostgresEvalExecutionStore } from "../src/framework/postgres/eval-executions";

const url = process.env.KORTYX_TEST_POSTGRES_URL;
if (!url) throw new Error("A disposable test PostgreSQL database is required.");
const sql = postgres(url, { onnotice: () => {} });
const stores: ReturnType<typeof createPostgresEvalExecutionStore>[] = [];
const make = (
  namespace: string = randomUUID(),
  options: Partial<Parameters<typeof createPostgresEvalExecutionStore>[0]> = {},
) => {
  const s = createPostgresEvalExecutionStore({
    connectionString: url,
    namespace,
    ...options,
  });
  stores.push(s);
  return s;
};
const limits = {
  maxActiveRuns: 2,
  maxActiveAttempts: 2,
  maxQueuedExecutions: 2,
};
const job = (
  id = "a",
  extra: Partial<EvalExecutionSubmission> = {},
): EvalExecutionSubmission => ({
  id,
  scope: "scope",
  fingerprint: id,
  group: "group",
  concurrency: 2,
  weight: 1,
  payload: { id },
  queued: true,
  ...extra,
});
afterAll(async () => {
  await Promise.all(stores.map((s) => s.close()));
  await sql.end();
});
describe("durable evaluation execution admission", () => {
  it("shares a queue snapshot across replicas without claiming later or foreign work", async () => {
    const namespace = randomUUID();
    const a = make(namespace),
      b = make(namespace);
    const capacity = {
      ...limits,
      maxActiveAttempts: 1,
      maxQueuedExecutions: 10,
    };
    await a.submit(job("old"), capacity);
    await b.submit(job("foreign", { scope: "other" }), capacity);
    const selected = await a.queued!("scope");
    expect(selected).toEqual(["old"]);
    await b.submit(job("new"), capacity);
    expect(
      await a.claimQueued!("owner", "scope", capacity, []),
    ).toBeUndefined();
    expect(
      await a.claimQueued!("owner", "other", capacity, selected),
    ).toBeUndefined();
    const claimed = await Promise.all([
      a.claimQueued!("one", "scope", capacity, selected),
      b.claimQueued!("two", "scope", capacity, selected),
    ]);
    expect(claimed.filter(Boolean)).toHaveLength(1);
    const owner = claimed[0] ? "one" : "two";
    expect(
      await b.claimQueued!("new", "scope", capacity, ["new"]),
    ).toBeUndefined();
    await a.finish("old", owner, "completed");
    expect(
      await b.claimQueued!("new", "scope", capacity, selected),
    ).toBeUndefined();
    expect((await b.claim("new", "scope", capacity))?.id).toBe("new");
    expect((await a.status("foreign"))?.state).toBe("queued");
  });
  it("shares stable generation, idempotent admission, ordered cursors and capacity across replicas", async () => {
    const namespace = randomUUID();
    const a = make(namespace),
      b = make(namespace);
    await Promise.all([a.setup(), b.setup()]);
    expect(await a.generation()).toBe(await b.generation());
    expect(await make().generation()).not.toBe(await a.generation());
    const submitted = await Promise.all([
      a.submit(job(), limits),
      b.submit(job(), limits),
    ]);
    expect(submitted[0]).toEqual(submitted[1]);
    await expect(
      b.submit(job("a", { fingerprint: "other" }), limits),
    ).rejects.toMatchObject({ code: "EVAL_EXECUTION_CONFLICT" });
    await a.submit(job("b"), limits);
    const claims = await Promise.all([
      a.claim("one", "scope", limits),
      b.claim("two", "scope", limits),
    ]);
    expect(new Set(claims.map((j) => j?.id)).size).toBe(2);
    await a.submit(job("c"), limits);
    expect(await b.claim("three", "scope", limits)).toBeUndefined();
    await expect(
      a.submit(job("d", { queued: false }), limits),
    ).rejects.toMatchObject({ code: "EVAL_EXECUTOR_BUSY" });
    const first = claims[0]!;
    await a.append(first.id, "one", { type: "progress", value: 1 });
    await b.append(first.id, "one", { type: "result", value: 2 });
    expect(await b.events(first.id, 1)).toEqual([
      { sequence: 2, event: { type: "result", value: 2 } },
    ]);
    await expect(b.append(first.id, "other", {})).rejects.toThrow("lease");
    await a.cancel(first.id);
    expect((await b.heartbeat(first.id, "one"))?.cancelRequested).toBe(true);
    expect(await b.claim("three", "scope", limits)).toBeUndefined();
    await a.finish(first.id, "one", "completed");
    await a.cancel(first.id);
    expect((await b.claim("three", "scope", limits))?.id).toBe("c");
    expect(await a.get("missing")).toBeUndefined();
    expect(await a.status("missing")).toBeUndefined();
    expect(await a.status(first.id)).toEqual({
      state: "completed",
      sequence: 2,
    });
    await a.cancel("missing");
    expect(await a.events("missing", 0)).toEqual([]);
  });
  it("recovers queued work after restart but never replays a lost running execution", async () => {
    const namespace = randomUUID();
    const a = make(namespace);
    await a.submit(job(), limits);
    await a.claim("lost", "scope", limits);
    await a.submit(job("b"), limits);
    await sql`UPDATE kortyx_eval_execution_jobs SET record=jsonb_set(record,'{leaseUntil}','0'::jsonb) WHERE namespace=${namespace} AND id='a'`;
    const b = make(namespace);
    expect((await b.get("a"))?.state).toBe("unknown");
    expect((await b.events("a", 0))[0]?.event).toMatchObject({
      failure: { code: "EVAL_EXECUTION_UNKNOWN" },
    });
    await expect(a.finish("a", "lost", "completed")).rejects.toThrow("lease");
    expect((await b.claim("new", "scope", limits))?.id).toBe("b");
    await b.cancel("a");
    expect((await b.get("a"))?.state).toBe("cancelled");
  });
  it("bounds capacity, queued lifetime and retained evidence", async () => {
    const namespace = randomUUID();
    const a = make(namespace, { maxJobBytes: 40, maxBytes: 60 });
    await expect(
      a.submit(job("big", { payload: { x: "x".repeat(50) } }), limits),
    ).rejects.toMatchObject({ code: "EVAL_EVIDENCE_LIMIT" });
    await a.submit(job(), limits);
    await a.submit(job("b"), limits);
    await expect(a.submit(job("c"), limits)).rejects.toMatchObject({
      code: "EVAL_EXECUTOR_BUSY",
    });
    await expect(
      a.submit(job("c", { weight: 3, concurrency: 3 }), limits),
    ).rejects.toMatchObject({ code: "EVAL_CONCURRENCY_UNSUPPORTED" });
    await a.claim("owner", "scope", limits);
    await expect(
      a.submit(job("c", { concurrency: 3 }), limits),
    ).rejects.toMatchObject({ code: "EVAL_CONCURRENCY_CHANGED" });
    await expect(
      a.append("a", "owner", { x: "x".repeat(41) }),
    ).rejects.toMatchObject({ code: "EVAL_EVIDENCE_LIMIT" });
    await a.append("a", "owner", { type: "error", message: "safe" });
    await a.finish("a", "owner", "cancelled");
    await sql`UPDATE kortyx_eval_execution_jobs SET record=jsonb_set(record,'{expiresAt}','0'::jsonb) WHERE namespace=${namespace} AND id='b'`;
    expect((await a.get("b"))?.state).toBe("cancelled");
    expect((await a.events("b", 0))[0]?.event).toMatchObject({
      failure: { code: "EVAL_EXECUTION_EXPIRED" },
    });
    await a.cancel("b");
    await sql`UPDATE kortyx_eval_execution_jobs SET record=jsonb_set(record,'{expiresAt}','0'::jsonb) WHERE namespace=${namespace}`;
    expect(await a.get("a")).toBeUndefined();
    expect(await a.events("a", 0)).toEqual([]);
    const legacy = make();
    await legacy.submit(job("x", { queued: false }), {
      ...limits,
      maxActiveAttempts: 1,
    });
    await expect(
      legacy.submit(job("y", { queued: false }), {
        ...limits,
        maxActiveAttempts: 1,
      }),
    ).rejects.toMatchObject({ code: "EVAL_EXECUTOR_BUSY" });
    await legacy.cancel("x");
    expect((await legacy.get("x"))?.state).toBe("cancelled");
  });
  it("validates configuration and refuses incompatible migration history", async () => {
    expect(() => make("", {})).toThrow("namespace");
    expect(() => make(randomUUID(), { leaseMs: 0 })).toThrow("limits");
    expect(() =>
      make(randomUUID(), { connectionString: "https://example.test" }),
    ).toThrow("PostgreSQL");
    const a = make();
    await a.setup();
    await expect(a.submit(job(""), limits)).rejects.toThrow("identities");
    await expect(
      a.claim("o", "scope", { ...limits, maxActiveRuns: 0 }),
    ).rejects.toThrow("limits");
    // An isolated schema prevents interference with the existing runtime integration suite.
    const schema = "eval_test_" + randomUUID().replaceAll("-", "");
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    const scoped = new URL(url);
    scoped.searchParams.set("options", `-c search_path=${schema}`);
    const bad = make(randomUUID(), { connectionString: scoped.toString() });
    await sql.unsafe(
      `CREATE TABLE ${schema}.kortyx_eval_execution_migrations(version integer PRIMARY KEY,checksum text NOT NULL)`,
    );
    await sql.unsafe(
      `INSERT INTO ${schema}.kortyx_eval_execution_migrations VALUES(2,'other')`,
    );
    await expect(bad.setup()).rejects.toThrow("incompatible");
    await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  });
});
