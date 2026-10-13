import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getEvalSuiteRevision } from "@kortyx/agent";
import type {
  EvalCaseResult,
  EvalIssue,
  EvalJudge,
  EvalProgress,
  EvalRunResult,
  EvalSuite,
} from "@kortyx/agent/evals";
import {
  appendEvalProgress,
  type claimEvalRun,
  claimEvalRuns,
  finishEvalRun,
  getEvalAttemptEvidence,
  getEvalExecutionGeneration,
  heartbeatEvalRun,
  type TelemetryDb,
} from "@kortyx/telemetry-db";
import {
  createEvalDispatcher,
  EvalDispatchError,
  evalExecutionIdentity,
} from "./dispatch";
import { type AttemptExecution, executeEvaluation } from "./execute-evaluation";
import { gradeEvalExecution } from "./grade-execution";
import { type EvalTarget, readEvalWire } from "./targets";

export type EvalWorkerRun = NonNullable<
  Awaited<ReturnType<typeof claimEvalRun>>
>;
/** A restricted durable queue can replace the self-hosted database operations. */
export type EvalWorkerOutcome = Parameters<typeof finishEvalRun>[3] & {
  issue?: EvalIssue;
  capturedCase?: Partial<EvalCaseResult>;
};
export interface EvalJobStore {
  /** Return all siblings atomically for an evaluation, or a legacy standalone run. */
  claim(owner: string): Promise<EvalWorkerRun | EvalWorkerRun[] | undefined>;
  heartbeat(
    id: string,
    owner: string,
  ): Promise<{ cancelRequestedAt: Date | null } | undefined>;
  progress(id: string, owner: string, event: EvalProgress): Promise<void>;
  /** Durable stores recover the original generation. Null fences legacy attempts. */
  executionGeneration?(
    id: string,
    owner: string,
    executionId: string,
    caseId?: string,
    repetition?: number,
  ): Promise<string | null | undefined>;
  executionEvidence?(
    id: string,
    owner: string,
    caseId: string,
    repetition: number,
  ): Promise<Partial<EvalCaseResult> | undefined>;
  finish(id: string, owner: string, outcome: EvalWorkerOutcome): Promise<void>;
}
export interface EvalWorkerOptions {
  /** Full HTTP transport for idempotent admission, observation and explicit cancellation. */
  fetch?: typeof fetch;
  dispatch?: { maxRetries?: number; maxRetryWaitMs?: number };
  maxConcurrentEvaluations?: number;
  store?: EvalJobStore;
  resolveTarget?: (run: EvalWorkerRun, owner: string) => Promise<EvalTarget>;
  /** Trusted transport injection; never selected by request payload. */
  request?: (
    target: EvalTarget,
    body: string,
    signal: AbortSignal,
    runId: string,
  ) => Promise<Response>;
}

export function createEvalWorker(
  db: TelemetryDb,
  targets: readonly EvalTarget[],
  studioJudge?: EvalJudge,
  options: EvalWorkerOptions = {},
) {
  const store: EvalJobStore = options.store ?? {
    claim: async (owner) => {
      const runs = await claimEvalRuns(db, owner, targets);
      return runs.length ? runs : undefined;
    },
    heartbeat: (id, owner) => heartbeatEvalRun(db, id, owner),
    executionEvidence: (id, owner, caseId, repetition) =>
      getEvalAttemptEvidence(db, id, owner, caseId, repetition),
    executionGeneration: (id, owner, executionId, caseId, repetition) =>
      getEvalExecutionGeneration(
        db,
        id,
        owner,
        executionId,
        caseId,
        repetition,
      ),
    progress: (id, owner, event) => appendEvalProgress(db, id, owner, event),
    finish: (id, owner, outcome) => finishEvalRun(db, id, owner, outcome),
  };
  const owner = randomUUID();
  const dispatcher = createEvalDispatcher(
    options.fetch ?? fetch,
    options.dispatch,
  );
  const maxConcurrentEvaluations = options.maxConcurrentEvaluations ?? 4;
  if (
    !Number.isSafeInteger(maxConcurrentEvaluations) ||
    maxConcurrentEvaluations < 1
  )
    throw new TypeError("maxConcurrentEvaluations must be a positive integer.");
  const executing = new Set<Promise<void>>();
  let stopped = false;
  let loop: Promise<void> | undefined;
  const active = new Set<AbortController>();
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 500));
  async function execute(
    run: NonNullable<Awaited<ReturnType<typeof claimEvalRun>>>,
    scheduled?: Parameters<AttemptExecution>[1],
  ) {
    const controller = new AbortController();
    active.add(controller);
    const finish =
      scheduled?.finish ?? ((outcome) => store.finish(run.id, owner, outcome));
    let userCancelled = false;
    let capturedCase: Partial<EvalCaseResult> | undefined;
    let failureMessage =
      "Eval execution disconnected or failed. Inspect the consumer before starting a new run.";
    const deadline = setTimeout(() => controller.abort(), 30 * 60_000);
    let heartbeatBusy = false;
    const timer = setInterval(() => {
      if (scheduled || heartbeatBusy) return;
      heartbeatBusy = true;
      void store
        .heartbeat(run.id, owner)
        .then(
          (state) => {
            if (!state || state.cancelRequestedAt) {
              userCancelled = Boolean(state?.cancelRequestedAt);
              controller.abort();
            }
          },
          () => controller.abort(),
        )
        .finally(() => {
          heartbeatBusy = false;
        });
    }, 2000);
    try {
      const target = options.resolveTarget
        ? await options.resolveTarget(run, owner)
        : targets.find(
            (value) =>
              value.id === run.targetId &&
              value.organizationId === run.organizationId &&
              value.projectId === run.projectId &&
              value.environment === run.environment,
          );
      if (!target)
        throw new EvalDispatchError(
          "EVAL_RESULT_INVALID",
          "Target no longer configured.",
        );
      const studioGrading = run.request.grading === "studio";
      if (
        studioGrading &&
        (!studioJudge ||
          !run.request.judge ||
          run.request.judge.id !== studioJudge.id ||
          run.request.judge.version !== studioJudge.version ||
          run.request.judge.location !== "studio")
      ) {
        failureMessage =
          "Studio judge changed or is unavailable. Refresh and start a new run.";
        throw new Error(failureMessage);
      }
      const executionSignal = scheduled
        ? AbortSignal.any([controller.signal, scheduled.signal])
        : controller.signal;
      const body = JSON.stringify(run.request);
      const executionId = evalExecutionIdentity(
        run.id,
        run.request.attempt?.caseId,
        run.request.attempt?.repetition,
      );
      if (run.request.attempt)
        capturedCase = await store.executionEvidence?.(
          run.id,
          owner,
          run.request.attempt.caseId,
          run.request.attempt.repetition,
        );
      const originalGeneration = await store.executionGeneration?.(
        run.id,
        owner,
        executionId,
        run.request.attempt?.caseId,
        run.request.attempt?.repetition,
      );
      if (originalGeneration === null)
        throw new EvalDispatchError(
          "EVAL_EXECUTION_UNKNOWN",
          "Previously dispatched legacy attempt cannot be replayed safely. Inspect before running again.",
        );
      const admission = options.request
        ? undefined
        : await dispatcher.open(
            target,
            body,
            executionSignal,
            evalExecutionIdentity(
              run.id,
              run.request.attempt?.caseId,
              run.request.attempt?.repetition,
            ),
            new Date(run.createdAt ?? Date.now()).toISOString(),
            async (state) => {
              const identities = run.request.attempt
                ? [run.request.attempt]
                : (
                    run.request.caseIds ??
                    run.suite.cases.map((item) => item.id)
                  ).flatMap((caseId) =>
                    Array.from(
                      { length: run.request.repetitions },
                      (_, index) => ({ caseId, repetition: index + 1 }),
                    ),
                  );
              for (const identity of identities)
                await store.progress(run.id, owner, {
                  type: "case-dispatch",
                  caseId: identity.caseId,
                  repetition: identity.repetition,
                  ...state,
                });
            },
            () => userCancelled || Boolean(scheduled?.isCancelled?.()),
            originalGeneration,
          );
      const response =
        admission?.response ??
        (await options.request?.(target, body, executionSignal, run.id));
      if (!response)
        throw new EvalDispatchError(
          "EVAL_TRANSPORT_UNAVAILABLE",
          "No consumer transport is available.",
        );
      if (
        !response.ok ||
        !response.body ||
        !response.headers
          .get("content-type")
          ?.startsWith("application/x-ndjson")
      ) {
        await response.body?.cancel().catch(() => {});
        throw new EvalDispatchError(
          "EVAL_EXECUTOR_REJECTED",
          `Consumer rejected evaluation execution with HTTP ${response.status}.`,
          response.status,
        );
      }
      let result: EvalRunResult | undefined;
      for await (const event of admission
        ? dispatcher.events(admission)
        : readEvalWire(response.body, executionSignal)) {
        if (event.type === "execution-status") continue;
        if (result)
          throw new EvalDispatchError(
            "EVAL_RESULT_INVALID",
            "Consumer emitted data after completion.",
          );
        if (event.type === "error")
          throw new EvalDispatchError(
            event.failure?.code ?? "EVAL_CONSUMER_FAILED",
            event.failure?.message ?? "Consumer eval runner failed.",
            undefined,
            {
              ...(event.failure ? { failure: event.failure } : {}),
              ...(event.diagnosticId
                ? { diagnosticId: event.diagnosticId }
                : {}),
            },
          );
        if (event.type === "progress") {
          const progress = event.event as EvalProgress;
          if (run.request.attempt && progress.type !== "run-started") {
            const identity =
              progress.type === "case-completed" ? progress.result : progress;
            if (
              identity.caseId !== run.request.attempt.caseId ||
              identity.repetition !== run.request.attempt.repetition
            )
              throw new EvalDispatchError(
                "EVAL_RESULT_INVALID",
                "Consumer emitted progress for another attempt.",
              );
          }
          await store.progress(run.id, owner, progress as EvalProgress);
          if (run.request.attempt) {
            capturedCase ??= {
              caseId: run.request.attempt.caseId,
              repetition: run.request.attempt.repetition,
              sessionId: "",
              steps: [],
              errors: [],
            };
            if (progress.type === "case-started") {
              capturedCase.sessionId = progress.sessionId;
              if (progress.attemptId)
                capturedCase.attemptId = progress.attemptId;
            }
            if (progress.type === "step-completed") {
              capturedCase.steps ??= [];
              const steps = capturedCase.steps;
              const existing = steps.findIndex(
                (step) => step.index === progress.step.index,
              );
              if (existing < 0) steps.push(progress.step);
              else steps[existing] = progress.step;
            }
            if (progress.type === "case-completed")
              capturedCase = progress.result;
          }
        } else result = event.result as EvalRunResult;
      }
      if (
        !result ||
        result.suiteId !== run.suiteId ||
        result.suiteRevision !== run.suiteRevision ||
        getEvalSuiteRevision(result.suite as EvalSuite) !== run.suiteRevision
      )
        throw new EvalDispatchError(
          "EVAL_RESULT_INVALID",
          "Missing or mismatched eval result.",
        );
      const expectedIds =
        run.request.caseIds ?? run.suite.cases.map((item) => item.id);
      const expected = new Set(
        run.request.attempt
          ? [`${run.request.attempt.caseId}:${run.request.attempt.repetition}`]
          : expectedIds.flatMap((id) =>
              Array.from(
                { length: run.request.repetitions },
                (_, i) => `${id}:${i + 1}`,
              ),
            ),
      );
      if (
        result.cases.length !== expected.size ||
        result.cases.some(
          (item) => !expected.delete(`${item.caseId}:${item.repetition}`),
        )
      )
        throw new EvalDispatchError(
          "EVAL_RESULT_INVALID",
          "Incomplete case results.",
        );
      for (const item of result.cases) {
        const definition = run.suite.cases.find(
          (value) => value.id === item.caseId,
        );
        if (
          !definition ||
          item.steps.length > definition.steps.length ||
          ((item.status === "passed" || item.status === "ungraded") &&
            item.steps.length !== definition.steps.length)
        )
          throw new EvalDispatchError(
            "EVAL_RESULT_INVALID",
            "Incomplete scenario execution.",
          );
        for (const [index, step] of item.steps.entries()) {
          const expectedStep = definition.steps[index];
          if (
            !expectedStep ||
            step.index !== index ||
            !isDeepStrictEqual(step.expectation, expectedStep.expect)
          )
            throw new EvalDispatchError(
              "EVAL_RESULT_INVALID",
              "Consumer changed the scenario expectations.",
            );
          if (!studioGrading && step.status === "ungraded")
            throw new EvalDispatchError(
              "EVAL_RESULT_INVALID",
              "App judge left a step ungraded.",
            );
          if (step.status === "ungraded" && !step.expectation.criteria?.length)
            throw new EvalDispatchError(
              "EVAL_RESULT_INVALID",
              "Unexpected ungraded step.",
            );
          if (
            !studioGrading &&
            step.status === "passed" &&
            step.criteria.length !== (step.expectation.criteria?.length ?? 0)
          )
            throw new EvalDispatchError(
              "EVAL_RESULT_INVALID",
              "App judge returned incomplete criterion results.",
            );
        }
      }
      const capturedResult = result;
      const counts: EvalRunResult["counts"] = {
        passed: 0,
        failed: 0,
        error: 0,
        cancelled: 0,
      };
      for (const item of result.cases)
        counts[item.status] = (counts[item.status] ?? 0) + 1;
      const status =
        result.errors.length || counts.error
          ? "error"
          : counts.cancelled
            ? "cancelled"
            : counts.failed
              ? "failed"
              : counts.ungraded
                ? "ungraded"
                : "passed";
      if (
        result.status !== status ||
        Object.keys(counts).some(
          (key) =>
            counts[key as keyof typeof counts] !==
            (capturedResult.counts[key as keyof typeof counts] ?? 0),
        )
      )
        throw new EvalDispatchError(
          "EVAL_RESULT_INVALID",
          "Inconsistent eval verdicts.",
        );
      if (
        run.request.judge &&
        (result.judge?.id !== run.request.judge.id ||
          result.judge?.version !== run.request.judge.version ||
          result.judge?.location !== run.request.judge.location)
      )
        throw new EvalDispatchError(
          "EVAL_RESULT_INVALID",
          "Consumer changed the selected judge.",
        );
      if (studioGrading) {
        if (!studioJudge)
          throw new EvalDispatchError(
            "EVAL_RESULT_INVALID",
            "Studio judge unavailable.",
          );
        for (const item of result.cases)
          for (const step of item.steps) {
            if (
              step.criteria.length ||
              (step.status === "passed" && step.expectation.criteria?.length)
            )
              throw new EvalDispatchError(
                "EVAL_RESULT_INVALID",
                "Consumer did not defer judging to Studio.",
              );
          }
        result = await gradeEvalExecution(
          result,
          studioJudge,
          executionSignal,
          (event) => store.progress(run.id, owner, event),
        );
      } else if (counts.ungraded)
        throw new EvalDispatchError(
          "EVAL_RESULT_INVALID",
          "App judge did not finish grading.",
        );
      executionSignal.throwIfAborted();
      await finish({ result });
    } catch (error) {
      if (stopped && !userCancelled) return;
      const known = error instanceof EvalDispatchError;
      const message = known ? error.message : failureMessage;
      const code = known ? error.code : "EVAL_EXECUTION_UNKNOWN";
      await finish({
        issue: {
          phase: "execute",
          code,
          message,
          ...(known ? error.issue : {}),
        },
        ...(capturedCase ? { capturedCase } : {}),
        cancelled: userCancelled || Boolean(scheduled?.isCancelled?.()),
        error: userCancelled
          ? "Cancellation requested. Inspect consumer cleanup before starting a new run."
          : message,
      });
    } finally {
      clearTimeout(deadline);
      clearInterval(timer);
      active.delete(controller);
    }
  }
  return {
    start() {
      if (!targets.length && !options.store) return;
      loop ??= (async () => {
        while (!stopped) {
          try {
            if (executing.size >= maxConcurrentEvaluations) {
              await pause();
              continue;
            }
            const claimed = await store.claim(owner);
            if (!claimed) {
              await pause();
              continue;
            }
            const task = (async () => {
              if (Array.isArray(claimed) && claimed[0]?.evaluationId) {
                const controller = new AbortController();
                active.add(controller);
                try {
                  await executeEvaluation(
                    claimed,
                    owner,
                    store,
                    controller.signal,
                    execute,
                    () => stopped,
                  );
                } finally {
                  active.delete(controller);
                }
              } else {
                const single = Array.isArray(claimed) ? claimed[0] : claimed;
                if (single) await execute(single);
              }
            })();
            executing.add(task);
            void task.catch(() => {}).finally(() => executing.delete(task));
          } catch {
            if (!stopped) await pause();
          }
        }
        await Promise.allSettled(executing);
      })();
    },
    async stop() {
      stopped = true;
      for (const controller of active) controller.abort();
      await loop;
    },
  };
}
