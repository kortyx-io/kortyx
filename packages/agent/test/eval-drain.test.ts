import { randomUUID } from "node:crypto";
import {
  createInMemoryEvalExecutionStore,
  type EvalExecutionJob,
  type EvalExecutionStore,
} from "@kortyx/runtime";
import { describe, expect, it, vi } from "vitest";
import {
  createEvalRouteHandler,
  createEvals,
  type EvalSuite,
  getEvalSuiteRevision,
} from "../src/evals/index";

const serviceKey = "consumer-retirement-fixture-service-key";
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function fixture(
  store: EvalExecutionStore = createInMemoryEvalExecutionStore({
    leaseMs: 3000,
  }),
) {
  const work = deferred();
  const cleanup = deferred();
  const calls: string[] = [];
  const signals: AbortSignal[] = [];
  const suite: EvalSuite = {
    id: "drain",
    cases: ["one", "two"].map((id) => ({
      id,
      steps: [{ message: id, expect: { type: "answer" as const } }],
    })),
  };
  const handler = createEvalRouteHandler({
    serviceKey,
    executionStore: store,
    maxActiveRuns: 1,
    evals: createEvals({
      agent: {} as never,
      suites: [suite],
      execute: async ({ signal, command }) => {
        calls.push(command.type === "message" ? command.message : "resume");
        signals.push(signal);
        await Promise.race([
          work.promise,
          new Promise<void>((done) => {
            if (signal.aborted) done();
            else signal.addEventListener("abort", () => done(), { once: true });
          }),
        ]);
        return { observation: { type: "answer", text: "ok", structured: [] } };
      },
      teardown: () => cleanup.promise,
    }),
  });
  const headers = {
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
    "x-kortyx-eval-protocol": "jobs-v1",
    "x-kortyx-eval-generation": await store.generation(),
    "x-kortyx-eval-submitted-at": new Date().toISOString(),
  };
  const body = {
    suiteId: suite.id,
    suiteRevision: getEvalSuiteRevision(suite),
    repetitions: 1,
    concurrency: 1,
  };
  const post = (
    id = randomUUID(),
    extra: Record<string, string> = {},
    input = body,
  ) =>
    handler(
      new Request("http://localhost/evals", {
        method: "POST",
        headers: { ...headers, "idempotency-key": id, ...extra },
        body: JSON.stringify(input),
      }),
    );
  const observe = (
    id: string,
    method = "GET",
    extra: Record<string, string> = {},
  ) =>
    handler(
      new Request(`http://localhost/evals?executionId=${id}`, {
        method,
        headers: { ...headers, ...extra },
      }),
    );
  return {
    handler,
    body,
    post,
    observe,
    store,
    work,
    cleanup,
    calls,
    signals,
    release() {
      work.resolve();
      cleanup.resolve();
    },
  };
}

describe("consumer endpoint graceful retirement", () => {
  it("reattaches an accepted POST retry during drain without claiming it was refused", async () => {
    const f = await fixture();
    const id = randomUUID();
    try {
      const first = await f.post(id);
      await vi.waitFor(() => expect(f.calls).toEqual(["one"]));
      const drain = f.handler.drain();
      const duplicate = await f.post(id);
      expect(duplicate.status).toBe(200);
      expect((await f.post(id, {}, { ...f.body, concurrency: 2 })).status).toBe(
        409,
      );
      expect((await f.post()).status).toBe(503);
      f.release();
      await drain;
      expect(await first.text()).toContain('"result"');
      expect(await duplicate.text()).toContain('"result"');
      // Completed identities remain observable even when POST admission is closed.
      expect(await (await f.post(id)).text()).toContain('"result"');
      expect(f.calls).toEqual(["one", "two"]);
    } finally {
      f.release();
      await f.handler.close();
    }
  });

  it("keeps pumping after a synchronous custom-store claim failure", async () => {
    const store = createInMemoryEvalExecutionStore();
    vi.spyOn(store, "claim").mockImplementationOnce(() => {
      throw new Error("Transient synchronous adapter failure");
    });
    const f = await fixture(store);
    try {
      f.release();
      const response = await f.post();
      await vi.waitFor(() => expect(f.calls).toEqual(["one", "two"]));
      expect(await response.text()).toContain('"result"');
      // A recovered pump does not erase the prior ambiguous ownership failure.
      await expect(f.handler.drain()).rejects.toThrow("retirement");
    } finally {
      f.release();
      await f.handler.close();
    }
  });

  it("refuses to acknowledge retirement after an ambiguous claim", async () => {
    const store = createInMemoryEvalExecutionStore();
    vi.spyOn(store, "claim").mockRejectedValueOnce(
      new Error("Claim acknowledgement lost: private store detail"),
    );
    const f = await fixture(store);
    await expect(f.handler.drain()).rejects.toThrow(
      "Consumer evaluation retirement could not be confirmed.",
    );
    expect(f.calls).toHaveLength(0);
    await f.handler.close();
  });

  it("retires an idle endpoint without accepting another request", async () => {
    const f = await fixture();
    await f.handler.drain();
    await f.handler.drain();
    expect((await f.post()).status).toBe(503);
    await f.handler.close();
    await f.handler.drain();
    const closed = await fixture();
    await closed.handler.close();
    await expect(closed.handler.drain()).rejects.toThrow("retirement");
  });

  it("cancels a legacy admission when explicit close races with its acknowledgement", async () => {
    const store = createInMemoryEvalExecutionStore();
    const submit = store.submit.bind(store);
    const commit = deferred(),
      release = deferred();
    let id = "";
    vi.spyOn(store, "submit").mockImplementationOnce(async (...args) => {
      const job = await submit(...args);
      id = job.id;
      commit.resolve();
      await release.promise;
      return job;
    });
    const f = await fixture(store);
    const response = f.post(randomUUID(), { "x-kortyx-eval-protocol": "" });
    await commit.promise;
    const close = f.handler.close();
    release.resolve();
    f.release();
    expect((await response).status).toBe(503);
    await close;
    expect((await store.status(id))?.state).toBe("cancelled");
    expect(f.calls).toHaveLength(0);
  });

  it("cancels a legacy request waiting behind a competing claim on explicit close", async () => {
    const store = createInMemoryEvalExecutionStore();
    const release = deferred<EvalExecutionJob | undefined>();
    vi.spyOn(store, "claim").mockReturnValueOnce(release.promise);
    const f = await fixture(store);
    const queued = vi.spyOn(store, "status");
    const response = f.post(randomUUID(), { "x-kortyx-eval-protocol": "" });
    await vi.waitFor(() => expect(queued).toHaveBeenCalled());
    const close = f.handler.close();
    expect((await response).status).toBe(503);
    release.resolve(undefined);
    f.release();
    await close;
    expect(f.calls).toHaveLength(0);
  });

  it("waits for shared capacity held by another owner without expanding its snapshot", async () => {
    const store = createInMemoryEvalExecutionStore();
    const capacity = {
      maxActiveRuns: 1,
      maxActiveAttempts: 20,
      maxQueuedExecutions: 1000,
    };
    await store.submit(
      {
        id: "external",
        scope: "external",
        fingerprint: "external",
        group: "external",
        concurrency: 1,
        weight: 1,
        payload: {},
        queued: true,
      },
      capacity,
    );
    await store.claim("other", "external", capacity);
    const f = await fixture(store);
    try {
      const response = await f.post();
      const claim = vi.spyOn(store, "claimQueued");
      const drain = f.handler.drain();
      await vi.waitFor(() =>
        expect(claim.mock.calls.length).toBeGreaterThan(1),
      );
      expect(f.calls).toHaveLength(0);
      await store.finish("external", "other", "completed");
      f.release();
      await drain;
      await response.text();
      expect(f.calls).toHaveLength(2);
    } finally {
      f.release();
      await f.handler.close();
    }
  });

  it.each([
    undefined,
    "unknown",
  ])("rejects retirement when queued evidence becomes %s", async (state) => {
    const f = await fixture();
    vi.spyOn(f.store, "queued").mockResolvedValue(["unconfirmed"]);
    vi.spyOn(f.store, "status").mockResolvedValue(
      state ? { state: "unknown", sequence: 0 } : undefined,
    );
    await expect(f.handler.drain()).rejects.toThrow(
      "retirement could not be confirmed",
    );
    await f.handler.close();
  });

  it("refuses an oversized snapshot rather than retaining unbounded job identities", async () => {
    const f = await fixture();
    vi.spyOn(f.store, "queued").mockResolvedValue(
      Array.from({ length: 1001 }, (_, index) => String(index)),
    );
    await expect(f.handler.drain()).rejects.toThrow(
      "retirement could not be confirmed",
    );
    await f.handler.close();
  });

  it("fails closed on an admission committed before its acknowledgement was lost", async () => {
    const store = createInMemoryEvalExecutionStore();
    const submit = store.submit.bind(store);
    vi.spyOn(store, "submit").mockImplementationOnce(async (...args) => {
      await submit(...args);
      throw new Error("private storage credentials");
    });
    const f = await fixture(store);
    try {
      const response = await f.post();
      expect(response.status).toBe(503);
      f.release();
      await expect(f.handler.drain()).rejects.toThrow(
        "retirement could not be confirmed",
      );
      expect(f.calls).toHaveLength(2);
    } finally {
      f.release();
      await f.handler.close();
    }
  });

  it("retains lease-loss uncertainty and safely handles a synchronous renewal fault", async () => {
    const f = await fixture();
    try {
      const response = await f.post();
      vi.spyOn(f.store, "heartbeat").mockImplementation(() => {
        throw new Error("private renewal fault");
      });
      const finish = f.store.finish.bind(f.store);
      vi.spyOn(f.store, "finish").mockImplementation(async (...args) => {
        await finish(...args);
        throw new Error("Unconfirmed terminal ACK");
      });
      const drain = f.handler.drain();
      const rejected = expect(drain).rejects.toThrow(
        "retirement could not be confirmed",
      );
      f.cleanup.resolve();
      await rejected;
      expect(f.signals[0]?.aborted).toBe(true);
      await response.text();
    } finally {
      f.release();
      await f.handler.close();
    }
  });
  it("finishes running and accepted queued suites, retains observation, auth and both wire protocols", async () => {
    const f = await fixture();
    const a = randomUUID(),
      b = randomUUID();
    try {
      const first = await f.post(a);
      await vi.waitFor(() => expect(f.calls).toEqual(["one"]));
      const second = await f.post(b);
      let retired = false;
      const draining = f.handler.drain().then(() => {
        retired = true;
      });
      const declined = await f.post();
      expect(declined.status).toBe(503);
      expect(declined.headers.get("retry-after")).toBe("2");
      expect(await declined.json()).toMatchObject({ accepted: false });
      const legacy = await f.post(randomUUID(), {
        "x-kortyx-eval-protocol": "",
      });
      expect(legacy.status).toBe(429);
      expect(await legacy.json()).toMatchObject({ accepted: false });
      expect(
        (await f.post(randomUUID(), { authorization: "Bearer incorrect" }))
          .status,
      ).toBe(401);
      for (const method of ["GET", "DELETE"])
        expect(
          (await f.observe(a, method, { authorization: "Bearer incorrect" }))
            .status,
        ).toBe(401);
      expect(
        (
          await f.handler(
            new Request("http://localhost/evals", {
              headers: { authorization: `Bearer ${serviceKey}` },
            }),
          )
        ).status,
      ).toBe(200);
      expect(retired).toBe(false);
      expect(f.signals[0]?.aborted).toBe(false);
      f.work.resolve();
      expect(retired).toBe(false);
      f.cleanup.resolve();
      await draining;
      expect(f.calls).toEqual(["one", "two", "one", "two"]);
      expect(await first.text()).toContain('"result"');
      expect(await second.text()).toContain('"result"');
      expect(await (await f.observe(a)).text()).toContain('"result"');
      await f.handler.drain();
      expect((await f.post()).status).toBe(503);
    } finally {
      f.release();
      await f.handler.close();
    }
  });

  it("waits for admission committed before drain but acknowledged afterwards", async () => {
    const store = createInMemoryEvalExecutionStore();
    const submit = store.submit.bind(store);
    const admitted = deferred();
    const commit = deferred();
    vi.spyOn(store, "submit").mockImplementationOnce(async (...args) => {
      const job = await submit(...args);
      commit.resolve();
      await admitted.promise;
      return job;
    });
    const f = await fixture(store);
    const pending = f.post();
    await commit.promise;
    let done = false;
    const drain = f.handler.drain().then(() => {
      done = true;
    });
    try {
      expect(done).toBe(false);
      admitted.resolve();
      f.release();
      expect(await (await pending).text()).toContain('"result"');
      await drain;
      expect(f.calls).toEqual(["one", "two"]);
    } finally {
      admitted.resolve();
      f.release();
      await f.handler.close();
    }
  });

  it("includes a claim returned after retirement started", async () => {
    const f = await fixture();
    const claim = f.store.claim.bind(f.store);
    const claimed = deferred();
    const release = deferred();
    vi.spyOn(f.store, "claim").mockImplementationOnce(async (...args) => {
      const job = await claim(...args);
      claimed.resolve();
      await release.promise;
      return job;
    });
    const response = f.post();
    await claimed.promise;
    const drain = f.handler.drain();
    try {
      expect(f.calls).toHaveLength(0);
      release.resolve();
      await vi.waitFor(() => expect(f.calls).toHaveLength(1));
      expect(f.signals[0]?.aborted).toBe(false);
      f.release();
      await drain;
      expect(await (await response).text()).toContain('"result"');
    } finally {
      release.resolve();
      f.release();
      await f.handler.close();
    }
  });

  it("does not dispatch a late claim when close explicitly aborts retirement", async () => {
    const f = await fixture();
    const claim = f.store.claim.bind(f.store);
    const claimed = deferred(),
      release = deferred();
    vi.spyOn(f.store, "claim").mockImplementationOnce(async (...args) => {
      const job = await claim(...args);
      claimed.resolve();
      await release.promise;
      return job;
    });
    const response = f.post();
    await claimed.promise;
    const drain = f.handler.drain();
    const rejected = expect(drain).rejects.toThrow("retirement");
    const close = f.handler.close();
    release.resolve();
    f.release();
    await close;
    await rejected;
    expect(f.calls).toHaveLength(0);
    await (await response).body?.cancel();
  });

  it("keeps active and queued cancellation available during retirement", async () => {
    const f = await fixture();
    const a = randomUUID(),
      b = randomUUID();
    try {
      const first = await f.post(a),
        second = await f.post(b);
      const drain = f.handler.drain();
      expect((await f.observe(b, "DELETE")).status).toBe(200);
      expect((await f.observe(a, "DELETE")).status).toBe(200);
      f.cleanup.resolve();
      await drain;
      expect(f.signals[0]?.aborted).toBe(true);
      expect(f.calls).toEqual(["one"]);
      expect(await first.text()).toContain("cancelled");
      expect(await second.text()).toContain("cancelled");
    } finally {
      f.release();
      await f.handler.close();
    }
  });

  it("does not claim submissions added by another replica after its queue snapshot", async () => {
    const f = await fixture();
    const submit = vi.spyOn(f.store, "submit");
    const queued = f.store.queued!.bind(f.store);
    const snapshot = deferred();
    vi.spyOn(f.store, "queued").mockImplementationOnce(async (scope) => {
      const ids = await queued(scope);
      snapshot.resolve();
      return ids;
    });
    try {
      const first = await f.post();
      const drain = f.handler.drain();
      await snapshot.promise;
      const input = submit.mock.calls[0]![0];
      await f.store.submit(
        { ...input, id: "later", group: "later" },
        { maxActiveRuns: 1, maxActiveAttempts: 20, maxQueuedExecutions: 1000 },
      );
      f.release();
      await drain;
      expect((await f.store.status("later"))?.state).toBe("queued");
      expect(f.calls).toEqual(["one", "two"]);
      await first.text();
    } finally {
      f.release();
      await f.handler.close();
    }
  });

  it("retains legacy streaming and cooperative cleanup during a graceful drain", async () => {
    const f = await fixture();
    try {
      const response = await f.post(randomUUID(), {
        "x-kortyx-eval-protocol": "",
      });
      const drain = f.handler.drain();
      f.work.resolve();
      expect(f.signals[0]?.aborted).toBe(false);
      f.cleanup.resolve();
      await drain;
      expect(await response.text()).toContain('"result"');
      expect(f.calls).toHaveLength(2);
    } finally {
      f.release();
      await f.handler.close();
    }
  });

  it("preserves explicit close as an abort and rejects an escalated drain", async () => {
    const f = await fixture();
    const response = await f.post();
    const drain = f.handler.drain();
    const rejected = expect(drain).rejects.toThrow("retirement");
    f.cleanup.resolve();
    await f.handler.close();
    await rejected;
    expect(f.signals[0]?.aborted).toBe(true);
    expect(f.calls).toHaveLength(1);
    await response.text();
    await f.handler.close();
  });

  it("requires explicit queue-retirement support from an older custom store", async () => {
    const {
      queued: _queued,
      claimQueued: _claimQueued,
      ...legacy
    } = createInMemoryEvalExecutionStore();
    const f = await fixture(legacy);
    try {
      const response = await f.post();
      await expect(f.handler.drain()).rejects.toThrow("queued and claimQueued");
      expect(f.signals[0]?.aborted).toBe(false);
      f.release();
      await response.text();
    } finally {
      f.release();
      await f.handler.close();
    }
  });

  it.each([
    "reject",
    "no-write",
  ])("refuses successful retirement when terminal persistence is %s", async (mode) => {
    const f = await fixture();
    vi.spyOn(f.store, "finish").mockImplementation(async () => {
      if (mode === "reject") throw new Error("private-storage-credentials");
    });
    try {
      const response = await f.post();
      f.release();
      await expect(f.handler.drain()).rejects.toThrow(
        "retirement could not be confirmed",
      );
      await response.body?.cancel();
    } finally {
      f.release();
      await f.handler.close();
    }
  });

  it("waits for a renewal already in flight after results are committed", async () => {
    const f = await fixture();
    const heartbeat = deferred<EvalExecutionJob | undefined>();
    try {
      const response = await f.post();
      const renew = vi
        .spyOn(f.store, "heartbeat")
        .mockReturnValueOnce(heartbeat.promise);
      await vi.waitFor(() => expect(renew).toHaveBeenCalled(), {
        timeout: 3500,
      });
      let done = false;
      const drain = f.handler.drain().then(() => {
        done = true;
      });
      f.release();
      await response.text();
      expect(done).toBe(false);
      heartbeat.resolve(undefined);
      await drain;
    } finally {
      heartbeat.resolve(undefined);
      f.release();
      await f.handler.close();
    }
  });
});
