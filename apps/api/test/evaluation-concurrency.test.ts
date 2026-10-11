import { randomUUID } from "node:crypto";
import {
  createEvalRouteHandler,
  createEvals,
  getEvalSuiteRevision,
} from "@kortyx/agent";
import type {
  EvalContext,
  EvalProgress,
  EvalRunResult,
  EvalSetupContext,
  EvalSuite,
} from "@kortyx/agent/evals";
import type { TelemetryDb } from "@kortyx/telemetry-db";
import { describe, expect, it, vi } from "vitest";
import {
  createEvalWorker,
  type EvalJobStore,
  type EvalWorkerRun,
} from "../src/evals/worker";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture(
  counts: number[],
  concurrency: number,
  options: {
    execute?: (context: EvalContext<unknown, unknown>) => Promise<void>;
    teardown?: (context: EvalContext<unknown, unknown>) => Promise<void>;
    repetitions?: number;
  } = {},
) {
  const suites: EvalSuite[] = counts.map((count, index) => ({
    id: `suite-${index}`,
    cases: Array.from({ length: count }, (_, index) => ({
      id: `case-${index}`,
      steps: [{ message: "hello", expect: { type: "answer" as const } }],
    })),
  }));
  const serviceKey = "evaluation-concurrency-test-service-key";
  const started: EvalSetupContext<unknown>[] = [];
  const cleaned: EvalContext<unknown, unknown>[] = [];
  let active = 0;
  let peak = 0;
  const handler = createEvalRouteHandler({
    serviceKey,
    evals: createEvals({
      agent: { streamChat: vi.fn() },
      suites,
      setup: (context) => {
        started.push(context);
        active++;
        peak = Math.max(peak, active);
      },
      execute: async (context) => {
        await options.execute?.(context);
        return {
          observation: {
            type: "answer",
            text: context.suiteId,
            structured: [],
          },
        };
      },
      teardown: async (context) => {
        try {
          await options.teardown?.(context);
        } finally {
          cleaned.push(context);
          active--;
        }
      },
    }),
  });
  const evaluationId = randomUUID();
  const runs = suites.map(
    (suite) =>
      ({
        id: randomUUID(),
        evaluationId,
        organizationId: "org",
        projectId: "project",
        environment: "test",
        targetId: "app",
        suite,
        suiteId: suite.id,
        suiteRevision: getEvalSuiteRevision(suite),
        request: {
          suiteId: suite.id,
          suiteRevision: getEvalSuiteRevision(suite),
          concurrency,
          repetitions: options.repetitions ?? 1,
        },
      }) as EvalWorkerRun,
  );
  let cancellation: Date | null = null;
  const cancelledRuns = new Set<string>();
  const finished = new Map<string, Parameters<EvalJobStore["finish"]>[2]>();
  const progress = new Map<string, EvalProgress[]>();
  const done = deferred();
  const store: EvalJobStore = {
    claim: vi.fn().mockResolvedValueOnce(runs).mockResolvedValue(undefined),
    heartbeat: vi.fn(async (id) => ({
      cancelRequestedAt: cancelledRuns.has(id) ? new Date() : cancellation,
    })),
    progress: vi.fn(async (id, _owner, event) => {
      progress.set(id, [...(progress.get(id) ?? []), event]);
    }),
    finish: vi.fn(async (id, _owner, outcome) => {
      finished.set(id, outcome);
      if (finished.size === runs.length) done.resolve();
    }),
  };
  const worker = createEvalWorker({} as TelemetryDb, [], undefined, {
    store,
    resolveTarget: async () => ({
      id: "app",
      name: "App",
      organizationId: "org",
      projectId: "project",
      environment: "test",
      url: "http://localhost/evals",
      serviceKey,
      allowInsecureHttp: true,
    }),
    request: async (_target, body, signal) =>
      handler(
        new Request("http://localhost/evals", {
          method: "POST",
          body,
          signal,
          headers: {
            authorization: `Bearer ${serviceKey}`,
            "content-type": "application/json",
          },
        }),
      ),
  });
  return {
    worker,
    store,
    runs,
    started,
    cleaned,
    finished,
    progress,
    done: done.promise,
    peak: () => peak,
    active: () => active,
    cancel: (id?: string) => {
      if (id) cancelledRuns.add(id);
      else cancellation = new Date();
    },
  };
}

describe("evaluation-wide attempt scheduling through the SDK transport", () => {
  it("fills 20 slots across 10 suites and 69 conversations, retaining slots through cleanup", async () => {
    const execution = deferred();
    const cleanup = deferred();
    let cleaning = 0;
    const f = fixture([6, 6, 6, 6, 6, 6, 6, 6, 6, 15], 20, {
      execute: () => execution.promise,
      teardown: async () => {
        cleaning++;
        await cleanup.promise;
      },
    });
    f.worker.start();
    try {
      await vi.waitFor(() => expect(f.started).toHaveLength(20));
      expect(new Set(f.started.map((context) => context.suiteId)).size).toBe(
        10,
      );
      execution.resolve();
      await vi.waitFor(() => expect(cleaning).toBe(20));
      expect(f.started).toHaveLength(20);
      expect(f.active()).toBe(20);
      cleanup.resolve();
      await f.done;
      expect(f.started).toHaveLength(69);
      expect(f.cleaned).toHaveLength(69);
      expect(f.active()).toBe(0);
      expect(f.peak()).toBe(20);
      expect(new Set(f.started.map((context) => context.sessionId)).size).toBe(
        69,
      );
      for (const run of f.runs) {
        const result = f.finished.get(run.id)?.result as EvalRunResult;
        expect(result.suiteId).toBe(run.suiteId);
        expect(result.counts.passed).toBe(run.suite.cases.length);
        expect(result.cases.map((item) => item.caseId)).toEqual(
          run.suite.cases.map((item) => item.id),
        );
        expect(
          result.cases.every(
            (item) => item.steps[0]?.observation?.text === run.suiteId,
          ),
        ).toBe(true);
        expect(
          f.progress
            .get(run.id)
            ?.filter((event) => event.type === "case-started"),
        ).toHaveLength(run.suite.cases.length);
      }
    } finally {
      execution.resolve();
      cleanup.resolve();
      await f.worker.stop();
    }
  });
  it("preserves repetition identity and completes siblings after execution or cleanup errors", async () => {
    const f = fixture([2, 2], 3, {
      repetitions: 2,
      execute: async (context) => {
        if (context.suiteId === "suite-0" && context.repetition === 2)
          throw new Error("fixture execution");
      },
      teardown: async (context) => {
        if (context.suiteId === "suite-1" && context.case.id === "case-1")
          throw new Error("fixture cleanup");
      },
    });
    f.worker.start();
    try {
      await f.done;
      expect(f.started).toHaveLength(8);
      expect(f.cleaned).toHaveLength(8);
      expect(f.peak()).toBeLessThanOrEqual(3);
      for (const run of f.runs) {
        const result = f.finished.get(run.id)?.result;
        expect(
          result?.cases.map((item) => [item.caseId, item.repetition]),
        ).toEqual([
          ["case-0", 1],
          ["case-0", 2],
          ["case-1", 1],
          ["case-1", 2],
        ]);
        expect(result?.counts).toEqual({
          passed: 2,
          error: 2,
          failed: 0,
          cancelled: 0,
        });
      }
    } finally {
      await f.worker.stop();
    }
  });
  it("drains a cancelled suite's active attempts without stopping its siblings", async () => {
    const execution = deferred();
    const f = fixture([4, 4], 2, { execute: () => execution.promise });
    f.worker.start();
    try {
      await vi.waitFor(() => expect(f.started).toHaveLength(2));
      f.cancel(f.runs[0]!.id);
      await vi.waitFor(
        () => expect(f.store.heartbeat).toHaveBeenCalledTimes(4),
        { timeout: 3000 },
      );
      execution.resolve();
      await f.done;
      expect(f.finished.get(f.runs[0]!.id)?.cancelled).toBe(true);
      expect(f.finished.get(f.runs[1]!.id)?.result?.counts.passed).toBe(4);
      expect(
        f.started.filter((context) => context.suiteId === "suite-0"),
      ).toHaveLength(1);
      expect(f.cleaned).toHaveLength(5);
      expect(f.peak()).toBe(2);
    } finally {
      execution.resolve();
      await f.worker.stop();
    }
  });
  it("does not dispatch or replay attempts after losing an evaluation lease", async () => {
    const f = fixture([3, 3], 2);
    vi.mocked(f.store.heartbeat).mockResolvedValue(undefined);
    f.worker.start();
    try {
      await f.done;
      expect(f.started).toHaveLength(0);
      expect(
        [...f.finished.values()].every((outcome) => Boolean(outcome.error)),
      ).toBe(true);
    } finally {
      await f.worker.stop();
    }
  });
  it("cancels active attempts across suites, stops queued attempts, and runs cleanup", async () => {
    const f = fixture([4, 4], 2, {
      execute: (context) =>
        new Promise<void>((resolve) => {
          context.signal.addEventListener("abort", () => resolve(), {
            once: true,
          });
        }),
      teardown: async (context) => {
        expect(context.signal.aborted).toBe(false);
      },
    });
    f.worker.start();
    try {
      await vi.waitFor(() => expect(f.started).toHaveLength(2));
      f.cancel();
      await f.done;
      await vi.waitFor(() => expect(f.cleaned).toHaveLength(2));
      expect(f.started).toHaveLength(2);
      expect(f.active()).toBe(0);
      expect(
        [...f.finished.values()].every((outcome) => outcome.cancelled),
      ).toBe(true);
    } finally {
      await f.worker.stop();
    }
  });
});
