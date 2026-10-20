import { randomUUID } from "node:crypto";
import {
  createEvalRouteHandler,
  createEvals,
  getEvalSuiteRevision,
} from "@kortyx/agent";
import type { EvalContext, EvalSuite } from "@kortyx/agent/evals";
import type { TelemetryDb } from "@kortyx/telemetry-db";
import { describe, expect, it, vi } from "vitest";
import {
  createEvalWorker,
  type EvalJobStore,
  type EvalWorkerRun,
} from "../src/evals/worker";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const execute = deferred();
  const cleanup = deferred();
  const persist = deferred();
  const contexts: EvalContext<unknown, unknown>[] = [];
  const signals: AbortSignal[] = [];
  const completed: string[] = [];
  const suite: EvalSuite = {
    id: "drain",
    cases: [0, 1].map((index) => ({
      id: `case-${index}`,
      steps: [{ message: "hello", expect: { type: "answer" as const } }],
    })),
  };
  const handler = createEvalRouteHandler({
    serviceKey: "evaluation-drain-fixture-service-key-only",
    maxActiveRuns: 2,
    evals: createEvals({
      agent: { streamChat: vi.fn() },
      suites: [suite],
      execute: async (context) => {
        contexts.push(context);
        await execute.promise;
        return {
          observation: { type: "answer", text: "answer", structured: [] },
        };
      },
      teardown: async () => {
        await cleanup.promise;
      },
    }),
  });
  const makeRun = () =>
    ({
      id: randomUUID(),
      evaluationId: randomUUID(),
      organizationId: "org",
      projectId: "project",
      environment: "test",
      targetId: "target",
      suiteId: suite.id,
      suiteRevision: getEvalSuiteRevision(suite),
      suite,
      request: {
        suiteId: suite.id,
        suiteRevision: getEvalSuiteRevision(suite),
        concurrency: 1,
        repetitions: 1,
        grading: "app",
      },
    }) as EvalWorkerRun;
  const run = makeRun();
  const queue = [run];
  const owners = new Map<string, string>();
  let cancelled = false;
  const store: EvalJobStore = {
    claim: vi.fn(async (owner) => {
      const claimed = queue.shift();
      if (claimed) owners.set(claimed.id, owner);
      return claimed ? [claimed] : undefined;
    }),
    heartbeat: vi.fn(async (id, owner) => {
      expect(owners.get(id)).toBe(owner);
      return { cancelRequestedAt: cancelled ? new Date() : null };
    }),
    progress: vi.fn(async () => {}),
    finish: vi.fn(async (id) => {
      await persist.promise;
      completed.push(id);
    }),
  };
  const create = () =>
    createEvalWorker({} as TelemetryDb, [], undefined, {
      usage: false,
      store,
      maxConcurrentEvaluations: 1,
      resolveTarget: async () => ({
        id: "target",
        name: "test",
        organizationId: "org",
        projectId: "project",
        environment: "test",
        url: "https://example.test/evals",
        allowInsecureHttp: false,
        serviceKey: "evaluation-drain-fixture-service-key-only",
      }),
      request: async (_target, body, signal) => {
        signals.push(signal);
        signal.addEventListener("abort", () => execute.resolve(), {
          once: true,
        });
        return handler(
          new Request("https://example.test/evals", {
            method: "POST",
            body,
            signal,
            headers: {
              authorization: "Bearer evaluation-drain-fixture-service-key-only",
              "content-type": "application/json",
            },
          }),
        );
      },
    });
  const worker = create();
  return {
    worker,
    create,
    store,
    queue,
    owners,
    run,
    makeRun,
    execute,
    cleanup,
    persist,
    contexts,
    signals,
    completed,
    cancel: () => {
      cancelled = true;
    },
    release: () => {
      execute.resolve();
      cleanup.resolve();
      persist.resolve();
    },
  };
}

describe("evaluation worker admission drain", () => {
  it("waits for an outstanding heartbeat before dependencies can close", async () => {
    const f = fixture();
    const heartbeat = deferred<{ cancelRequestedAt: Date | null }>();
    f.worker.start();
    try {
      await vi.waitFor(() => expect(f.contexts).toHaveLength(1));
      const initial = vi.mocked(f.store.heartbeat).mock.calls.length;
      vi.mocked(f.store.heartbeat).mockImplementationOnce(
        () => heartbeat.promise,
      );
      await vi.waitFor(
        () =>
          expect(
            vi.mocked(f.store.heartbeat).mock.calls.length,
          ).toBeGreaterThan(initial),
        { timeout: 3500 },
      );
      let drained = false;
      const drain = f.worker.drain().then(() => {
        drained = true;
      });
      f.release();
      await vi.waitFor(() => expect(f.completed).toHaveLength(1));
      expect(drained).toBe(false);
      heartbeat.resolve({ cancelRequestedAt: null });
      await drain;
      expect(drained).toBe(true);
    } finally {
      heartbeat.resolve({ cancelRequestedAt: null });
      f.release();
      await f.worker.stop();
    }
  });
  it("keeps leases, all suite attempts, cleanup and terminal persistence alive", async () => {
    const f = fixture();
    f.worker.start();
    try {
      await vi.waitFor(() => expect(f.contexts).toHaveLength(1));
      const initialClaims = vi.mocked(f.store.claim).mock.calls.length;
      let drained = false;
      const drain = f.worker.drain().then(() => {
        drained = true;
      });
      const initialHeartbeats = vi.mocked(f.store.heartbeat).mock.calls.length;
      await vi.waitFor(
        () =>
          expect(
            vi.mocked(f.store.heartbeat).mock.calls.length,
          ).toBeGreaterThan(initialHeartbeats),
        { timeout: 3500 },
      );
      expect(f.signals.every((signal) => !signal.aborted)).toBe(true);
      expect(drained).toBe(false);
      f.execute.resolve();
      expect(drained).toBe(false);
      f.cleanup.resolve();
      await vi.waitFor(() => expect(f.store.finish).toHaveBeenCalledOnce());
      expect(f.contexts).toHaveLength(2);
      expect(drained).toBe(false);
      f.persist.resolve();
      await drain;
      expect(f.completed).toEqual([f.run.id]);
      expect(f.store.finish).toHaveBeenCalledWith(
        f.run.id,
        expect.any(String),
        expect.objectContaining({
          result: expect.objectContaining({
            status: "passed",
            counts: expect.objectContaining({ passed: 2 }),
          }),
        }),
      );
      expect(f.store.claim).toHaveBeenCalledTimes(initialClaims);
      f.worker.start();
      await f.worker.drain();
      expect(f.store.claim).toHaveBeenCalledTimes(initialClaims);
    } finally {
      f.release();
      await f.worker.stop();
    }
  });

  it("completes a lease whose claim resolves after drain starts", async () => {
    const f = fixture();
    const claim = deferred<EvalWorkerRun[]>();
    vi.mocked(f.store.claim).mockImplementationOnce(async (owner) => {
      f.owners.set(f.run.id, owner);
      return claim.promise;
    });
    f.worker.start();
    const drain = f.worker.drain();
    try {
      claim.resolve([f.run]);
      await vi.waitFor(() => expect(f.contexts).toHaveLength(1));
      expect(f.signals[0]?.aborted).toBe(false);
      f.release();
      await drain;
      expect(f.completed).toEqual([f.run.id]);
      expect(f.store.claim).toHaveBeenCalledOnce();
    } finally {
      claim.resolve([f.run]);
      f.release();
      await f.worker.stop();
    }
  });

  it("lets a second owner claim queued work without stealing the draining owner's lease", async () => {
    const f = fixture();
    f.worker.start();
    let next: ReturnType<typeof f.create> | undefined;
    try {
      await vi.waitFor(() => expect(f.contexts).toHaveLength(1));
      const drain = f.worker.drain();
      const oldOwner = f.owners.get(f.run.id);
      const queued = f.makeRun();
      f.queue.push(queued);
      next = f.create();
      next.start();
      await vi.waitFor(() => expect(f.contexts).toHaveLength(2));
      expect(f.owners.get(queued.id)).not.toBe(oldOwner);
      expect(f.owners.get(f.run.id)).toBe(oldOwner);
      f.release();
      await drain;
      await vi.waitFor(() => expect(f.completed).toHaveLength(2));
      expect(new Set(f.completed).size).toBe(2);
      expect(f.contexts).toHaveLength(4);
    } finally {
      f.release();
      await f.worker.stop();
      await next?.stop();
    }
  });

  it("still processes explicit user cancellation during a drain", async () => {
    const f = fixture();
    f.worker.start();
    f.cleanup.resolve();
    f.persist.resolve();
    try {
      await vi.waitFor(() => expect(f.contexts).toHaveLength(1));
      const drain = f.worker.drain();
      f.cancel();
      await vi.waitFor(() => expect(f.signals[0]?.aborted).toBe(true), {
        timeout: 3500,
      });
      await drain;
      expect(f.store.finish).toHaveBeenCalledWith(
        f.run.id,
        expect.any(String),
        expect.objectContaining({ cancelled: true }),
      );
      expect(f.contexts).toHaveLength(1);
    } finally {
      f.release();
      await f.worker.stop();
    }
  });

  it("retains the configured evaluation deadline while draining", async () => {
    const f = fixture();
    f.run.request.runTimeoutMs = 150;
    f.cleanup.resolve();
    f.persist.resolve();
    f.worker.start();
    try {
      await vi.waitFor(() => expect(f.contexts).toHaveLength(1));
      await f.worker.drain();
      expect(f.store.finish).toHaveBeenCalledWith(
        f.run.id,
        expect.any(String),
        expect.objectContaining({
          termination: expect.objectContaining({ code: "EVAL_RUN_TIMEOUT" }),
        }),
      );
      expect(f.contexts).toHaveLength(1);
    } finally {
      f.release();
      await f.worker.stop();
    }
  });

  it("preserves stop as an explicit abort while a drain is pending", async () => {
    const f = fixture();
    f.cleanup.resolve();
    f.persist.resolve();
    f.worker.start();
    try {
      await vi.waitFor(() => expect(f.contexts).toHaveLength(1));
      const drain = expect(f.worker.drain()).rejects.toThrow(
        "explicitly aborted",
      );
      await f.worker.stop();
      await drain;
      expect(f.signals[0]?.aborted).toBe(true);
      expect(f.completed).toHaveLength(0);
    } finally {
      f.release();
      await f.worker.stop();
    }
  });

  it("rejects retirement when a durable completion cannot be confirmed", async () => {
    const f = fixture();
    vi.mocked(f.store.finish).mockRejectedValue(
      new Error("private storage details"),
    );
    f.release();
    f.worker.start();
    try {
      await expect(f.worker.drain()).rejects.toThrow(
        "completion could not be confirmed",
      );
    } finally {
      await f.worker.stop();
    }
  });

  it("rejects an ambiguous in-flight claim rather than reporting successful retirement", async () => {
    const f = fixture();
    const claim = deferred<EvalWorkerRun[]>();
    vi.mocked(f.store.claim).mockImplementationOnce(() => claim.promise);
    f.worker.start();
    const drain = f.worker.drain();
    claim.reject(new Error("private connection details"));
    await expect(drain).rejects.toThrow("claim could not be confirmed");
    await f.worker.stop();
  });

  it("retains an ambiguous claim from before preparation even after polling recovers", async () => {
    const f = fixture();
    vi.mocked(f.store.claim)
      .mockResolvedValue(undefined)
      .mockRejectedValueOnce(new Error("Lost claim acknowledgement"));
    f.worker.start();
    try {
      await vi.waitFor(() =>
        expect(vi.mocked(f.store.claim).mock.calls.length).toBeGreaterThan(1),
      );
      await expect(f.worker.drain()).rejects.toThrow(
        "claim could not be confirmed",
      );
      expect(f.contexts).toHaveLength(0);
    } finally {
      f.release();
      await f.worker.stop();
    }
  });

  it("confirms retirement from durable ownership after a claim acknowledgement failure", async () => {
    const f = fixture();
    const original = new Error("private connection details");
    vi.mocked(f.store.claim)
      .mockRejectedValueOnce(original)
      .mockResolvedValue(undefined);
    f.store.confirmRetirement = vi.fn(async () => true);
    f.worker.start();
    await vi.waitFor(() => expect(f.store.claim).toHaveBeenCalled());
    await f.worker.drain();
    const claims = vi.mocked(f.store.claim).mock.calls.length;
    f.worker.start();
    expect(f.store.confirmRetirement).toHaveBeenCalledWith(expect.any(String));
    expect(f.store.claim).toHaveBeenCalledTimes(claims);
    expect(f.contexts).toHaveLength(0);
    expect(f.worker.isReady()).toBe(false);
    await f.worker.stop();
  });

  it("retries the read-only retirement proof without dispatching or hiding its original cause", async () => {
    const f = fixture();
    const original = new Error("private unconfirmed claim");
    vi.mocked(f.store.claim)
      .mockRejectedValueOnce(original)
      .mockResolvedValue(undefined);
    f.store.confirmRetirement = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    f.worker.start();
    await vi.waitFor(() => expect(f.store.claim).toHaveBeenCalled());
    await expect(f.worker.drain()).rejects.toMatchObject({
      phase: "claim",
      cause: original,
      owner: expect.any(String),
    });
    await f.worker.drain();
    expect(f.store.confirmRetirement).toHaveBeenCalledTimes(2);
    expect(
      new Set(
        vi.mocked(f.store.confirmRetirement).mock.calls.map(([owner]) => owner),
      ).size,
    ).toBe(1);
    expect(f.contexts).toHaveLength(0);
    await f.worker.stop();
  });

  it("retains both causes if retirement verification is unavailable", async () => {
    const f = fixture();
    const original = new Error("private failed claim");
    const unavailable = new Error("private proof query");
    vi.mocked(f.store.claim)
      .mockRejectedValueOnce(original)
      .mockResolvedValue(undefined);
    f.store.confirmRetirement = vi
      .fn()
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce(true);
    f.worker.start();
    await vi.waitFor(() => expect(f.store.claim).toHaveBeenCalled());
    await expect(f.worker.drain()).rejects.toMatchObject({
      phase: "verification",
      cause: expect.objectContaining({
        errors: [expect.objectContaining({ cause: original }), unavailable],
      }),
    });
    await f.worker.drain();
    expect(f.contexts).toHaveLength(0);
    await f.worker.stop();
  });

  it("requires a successful queue check before replacement readiness and recovers after a transient claim error", async () => {
    const f = fixture();
    vi.mocked(f.store.claim)
      .mockRejectedValueOnce(new Error("queue unavailable"))
      .mockResolvedValue(undefined);
    expect(f.worker.isReady()).toBe(false);
    f.worker.start();
    await vi.waitFor(() => expect(f.store.claim).toHaveBeenCalledTimes(1));
    expect(f.worker.isReady()).toBe(false);
    await vi.waitFor(() => expect(f.worker.isReady()).toBe(true));
    f.store.confirmRetirement = async () => true;
    await f.worker.drain();
    expect(f.worker.isReady()).toBe(false);
    await f.worker.stop();
  });

  it("makes drain-before-start terminal and repeatable without queue access", async () => {
    const f = fixture();
    await f.worker.drain();
    f.worker.start();
    await f.worker.drain();
    await f.worker.stop();
    await f.worker.drain(); // A later close does not revoke confirmed retirement.
    expect(f.store.claim).not.toHaveBeenCalled();
  });

  it("does not dispatch a late claim after explicit abort escalates a drain", async () => {
    const f = fixture();
    const claim = deferred<EvalWorkerRun[]>();
    vi.mocked(f.store.claim).mockImplementationOnce(() => claim.promise);
    f.worker.start();
    const drain = expect(f.worker.drain()).rejects.toThrow(
      "explicitly aborted",
    );
    const stop = f.worker.stop();
    claim.resolve([f.run]);
    await stop;
    await drain;
    expect(f.signals).toHaveLength(0);
    expect(f.completed).toHaveLength(0);
  });

  it("retains an honest lost-lease outcome while draining", async () => {
    const f = fixture();
    f.cleanup.resolve();
    f.persist.resolve();
    f.worker.start();
    try {
      await vi.waitFor(() => expect(f.contexts).toHaveLength(1));
      vi.mocked(f.store.heartbeat).mockResolvedValue(undefined);
      const drain = f.worker.drain();
      await vi.waitFor(() => expect(f.signals[0]?.aborted).toBe(true), {
        timeout: 3500,
      });
      await drain;
      expect(f.store.finish).toHaveBeenCalledWith(
        f.run.id,
        expect.any(String),
        expect.objectContaining({
          termination: expect.objectContaining({
            code: "EVAL_LEASE_LOST",
            cleanup: "unknown",
          }),
        }),
      );
      expect(f.contexts).toHaveLength(1);
    } finally {
      f.release();
      await f.worker.stop();
    }
  });
});
