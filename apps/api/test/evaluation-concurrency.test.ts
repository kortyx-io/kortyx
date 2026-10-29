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
  type EvalWorkerOptions,
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
    native?: boolean;
    intercept?: (body: Record<string, unknown>) => Response | undefined;
    reportError?: EvalWorkerOptions["reportError"];
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
  const workerOptions: EvalWorkerOptions = {
    store,
    ...(options.reportError ? { reportError: options.reportError } : {}),
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
    ...(options.native
      ? {
          fetch: (async (url, init) => {
            if (init?.method === "POST" && options.intercept) {
              const rejected = options.intercept(JSON.parse(String(init.body)));
              if (rejected) return rejected;
            }
            return handler(new Request(url, init));
          }) as typeof fetch,
          dispatch: { maxRetries: 0 },
        }
      : {
          request: async (
            _target: unknown,
            body: string,
            signal: AbortSignal,
          ) =>
            options.intercept?.(JSON.parse(body)) ??
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
        }),
  };
  const worker = createEvalWorker(
    {} as TelemetryDb,
    [],
    undefined,
    workerOptions,
  );
  return {
    worker,
    createWorker: () =>
      createEvalWorker({} as TelemetryDb, [], undefined, workerOptions),
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
  it("retains paid runtime associations in the final error when a consumer stream disconnects", async () => {
    const attemptId = randomUUID();
    const execution = { sessionId: "runtime-session", runId: "runtime-run" };
    const f = fixture([1], 1, {
      intercept: () =>
        new Response(
          [
            {
              type: "progress",
              event: {
                type: "case-started",
                caseId: "case-0",
                repetition: 1,
                sessionId: "session",
                attemptId,
              },
            },
            ...[execution, execution].map((execution) => ({
              type: "progress",
              event: {
                type: "case-runtime-associated",
                caseId: "case-0",
                repetition: 1,
                attemptId,
                execution,
              },
            })),
          ]
            .map((event) => JSON.stringify(event))
            .join("\n") + "\n",
          {
            headers: { "content-type": "application/x-ndjson" },
          },
        ),
    });
    f.worker.start();
    try {
      await f.done;
      const result = f.finished.get(f.runs[0]!.id)?.result;
      expect(result?.counts.error).toBe(1);
      expect(result?.cases[0]).toMatchObject({
        attemptId,
        sessionId: "session",
        runtimeExecutions: [execution],
        status: "error",
      });
    } finally {
      await f.worker.stop();
    }
  });
  it("isolates a refused attempt and preserves passing siblings across and within suites", async () => {
    const f = fixture([3, 3], 2, {
      native: true,
      intercept: (body) =>
        body.suiteId === "suite-0" &&
        (body.attempt as { caseId?: string })?.caseId === "case-0"
          ? new Response("private upstream text", {
              status: 503,
              headers: { "retry-after": "0" },
            })
          : undefined,
    });
    f.worker.start();
    try {
      await f.done;
      const first = f.finished.get(f.runs[0]!.id)?.result;
      expect(first?.counts).toEqual({
        passed: 2,
        failed: 0,
        error: 1,
        cancelled: 0,
      });
      expect(first?.cases[0]?.errors[0]?.code).toBe("EVAL_EXECUTOR_BUSY");
      expect(first?.cases[0]?.sessionId).toBe("");
      expect(f.finished.get(f.runs[1]!.id)?.result?.counts.passed).toBe(3);
      expect(JSON.stringify([...f.finished.values()])).not.toContain(
        "private upstream",
      );
      expect(f.started).toHaveLength(5);
      expect(f.cleaned).toHaveLength(5);
    } finally {
      await f.worker.stop();
    }
  });
  it("retains evidence from a previous worker when the consumer generation changed", async () => {
    const f = fixture([2], 1, { native: true });
    f.store.executionGeneration = async (_id, _owner, _execution, caseId) =>
      caseId === "case-0" ? randomUUID() : undefined;
    f.store.executionEvidence = async (_id, _owner, caseId) =>
      caseId === "case-0"
        ? {
            sessionId: "previous-real-session",
            steps: [
              {
                index: 0,
                input: { message: "hello" },
                expectation: { type: "answer" },
                observation: {
                  type: "answer",
                  text: "previously captured",
                  structured: [],
                },
                status: "ungraded",
                criteria: [],
              },
            ],
          }
        : undefined;
    f.worker.start();
    try {
      await f.done;
      const result = f.finished.get(f.runs[0]!.id)?.result;
      expect(result?.counts).toEqual({
        passed: 1,
        failed: 0,
        error: 1,
        cancelled: 0,
      });
      expect(result?.cases[0]?.errors[0]?.code).toBe("EVAL_EXECUTION_UNKNOWN");
      expect(result?.cases[0]?.sessionId).toBe("previous-real-session");
      expect(result?.cases[0]?.steps[0]?.observation.text).toBe(
        "previously captured",
      );
      expect(f.started).toHaveLength(1);
    } finally {
      await f.worker.stop();
    }
  });
  it("dispatches one suite as independent attempts with per-repetition identities", async () => {
    const f = fixture([3], 2, { native: true, repetitions: 2 });
    f.worker.start();
    try {
      await f.done;
      expect(f.started).toHaveLength(6);
      expect(f.peak()).toBeLessThanOrEqual(2);
      expect(f.finished.get(f.runs[0]!.id)?.result?.counts.passed).toBe(6);
      expect(
        f.progress.get(f.runs[0]!.id)?.some((e) => e.type === "case-dispatch"),
      ).toBe(true);
    } finally {
      await f.worker.stop();
    }
  });
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

it("reattaches accepted jobs after graceful worker shutdown without rerunning the conversation", async () => {
  const gate = deferred();
  const f = fixture([2], 1, { native: true, execute: () => gate.promise });
  f.store.executionGeneration = async (id, _owner, executionId) => {
    const receipt = f.progress
      .get(id)
      ?.find(
        (event) =>
          event.type === "case-dispatch" && event.executionId === executionId,
      );
    return receipt?.type === "case-dispatch" ? receipt.generation : undefined;
  };
  f.worker.start();
  let next: ReturnType<typeof f.createWorker> | undefined;
  try {
    await vi.waitFor(() => expect(f.started).toHaveLength(1));
    await f.worker.stop();
    expect(f.finished.size).toBe(0);
    expect(f.active()).toBe(1);
    vi.mocked(f.store.claim)
      .mockReset()
      .mockResolvedValueOnce(f.runs)
      .mockResolvedValue(undefined);
    next = f.createWorker();
    next.start();
    gate.resolve();
    await f.done;
    expect(f.started).toHaveLength(2);
    expect(f.cleaned).toHaveLength(2);
    expect(f.finished.get(f.runs[0]!.id)?.result?.counts.passed).toBe(2);
  } finally {
    gate.resolve();
    await f.worker.stop();
    await next?.stop();
  }
});

it("records one shared timeout occurrence and preserves completed evidence", async () => {
  const diagnosticId = randomUUID();
  const reportError = vi.fn(async () => diagnosticId);
  const f = fixture([2, 1], 1, {
    reportError,
    execute: async (context) => {
      if (context.suiteId !== "suite-0" || context.case.id !== "case-0")
        await new Promise<void>((resolve) =>
          context.signal.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        );
    },
  });
  for (const run of f.runs) run.request.runTimeoutMs = 1500;
  f.worker.start();
  try {
    await f.done;
    const outcomes = [...f.finished.values()];
    expect(
      outcomes.some(
        (outcome) => outcome.termination?.code === "EVAL_RUN_TIMEOUT",
      ),
    ).toBe(true);
    expect(
      outcomes
        .filter((outcome) => outcome.termination)
        .every((outcome) => outcome.termination?.timeoutMs === 1500),
    ).toBe(true);
    const completed = [...f.progress.values()]
      .flat()
      .filter((event) => event.type === "case-completed");
    expect(completed.some((event) => event.result.status === "passed")).toBe(
      true,
    );
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(
      outcomes
        .filter((outcome) => outcome.termination)
        .every((outcome) => outcome.termination?.diagnosticId === diagnosticId),
    ).toBe(true);
    expect(f.started.length).toBeLessThan(3);
    expect(f.cleaned.length).toBe(f.started.length);
  } finally {
    await f.worker.stop();
  }
});

it("archives SDK execution and cleanup issues once across progress and final results", async () => {
  const reportError = vi.fn(async () => randomUUID());
  const f = fixture([1], 1, {
    reportError,
    execute: async () => {
      throw new Error("Original execution failure");
    },
    teardown: async () => {
      throw new Error("Original cleanup failure");
    },
  });
  f.worker.start();
  try {
    await f.done;
    const issues = [...f.finished.values()].flatMap(
      (outcome) => outcome.result?.cases.flatMap((item) => item.errors) ?? [],
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      "Original execution failure",
      "Original cleanup failure",
    ]);
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(new Set(issues.map((issue) => issue.diagnosticId)).size).toBe(2);
    const completed = [...f.progress.values()]
      .flat()
      .filter((event) => event.type === "case-completed");
    expect(
      completed.at(-1)?.result.errors.map((issue) => issue.diagnosticId),
    ).toEqual(issues.map((issue) => issue.diagnosticId));
  } finally {
    await f.worker.stop();
  }
});
