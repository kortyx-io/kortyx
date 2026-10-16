import { randomUUID } from "node:crypto";
import {
  createEvalIssue,
  type EvalIssue,
  type EvalRunResult,
  type EvalTermination,
} from "@kortyx/agent/evals";
import type { EvalJobStore, EvalWorkerRun } from "./worker";

type Outcome = Parameters<EvalJobStore["finish"]>[2];
export type AttemptExecution = (
  run: EvalWorkerRun,
  options: {
    signal: AbortSignal;
    finish: (outcome: Outcome) => Promise<void>;
    isCancelled?: () => boolean;
  },
) => Promise<void>;

/** The owner holds every suite lease; each occupied slot includes consumer cleanup
 * and Studio grading. Attempt failures retain evidence and leave siblings running. */
export async function executeEvaluation(
  runs: EvalWorkerRun[],
  owner: string,
  store: EvalJobStore,
  signal: AbortSignal,
  execute: AttemptExecution,
  isDetached: () => boolean = () => false,
  reportIssue?: (
    run: EvalWorkerRun,
    issue: EvalIssue,
  ) => Promise<string | undefined>,
) {
  const first = runs[0]!;
  const concurrency = first.request.concurrency;
  const timeoutMs = first.request.runTimeoutMs ?? 30 * 60_000;
  let timedOut = false;
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
      termination: undefined as EvalTermination | undefined,
      issue: undefined as EvalIssue | undefined,
      controller: new AbortController(),
    };
  });
  let timeoutDiagnostic: Promise<string | undefined> | undefined;
  const finish = async (state: (typeof states)[number]) => {
    if (state.finished || isDetached()) return;
    state.finished = true;
    if ((timedOut && state.remaining) || state.termination)
      state.termination ??= {
        code: "EVAL_RUN_TIMEOUT",
        message: `Evaluation timed out after ${timeoutMs / 60_000} minutes. Completed results are preserved; consumer cleanup was signalled.`,
        timeoutMs,
        cleanup: "signalled",
      };
    if (state.cancelled)
      state.termination ??= {
        code: "EVAL_CANCELLED",
        message:
          "Evaluation cancelled by request. Completed results are preserved.",
      };
    if (state.remaining && !state.termination && !state.error)
      state.termination = {
        code: "EVAL_EXECUTION_UNKNOWN",
        message: `Evaluation stopped with ${state.remaining} incomplete attempts. No termination reason was recorded.`,
        cleanup: "unknown",
      };
    if (
      state.termination &&
      state.termination.code !== "EVAL_CANCELLED" &&
      reportIssue
    ) {
      const issue =
        state.issue ??
        createEvalIssue("execute", new Error(state.termination.message), {
          code: state.termination.code,
        });
      const capture = () =>
        reportIssue(state.run, issue).catch(() => undefined);
      if (state.termination.code === "EVAL_RUN_TIMEOUT")
        timeoutDiagnostic ??= capture();
      const diagnosticId = await (state.termination.code === "EVAL_RUN_TIMEOUT"
        ? timeoutDiagnostic
        : capture());
      if (diagnosticId) state.termination.diagnosticId = diagnosticId;
    }
    if (
      state.cancelled ||
      state.error ||
      state.remaining ||
      state.termination
    ) {
      await store.finish(state.run.id, owner, {
        cancelled: state.cancelled,
        ...(state.issue ? { issue: state.issue } : {}),
        ...(state.termination ? { termination: state.termination } : {}),
        error:
          state.termination?.message ??
          state.error ??
          "Evaluation stopped before all attempts completed. No termination reason was recorded.",
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
              if (state.finished || isDetached()) return;
              if (!lease) {
                state.error =
                  "Evaluation lease was lost; execution status is unknown.";
                state.termination = {
                  code: "EVAL_LEASE_LOST",
                  message: state.error,
                  cleanup: "unknown",
                };
                state.controller.abort("lease-lost");
              } else if (lease.cancelRequestedAt) {
                state.cancelled = true;
              }
            } catch (error) {
              state.issue = createEvalIssue("reporting", error);
              state.error = `Evaluation lease could not be renewed: ${state.issue.message}`;
              state.termination = {
                code: "EVAL_LEASE_LOST",
                message: state.error,
                cleanup: "unknown",
              };
              state.controller.abort("lease-lost");
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
  const deadline = setTimeout(
    () => {
      timedOut = true;
      controller.abort({ code: "EVAL_RUN_TIMEOUT", timeoutMs });
    },
    Math.max(
      1,
      timeoutMs -
        Math.max(
          0,
          startedAt.getTime() -
            Math.min(
              ...runs.map((run) =>
                run.startedAt
                  ? new Date(run.startedAt).getTime()
                  : startedAt.getTime(),
              ),
            ),
        ),
    ),
  );
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
            if (state.cancelled || state.error) {
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
                signal: AbortSignal.any([
                  executionSignal,
                  state.controller.signal,
                ]),
                isCancelled: () => state.cancelled,
                finish: async (outcome) => {
                  if (outcome.termination)
                    state.termination = outcome.termination;
                  if (outcome.result) state.results.set(index, outcome.result);
                  else {
                    const attempt = state.attempts[index]!;
                    const issue = outcome.issue ?? {
                      phase: "execute" as const,
                      code: "EVAL_EXECUTION_UNKNOWN",
                      message:
                        outcome.error ?? "Attempt execution did not complete.",
                    };
                    const result: EvalRunResult = {
                      id: randomUUID(),
                      suiteId: state.run.suiteId,
                      suiteRevision: state.run.suiteRevision,
                      suite: state.run.suite,
                      startedAt: startedAt.toISOString(),
                      durationMs: Date.now() - startedAt.getTime(),
                      status: outcome.cancelled ? "cancelled" : "error",
                      counts: {
                        passed: 0,
                        failed: 0,
                        error: outcome.cancelled ? 0 : 1,
                        cancelled: outcome.cancelled ? 1 : 0,
                      },
                      ...(state.run.request.judge
                        ? { judge: state.run.request.judge }
                        : {}),
                      errors: [],
                      cases: [
                        {
                          ...outcome.capturedCase,
                          caseId: attempt.caseId,
                          repetition: attempt.repetition,
                          sessionId: outcome.capturedCase?.sessionId ?? "",
                          steps: outcome.capturedCase?.steps ?? [],
                          durationMs: 0,
                          status: outcome.cancelled ? "cancelled" : "error",
                          errors: [
                            ...(outcome.capturedCase?.errors ?? []),
                            issue,
                          ],
                        },
                      ],
                    };
                    state.results.set(index, result);
                    await store.progress(state.run.id, owner, {
                      type: "case-completed",
                      result: result.cases[0]!,
                    });
                  }
                },
              },
            );
            state.remaining--;
            if (!state.remaining) await finish(state);
          } catch (error) {
            state.issue = createEvalIssue("reporting", error);
            // A reporting/storage failure is scoped to the suite whose lease owns it.
            state.error = state.issue.message;
            state.termination = {
              code: "EVAL_EXECUTOR_FAILED",
              message: state.issue.message,
              phase: "reporting",
            };
            state.controller.abort("executor-failed");
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
