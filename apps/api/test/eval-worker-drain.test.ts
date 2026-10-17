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
      const drain = f.worker.drain();
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
    await expect(drain).rejects.toThrow(
      "claim could not be confirmed during drain",
    );
    await f.worker.stop();
  });

  it("makes drain-before-start terminal and repeatable without queue access", async () => {
    const f = fixture();
    await f.worker.drain();
    f.worker.start();
    await f.worker.drain();
    await f.worker.stop();
    expect(f.store.claim).not.toHaveBeenCalled();
  });
});
