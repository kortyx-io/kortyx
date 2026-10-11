import { randomUUID } from "node:crypto";
import type { EvalRunResult } from "@kortyx/agent/evals";
import type { EvalJobStore, EvalWorkerRun } from "./worker";

type Outcome = Parameters<EvalJobStore["finish"]>[2];
export type AttemptExecution = (
  run: EvalWorkerRun,
  options: { signal: AbortSignal; finish: (outcome: Outcome) => Promise<void> },
) => Promise<void>;

/** The owner holds every suite lease; each occupied slot includes consumer cleanup
 * and Studio grading. Unknown transport outcomes stop dispatch, never replay. */
export async function executeEvaluation(
  runs: EvalWorkerRun[],
  owner: string,
  store: EvalJobStore,
  signal: AbortSignal,
  execute: AttemptExecution,
) {
  const first = runs[0]!;
  const concurrency = first.request.concurrency;
  if (
    !first.evaluationId ||
    runs.some(
      (run) =>
        run.evaluationId !== first.evaluationId ||
        run.organizationId !== first.organizationId ||
        run.projectId !== first.projectId ||
        run.targetId !== first.targetId ||
        run.environment !== first.environment ||
        run.request.concurrency !== concurrency,
    )
  )
    throw new Error("Invalid evaluation claim.");
  const startedAt = new Date();
  const controller = new AbortController();
  const executionSignal = AbortSignal.any([signal, controller.signal]);
  const states = runs.map((run) => {
    const ids = run.suite.cases
      .filter(
        (item) => !run.request.caseIds || run.request.caseIds.includes(item.id),
      )
      .map((item) => item.id);
    const attempts = ids.flatMap((caseId) =>
      Array.from({ length: run.request.repetitions }, (_, index) => ({
        caseId,
        repetition: index + 1,
      })),
    );
    return {
      run,
      attempts,
      remaining: attempts.length,
      results: new Map<number, EvalRunResult>(),
      cancelled: false,
      finished: false,
      error: undefined as string | undefined,
    };
  });
  const finish = async (state: (typeof states)[number]) => {
    if (state.finished) return;
    state.finished = true;
    if (state.cancelled || state.error || state.remaining) {
      await store.finish(state.run.id, owner, {
        cancelled: state.cancelled,
        error:
          state.error ??
          (state.cancelled
            ? "Cancellation requested. Consumer cleanup was signalled."
            : "Evaluation execution interrupted. Inspect before starting a new run."),
      });
      return;
    }
    const parts = [...state.results.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, part]) => part);
    const result: EvalRunResult = {
      ...parts[0]!,
      id: randomUUID(),
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      cases: parts.flatMap((part) => part.cases),
      errors: parts.flatMap((part) => part.errors),
      counts: { passed: 0, failed: 0, error: 0, cancelled: 0 },
    };
    for (const item of result.cases)
      result.counts[item.status] = (result.counts[item.status] ?? 0) + 1;
    result.status =
      result.errors.length || result.counts.error
        ? "error"
        : result.counts.cancelled
          ? "cancelled"
          : result.counts.failed
            ? "failed"
            : result.counts.ungraded
              ? "ungraded"
              : "passed";
    await store.finish(state.run.id, owner, { result });
  };
  let heartbeatBusy = false;
  const heartbeat = async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      await Promise.all(
        states
          .filter((state) => !state.finished)
          .map(async (state) => {
            try {
              const lease = await store.heartbeat(state.run.id, owner);
              if (state.finished) return;
              if (!lease) controller.abort();
              else if (lease.cancelRequestedAt) state.cancelled = true;
            } catch {
              state.error = "Evaluation lease could not be renewed.";
              controller.abort();
            }
          }),
      );
      // Whole-evaluation cancellation interrupts active attempts. A single-suite
      // cancellation drains its active attempts (including cleanup) before their
      // slots can be reused, while siblings continue normally.
      if (
        states
          .filter((state) => !state.finished)
          .every((state) => state.cancelled)
      )
        controller.abort();
    } finally {
      heartbeatBusy = false;
    }
  };
  const timer = setInterval(() => {
    void heartbeat();
  }, 2000);
  const deadline = setTimeout(() => controller.abort(), 30 * 60_000);
  try {
    await heartbeat();
    // Round-robin admission prevents a large first suite from monopolizing slots.
    const jobs = Array.from(
      { length: Math.max(...states.map((state) => state.attempts.length)) },
      (_, index) =>
        states
          .filter((state) => state.attempts[index])
          .map((state) => ({ state, index })),
    ).flat();
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
        while (!executionSignal.aborted && cursor < jobs.length) {
          const { state, index } = jobs[cursor++]!;
          try {
            if (state.cancelled) {
              state.remaining--;
              if (!state.remaining) await finish(state);
              continue;
            }
            await execute(
              {
                ...state.run,
                request: {
                  ...state.run.request,
                  attempt: {
                    ...state.attempts[index]!,
                    evaluationId: first.evaluationId!,
                  },
                },
              },
              {
                signal: executionSignal,
                finish: async (outcome) => {
                  if (outcome.result) state.results.set(index, outcome.result);
                  else {
                    state.error = outcome.error;
                    controller.abort();
                  }
                },
              },
            );
            state.remaining--;
            if (!state.remaining) await finish(state);
          } catch {
            state.error =
              "Evaluation executor failed. Inspect before starting a new run.";
            controller.abort();
          }
        }
      }),
    );
  } finally {
    clearInterval(timer);
    clearTimeout(deadline);
    await Promise.all(states.map(finish));
  }
}
