import { describe, expect, it } from "vitest";
import {
  createInMemoryEvalExecutionStore,
  type EvalExecutionSubmission,
  validateEvalExecutionLimits,
} from "../src/framework/eval-executions";

const limits = {
  maxActiveRuns: 2,
  maxActiveAttempts: 3,
  maxQueuedExecutions: 3,
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
describe("evaluation execution admission and recovery", () => {
  it("restricts retirement to a scoped queue snapshot while retaining atomic capacity", async () => {
    const s = createInMemoryEvalExecutionStore();
    const capacity = {
      ...limits,
      maxActiveAttempts: 1,
      maxQueuedExecutions: 10,
    };
    await s.submit(job("a"), capacity);
    await s.submit(job("b", { scope: "other" }), capacity);
    const selected = await s.queued!("scope");
    expect(selected).toEqual(["a"]);
    await s.submit(job("c"), capacity);
    expect(
      await s.claimQueued!("owner", "scope", capacity, []),
    ).toBeUndefined();
    expect(
      await s.claimQueued!("owner", "other", capacity, selected),
    ).toBeUndefined();
    expect(
      (await s.claimQueued!("owner", "scope", capacity, selected))?.id,
    ).toBe("a");
    expect(
      await s.claimQueued!("other", "scope", capacity, ["c"]),
    ).toBeUndefined();
    await s.finish("a", "owner", "completed");
    expect(
      await s.claimQueued!("owner", "scope", capacity, selected),
    ).toBeUndefined();
    expect((await s.claim("new", "scope", capacity))?.id).toBe("c");
    expect((await s.status("b"))?.state).toBe("queued");
  });
  it("deduplicates, fences request identity and isolates returned records", async () => {
    const store = createInMemoryEvalExecutionStore();
    expect(await store.generation()).not.toBe(
      await createInMemoryEvalExecutionStore().generation(),
    );
    const a = await store.submit(job(), limits);
    a.payload.id = "changed";
    expect((await store.get("a"))?.payload.id).toBe("a");
    expect(await store.submit(job(), limits)).toEqual(await store.get("a"));
    await expect(
      store.submit(job("a", { fingerprint: "other" }), limits),
    ).rejects.toMatchObject({ code: "EVAL_EXECUTION_CONFLICT" });
    expect(await store.get("missing")).toBeUndefined();
    expect(await store.status("missing")).toBeUndefined();
    expect(await store.status("a")).toEqual({ state: "queued", sequence: 0 });
    expect(await store.events("missing", 0)).toEqual([]);
    await store.cancel("missing");
    await expect(store.submit(job("", {}), limits)).rejects.toThrow(
      "identities",
    );
    await expect(store.submit(job("x", { weight: 0 }), limits)).rejects.toThrow(
      "weights",
    );
    await expect(
      store.submit(job("x", { payload: { bad: undefined } }), limits),
    ).rejects.toThrow();
    expect(() =>
      validateEvalExecutionLimits({ ...limits, maxActiveRuns: 0 }),
    ).toThrow();
    expect(() => createInMemoryEvalExecutionStore({ leaseMs: 0 })).toThrow();
  });
  it("shares group, global attempt and active run capacity until cleanup", async () => {
    const s = createInMemoryEvalExecutionStore();
    await s.submit(job("a"), limits);
    await s.submit(job("b"), limits);
    await s.submit(job("c"), limits);
    expect(await s.claim("owner", "wrong", limits)).toBeUndefined();
    expect((await s.claim("owner", "scope", limits))?.id).toBe("a");
    expect((await s.claim("owner", "scope", limits))?.id).toBe("b");
    expect(await s.claim("owner", "scope", limits)).toBeUndefined();
    await expect(
      s.submit(job("d", { concurrency: 3 }), limits),
    ).rejects.toMatchObject({ code: "EVAL_CONCURRENCY_CHANGED" });
    await expect(
      s.submit(
        job("d", { queued: false, group: "different", weight: 2 }),
        limits,
      ),
    ).rejects.toMatchObject({ code: "EVAL_EXECUTOR_BUSY" });
    await expect(
      s.submit(job("d", { weight: 4, concurrency: 4 }), limits),
    ).rejects.toMatchObject({ code: "EVAL_CONCURRENCY_UNSUPPORTED" });
    await s.cancel("a");
    expect((await s.heartbeat("a", "owner"))?.cancelRequested).toBe(true);
    expect(await s.claim("owner", "scope", limits)).toBeUndefined();
    await s.finish("a", "owner", "cancelled");
    await s.cancel("a");
    expect((await s.claim("owner", "scope", limits))?.id).toBe("c");
    const two = { ...limits, maxActiveRuns: 1 };
    await s.submit(job("d", { group: "other" }), two);
    expect(await s.claim("owner", "scope", two)).toBeUndefined();
  });
  it("reserves legacy admission immediately and bounds waiting admissions", async () => {
    const s = createInMemoryEvalExecutionStore();
    const l = { ...limits, maxActiveAttempts: 1, maxQueuedExecutions: 2 };
    await s.submit(job("a", { queued: false }), l);
    await expect(
      s.submit(job("b", { queued: false }), l),
    ).rejects.toMatchObject({ code: "EVAL_EXECUTOR_BUSY" });
    await s.submit(job("b"), l);
    await expect(s.submit(job("c"), l)).rejects.toMatchObject({
      code: "EVAL_EXECUTOR_BUSY",
    });
    await s.cancel("a");
    await s.cancel("a");
    expect((await s.get("a"))?.state).toBe("cancelled");
    expect((await s.claim("owner", "scope", l))?.id).toBe("b");
  });
  it("replays ordered evidence without exposing mutable references and fences owners", async () => {
    const s = createInMemoryEvalExecutionStore();
    await s.submit(job(), limits);
    await s.claim("owner", "scope", limits);
    await expect(s.append("a", "wrong", { x: 1 })).rejects.toMatchObject({
      code: "EVAL_EXECUTION_LEASE_LOST",
    });
    await expect(s.heartbeat("missing", "owner")).rejects.toThrow("lease");
    await s.append("a", "owner", { type: "progress", value: 1 });
    await s.append("a", "owner", { type: "result", value: 2 });
    const events = await s.events("a", 1);
    expect(events).toEqual([
      { sequence: 2, event: { type: "result", value: 2 } },
    ]);
    events[0]!.event.value = 3;
    expect((await s.events("a", 1))[0]?.event.value).toBe(2);
    await s.finish("a", "owner", "completed");
    await s.cancel("a");
    await expect(s.finish("a", "owner", "completed")).rejects.toThrow("lease");
  });
  it("marks lost execution ownership unknown without replay, retaining capacity until explicit cancellation", async () => {
    let now = 0;
    const s = createInMemoryEvalExecutionStore({ now: () => now, leaseMs: 10 });
    const l = { ...limits, maxActiveAttempts: 1 };
    await s.submit(job(), l);
    await s.claim("owner", "scope", l);
    now = 5;
    await s.heartbeat("a", "owner");
    now = 14;
    expect((await s.get("a"))?.state).toBe("running");
    now = 15;
    expect((await s.get("a"))?.state).toBe("unknown");
    expect((await s.events("a", 0))[0]?.event).toMatchObject({
      failure: { code: "EVAL_EXECUTION_UNKNOWN" },
    });
    await s.submit(job("b"), l);
    expect(await s.claim("new", "scope", l)).toBeUndefined();
    await expect(s.append("a", "owner", {})).rejects.toThrow("lease");
    await s.cancel("a");
    expect((await s.claim("new", "scope", l))?.id).toBe("b");
  });
  it("expires waiting jobs and retains deduplication for the entire admission replay window", async () => {
    let now = 0;
    const s = createInMemoryEvalExecutionStore({
      now: () => now,
      retentionMs: 1,
      queueTimeoutMs: 10,
    });
    await s.submit(job(), limits);
    now = 10;
    expect((await s.get("a"))?.state).toBe("cancelled");
    expect((await s.events("a", 0))[0]?.event).toMatchObject({
      failure: { code: "EVAL_EXECUTION_EXPIRED" },
    });
    now = 86_700_009;
    expect(await s.get("a")).toBeDefined();
    now = 86_700_010;
    expect(await s.get("a")).toBeUndefined();
    expect(await s.events("a", 0)).toEqual([]);
  });
  it("bounds request and evidence bytes but always retains a safe terminal failure", async () => {
    const s = createInMemoryEvalExecutionStore({
      maxJobBytes: 30,
      maxBytes: 50,
    });
    await expect(
      s.submit(job("x", { payload: { long: "x".repeat(31) } }), limits),
    ).rejects.toMatchObject({ code: "EVAL_EVIDENCE_LIMIT" });
    await s.submit(job(), limits);
    await s.claim("owner", "scope", limits);
    await expect(
      s.append("a", "owner", { long: "x".repeat(31) }),
    ).rejects.toMatchObject({ code: "EVAL_EVIDENCE_LIMIT" });
    await s.append("a", "owner", { type: "error", message: "safe" });
    await s.finish("a", "owner", "completed");
    await expect(
      s.submit(job("x", { payload: { long: "x".repeat(15) } }), limits),
    ).rejects.toMatchObject({ code: "EVAL_EXECUTOR_BUSY" });
    const g = createInMemoryEvalExecutionStore({
      maxJobBytes: 1000,
      maxBytes: 20,
    });
    await g.submit(job(), limits);
    await g.claim("owner", "scope", limits);
    await expect(
      g.append("a", "owner", { long: "x".repeat(11) }),
    ).rejects.toMatchObject({ code: "EVAL_EVIDENCE_LIMIT" });
    const e = createInMemoryEvalExecutionStore({
      maxBytes: 1_000_000,
      maxJobBytes: 1_000_000,
    });
    await e.submit(job(), limits);
    await e.claim("owner", "scope", limits);
    for (let i = 0; i < 10_000; i++) await e.append("a", "owner", {});
    await expect(e.append("a", "owner", {})).rejects.toMatchObject({
      code: "EVAL_EVIDENCE_LIMIT",
    });
  });
});

it("derives renewal cadence from the configured lease", () => {
  expect(
    createInMemoryEvalExecutionStore({ leaseMs: 3000 }).heartbeatIntervalMs,
  ).toBe(1000);
  expect(
    createInMemoryEvalExecutionStore({ leaseMs: 1 }).heartbeatIntervalMs,
  ).toBe(1);
});
