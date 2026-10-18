import { randomUUID } from "node:crypto";
import { createInMemoryEvalExecutionStore } from "@kortyx/runtime";
import { describe, expect, it, vi } from "vitest";
import {
  createEvalRouteHandler,
  createEvals,
  type EvalSuite,
  getEvalSuiteRevision,
} from "../src/evals/index";

const key = "eval-job-test-secret-service-key";
const suite: EvalSuite = {
  id: "test",
  cases: [
    { id: "one", steps: [{ message: "hello", expect: { type: "answer" } }] },
  ],
};
const body = {
  suiteId: suite.id,
  suiteRevision: getEvalSuiteRevision(suite),
  repetitions: 1,
  concurrency: 1,
};
const fixture = async (
  extra: Partial<Parameters<typeof createEvalRouteHandler>[0]> = {},
) => {
  const run = vi.fn(async () =>
    createEvals({
      agent: { streamChat: vi.fn() },
      suites: [suite],
      execute: () => ({
        observation: { type: "answer", text: "hi", structured: [] },
      }),
    }).run({ suiteId: suite.id }),
  );
  const handler = createEvalRouteHandler({
    serviceKey: key,
    evals: {
      describe: () => ({
        schemaVersion: 1,
        suites: [suite],
        responders: [],
        references: [],
      }),
      run,
    },
    ...extra,
  });
  const discovery = await handler(
    new Request("http://localhost/evals", {
      headers: { authorization: `Bearer ${key}` },
    }),
  );
  const headers = {
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    "x-kortyx-eval-protocol": "jobs-v1",
    "x-kortyx-eval-generation": discovery.headers.get(
      "x-kortyx-eval-generation",
    )!,
    "idempotency-key": randomUUID() as string,
    "x-kortyx-eval-submitted-at": new Date().toISOString(),
  };
  const post = (overrides: Record<string, string> = {}, data: unknown = body) =>
    handler(
      new Request("http://localhost/evals", {
        method: "POST",
        headers: { ...headers, ...overrides },
        body: JSON.stringify(data),
      }),
    );
  const observe = (
    after = "0",
    method = "GET",
    overrides: Record<string, string> = {},
  ) =>
    handler(
      new Request(
        `http://localhost/evals?executionId=${headers["idempotency-key"]}&after=${after}`,
        { method, headers: { ...headers, ...overrides } },
      ),
    );
  return { handler, run, headers, post, observe };
};
describe("detached consumer evaluation jobs", () => {
  it("deduplicates admission and replays the same execution after observer cancellation", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(async () => {
      await wait;
      return createEvals({
        agent: { streamChat: vi.fn() },
        suites: [suite],
        execute: () => ({
          observation: { type: "answer", text: "hi", structured: [] },
        }),
      }).run({ suiteId: suite.id });
    });
    const f = await fixture({
      evals: {
        describe: () => ({
          schemaVersion: 1,
          suites: [suite],
          responders: [],
          references: [],
        }),
        run: execute,
      },
    });
    try {
      const response = await f.post();
      await response.body?.cancel();
      expect(execute).toHaveBeenCalledTimes(1);
      const duplicate = await f.post(
        {},
        {
          concurrency: 1,
          repetitions: 1,
          suiteRevision: body.suiteRevision,
          suiteId: body.suiteId,
        },
      );
      release();
      const text = await duplicate.text();
      expect(text).toContain('"result"');
      expect(execute).toHaveBeenCalledTimes(1);
      expect((await f.observe()).status).toBe(200);
      const replay = await f.observe();
      const events = (await replay.text())
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s));
      expect(events.filter((e) => e.type === "result")).toHaveLength(1);
      expect(events.find((e) => e.type === "result").sequence).toBe(1);
      expect((await f.post({}, { ...body, caseIds: ["one"] })).status).toBe(
        409,
      );
    } finally {
      release();
      await f.handler.close();
    }
  });
  it("authenticates observations and explicit cancellation without leaking other scopes", async () => {
    const f = await fixture();
    try {
      await (await f.post()).text();
      expect(
        (await f.observe("0", "GET", { authorization: "Bearer wrong" })).status,
      ).toBe(401);
      expect((await f.observe("0", "DELETE")).status).toBe(200);
      expect((await f.observe("0", "PATCH")).status).toBe(405);
      const other = await fixture();
      try {
        other.headers["idempotency-key"] = f.headers["idempotency-key"];
        expect((await other.observe()).status).toBe(410);
        expect((await other.observe("0", "DELETE")).status).toBe(404);
      } finally {
        await other.handler.close();
      }
    } finally {
      await f.handler.close();
    }
  });
  it("fences storage restarts, expired admissions, invalid identities and observation cursors", async () => {
    const f = await fixture();
    try {
      expect(
        (await f.post({ "x-kortyx-eval-generation": randomUUID() })).status,
      ).toBe(409);
      expect(
        (
          await f.observe("0", "GET", {
            "x-kortyx-eval-generation": randomUUID(),
          })
        ).status,
      ).toBe(409);
      expect(
        (await f.post({ "x-kortyx-eval-submitted-at": "invalid" })).status,
      ).toBe(410);
      expect(
        (
          await f.post({
            "x-kortyx-eval-submitted-at": new Date(0).toISOString(),
          })
        ).status,
      ).toBe(410);
      expect((await f.post({ "idempotency-key": "invalid" })).status).toBe(400);
      f.headers["idempotency-key"] = "invalid";
      expect((await f.observe()).status).toBe(400);
      f.headers["idempotency-key"] = randomUUID();
      expect((await f.observe("-1")).status).toBe(400);
      await (await f.post()).text();
      expect((await f.observe("100")).status).toBe(409);
    } finally {
      await f.handler.close();
    }
  });
  it("honors explicit cancellation and holds capacity until cleanup", async () => {
    let cleaned = false;
    let started!: () => void;
    const begins = new Promise<void>((resolve) => {
      started = resolve;
    });
    const evals = createEvals({
      agent: { streamChat: vi.fn() },
      suites: [suite],
      execute: async (context) => {
        started();
        await new Promise<void>((resolve) =>
          context.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        );
        return { observation: { type: "answer", text: "hi", structured: [] } };
      },
      teardown: () => {
        cleaned = true;
      },
    });
    const f = await fixture({ evals });
    try {
      const first = await f.post();
      await begins;
      expect((await f.observe("0", "DELETE")).status).toBe(200);
      const frames = await first.text();
      expect(cleaned).toBe(true);
      expect(frames).toContain("cancelled");
    } finally {
      await f.handler.close();
    }
  });
  it("queues independent jobs and uses Retry-After only for refused admission", async () => {
    const store = createInMemoryEvalExecutionStore();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = vi.fn(async () => {
      await wait;
      return createEvals({
        agent: { streamChat: vi.fn() },
        suites: [suite],
        execute: () => ({
          observation: { type: "answer", text: "hi", structured: [] },
        }),
      }).run({ suiteId: suite.id });
    });
    const f = await fixture({
      executionStore: store,
      maxActiveRuns: 1,
      maxActiveAttempts: 1,
      maxQueuedExecutions: 1,
      evals: {
        describe: () => ({
          schemaVersion: 1,
          suites: [suite],
          responders: [],
          references: [],
        }),
        run,
      },
    });
    try {
      const first = await f.post();
      const second = await f.post({
        "idempotency-key": randomUUID() as string,
      });
      const busy = await f.post({ "idempotency-key": randomUUID() as string });
      expect(busy.status).toBe(503);
      expect(busy.headers.get("retry-after")).toBe("2");
      expect(await busy.json()).toMatchObject({ accepted: false });
      await first.body?.cancel();
      await second.body?.cancel();
      release();
    } finally {
      release();
      await f.handler.close();
    }
  });
  it("retains safe reporting failures and tolerates host lifecycle hook errors", async () => {
    const f = await fixture({
      evals: {
        describe: () => ({
          schemaVersion: 1,
          suites: [suite],
          responders: [],
          references: [],
        }),
        run: async () => {
          throw new Error("Reporting failed. Authorization: Bearer private");
        },
      },
      onExecution: () => {
        throw new Error("host hook");
      },
    });
    try {
      const text = await (await f.post()).text();
      expect(text).toContain('"error"');
      expect(text).not.toContain("private");
    } finally {
      await f.handler.close();
    }
  });
});

describe("execution owner fencing and transport faults", () => {
  it.each([
    "missing",
    "rejected",
    "cancelled",
    "pending",
    "healthy",
  ] as const)("handles %s heartbeat without replaying a running attempt", async (mode) => {
    vi.useFakeTimers();
    const store = createInMemoryEvalExecutionStore();
    let reject!: () => void;
    const waiting = new Promise<undefined>((resolve) => {
      reject = () => resolve(undefined);
    });
    const heartbeat = vi.spyOn(store, "heartbeat");
    if (mode === "missing") heartbeat.mockResolvedValue(undefined);
    if (mode === "rejected")
      heartbeat.mockRejectedValue(
        new Error("Reporting failed. Authorization: Bearer private"),
      );
    if (mode === "cancelled")
      heartbeat.mockImplementation(async (id, owner) => {
        await store.cancel(id);
        return { ...(await store.get(id))!, leaseOwner: owner };
      });
    if (mode === "pending") heartbeat.mockReturnValue(waiting);
    const run = vi.fn(async ({ signal }: { signal?: AbortSignal }) => {
      await new Promise<void>((resolve) =>
        signal?.addEventListener("abort", () => resolve(), { once: true }),
      );
      throw new Error("Reporting failed. Authorization: Bearer private");
    });
    const f = await fixture({
      executionStore: store,
      evals: {
        describe: () => ({
          schemaVersion: 1,
          suites: [suite],
          responders: [],
          references: [],
        }),
        run,
      },
    });
    try {
      const response = await f.post();
      await response.body?.cancel();
      await vi.advanceTimersByTimeAsync(4100);
      if (mode === "pending") reject();
      await vi.advanceTimersByTimeAsync(1);
      expect(run).toHaveBeenCalledTimes(1);
      expect(heartbeat).toHaveBeenCalled();
    } finally {
      reject();
      await f.handler.close();
      vi.useRealTimers();
    }
  });
  it("aborts the execution deadline and host shutdown cooperatively", async () => {
    vi.useFakeTimers();
    const timers = vi.spyOn(globalThis, "setTimeout");
    const f = await fixture({
      evals: {
        describe: () => ({
          schemaVersion: 1,
          suites: [suite],
          responders: [],
          references: [],
        }),
        run: async ({ signal }) => {
          await new Promise<void>((resolve) =>
            signal?.addEventListener("abort", () => resolve(), { once: true }),
          );
          throw new Error("Reporting failed. Authorization: Bearer private");
        },
      },
    });
    try {
      await (await f.post()).body?.cancel();
      const deadline = timers.mock.calls.find(
        ([, ms]) => ms === 30 * 60_000,
      )?.[0];
      expect(deadline).toBeTypeOf("function");
      deadline?.();
      await vi.advanceTimersByTimeAsync(100);
      expect(await (await f.observe()).text()).toContain('"error"');
    } finally {
      await f.handler.close();
      timers.mockRestore();
      vi.useRealTimers();
    }
  });
  it("rejects a queued suite that changed while waiting for capacity", async () => {
    const store = createInMemoryEvalExecutionStore();
    let suites = [suite];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = vi.fn(async () => {
      await gate;
      return createEvals({
        agent: { streamChat: vi.fn() },
        suites: [suite],
        execute: () => ({
          observation: { type: "answer", text: "hi", structured: [] },
        }),
      }).run({ suiteId: suite.id });
    });
    const f = await fixture({
      executionStore: store,
      maxActiveRuns: 1,
      evals: {
        describe: () => ({
          schemaVersion: 1,
          suites,
          responders: [],
          references: [],
        }),
        run,
      },
    });
    try {
      const first = await f.post();
      const queued = await f.post({
        "idempotency-key": randomUUID() as string,
      });
      suites = [];
      release();
      await first.text();
      expect(await queued.text()).toContain("EVAL_CONTRACT_CHANGED");
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await f.handler.close();
    }
  });
  it("returns a safe response when observation storage fails and rejects an expired observation stream", async () => {
    const store = createInMemoryEvalExecutionStore();
    const f = await fixture({ executionStore: store });
    try {
      await (await f.post()).text();
      const original = store.status.bind(store);
      vi.spyOn(store, "status").mockRejectedValueOnce(
        new Error("Reporting failed. Authorization: Bearer private"),
      );
      const error = await f.observe();
      expect(error.status).toBe(503);
      expect(await error.text()).not.toContain("private");
      vi.mocked(store.status)
        .mockImplementationOnce(original)
        .mockResolvedValueOnce(undefined);
      const response = await f.observe();
      await expect(response.text()).rejects.toThrow("expired");
    } finally {
      await f.handler.close();
    }
  });
});

it("waits for a competing claim loop before admitting a legacy request", async () => {
  const store = createInMemoryEvalExecutionStore();
  const original = store.claim.bind(store);
  let release!: (value: undefined) => void;
  const blocked = new Promise<undefined>((resolve) => {
    release = resolve;
  });
  vi.spyOn(store, "claim")
    .mockReturnValueOnce(blocked)
    .mockImplementation(original);
  const f = await fixture({ executionStore: store });
  try {
    const pending = f.post({ "x-kortyx-eval-protocol": "" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    release(undefined);
    expect(await (await pending).text()).toContain('"result"');
  } finally {
    release(undefined);
    await f.handler.close();
  }
});
it("handles aborts during observation and prevents further event delivery", async () => {
  const { createEvalExecutionTransport } = await import(
    "../src/evals/route-executions"
  );
  const store = createInMemoryEvalExecutionStore();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const run = vi.fn(async () => {
    await held;
    return createEvals({
      agent: { streamChat: vi.fn() },
      suites: [suite],
      execute: () => ({
        observation: { type: "answer", text: "hi", structured: [] },
      }),
    }).run({ suiteId: suite.id });
  });
  const transport = createEvalExecutionTransport({
    store,
    scope: "scope",
    limits: { maxActiveRuns: 1, maxActiveAttempts: 1, maxQueuedExecutions: 10 },
    evals: {
      describe: () => ({
        schemaVersion: 1,
        suites: [suite],
        responders: [],
        references: [],
      }),
      run,
    },
  });
  const headers = {
    authorization: `Bearer ${key}`,
    "idempotency-key": randomUUID() as string,
    "x-kortyx-eval-protocol": "jobs-v1",
    "x-kortyx-eval-generation": await store.generation(),
    "x-kortyx-eval-submitted-at": new Date().toISOString(),
  };
  try {
    const signal = new AbortController();
    signal.abort();
    const response = await transport.submit(
      new Request("http://localhost/evals", {
        method: "POST",
        headers,
        signal: signal.signal,
      }),
      body,
    );
    expect(await response.text()).toBe("");
    const queuedSignal = new AbortController();
    const originalEvents = store.events.bind(store);
    vi.spyOn(store, "events").mockImplementationOnce(async (id, after) => {
      const events = await originalEvents(id, after);
      queuedSignal.abort();
      return events;
    });
    const queued = await transport.existing(
      new Request(
        `http://localhost/evals?executionId=${headers["idempotency-key"]}`,
        { headers, signal: queuedSignal.signal },
      ),
    );
    expect(await queued!.text()).not.toContain("result");
    release();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const observeSignal = new AbortController();
    const original = store.events.bind(store);
    vi.spyOn(store, "events").mockImplementationOnce(async (id, after) => {
      const result = await original(id, after);
      observeSignal.abort();
      return result;
    });
    const observing = await transport.existing(
      new Request(
        `http://localhost/evals?executionId=${headers["idempotency-key"]}`,
        { headers, signal: observeSignal.signal },
      ),
    );
    expect(await observing!.text()).not.toContain('"result"');
    const missingAfter = await transport.existing(
      new Request(
        `http://localhost/evals?executionId=${headers["idempotency-key"]}`,
        { headers },
      ),
    );
    expect(await missingAfter!.text()).toContain('"result"');
  } finally {
    release();
    await transport.close();
  }
});

it("does not leak a cancellation storage fault after a legacy observer disconnects", async () => {
  const store = createInMemoryEvalExecutionStore();
  vi.spyOn(store, "cancel").mockRejectedValue(
    new Error("private cancellation"),
  );
  const f = await fixture({ executionStore: store });
  try {
    const response = await f.post({ "x-kortyx-eval-protocol": "" });
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 1));
  } finally {
    await f.handler.close();
  }
});

it("refuses new admission while the host is draining", async () => {
  const f = await fixture();
  await f.handler.close();
  const response = await f.post();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ accepted: false });
});

it.each([
  false,
  true,
])("cancels a legacy admission aborted before its competing claim completes (storage failure: %s)", async (fails) => {
  const store = createInMemoryEvalExecutionStore();
  const claim = store.claim.bind(store);
  let release!: (value: undefined) => void;
  const blocked = new Promise<undefined>((resolve) => {
    release = resolve;
  });
  vi.spyOn(store, "claim")
    .mockReturnValueOnce(blocked)
    .mockImplementation(claim);
  if (fails)
    vi.spyOn(store, "cancel").mockRejectedValue(
      new Error("Reporting failed. Authorization: Bearer private"),
    );
  let accepted!: () => void;
  const admission = new Promise<void>((resolve) => {
    accepted = resolve;
  });
  const submit = store.submit.bind(store);
  vi.spyOn(store, "submit").mockImplementation(async (...args) => {
    const result = await submit(...args);
    accepted();
    return result;
  });
  const f = await fixture({ executionStore: store });
  const controller = new AbortController();
  try {
    const pending = f.handler(
      new Request("http://localhost/evals", {
        method: "POST",
        headers: { ...f.headers, "x-kortyx-eval-protocol": "" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
    );
    await admission;
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(f.run).not.toHaveBeenCalled();
  } finally {
    release(undefined);
    await f.handler.close();
  }
});

it.each([
  0,
  Number.NaN,
])("rejects an adapter with an invalid renewal cadence (%s)", async (heartbeatIntervalMs) => {
  await expect(
    fixture({
      executionStore: {
        ...createInMemoryEvalExecutionStore(),
        heartbeatIntervalMs,
      },
    }),
  ).rejects.toThrow("limits");
});

it("renews a configured shorter lease while a conversation remains active", async () => {
  vi.useFakeTimers();
  const store = createInMemoryEvalExecutionStore({ leaseMs: 3000 });
  const renewal = vi.spyOn(store, "heartbeat");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = await fixture({
    executionStore: store,
    evals: {
      describe: () => ({
        schemaVersion: 1,
        suites: [suite],
        responders: [],
        references: [],
      }),
      run: async () => {
        await held;
        return createEvals({
          agent: { streamChat: vi.fn() },
          suites: [suite],
          execute: () => ({
            observation: { type: "answer", text: "hi", structured: [] },
          }),
        }).run({ suiteId: suite.id });
      },
    },
  });
  try {
    const response = await f.post();
    await vi.advanceTimersByTimeAsync(5000);
    expect(renewal).toHaveBeenCalledTimes(5);
    expect((await store.status(renewal.mock.calls[0]![0]))?.state).toBe(
      "running",
    );
    release();
    await vi.advanceTimersByTimeAsync(100);
    expect(await response.text()).toContain('"result"');
  } finally {
    release();
    await f.handler.close();
    vi.useRealTimers();
  }
});

it("records explicit cancellation when a custom runner throws AbortError after cleanup", async () => {
  const run = vi.fn(
    ({ signal }: import("../src/evals/types").EvalRunOptions) =>
      new Promise<never>((_resolve, reject) =>
        signal?.addEventListener(
          "abort",
          () =>
            reject(
              new DOMException("private cancellation detail", "AbortError"),
            ),
          { once: true },
        ),
      ),
  );
  const f = await fixture({
    evals: {
      describe: () => ({
        schemaVersion: 1,
        suites: [suite],
        responders: [],
        references: [],
      }),
      run,
    },
  });
  try {
    const response = await f.post();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await f.observe("0", "DELETE");
    const text = await response.text();
    expect(text).toContain("EVAL_EXECUTION_CANCELLED");
    expect(text).not.toContain("private cancellation");
  } finally {
    await f.handler.close();
  }
});
