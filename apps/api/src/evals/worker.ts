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
import { createEvalIssue } from "@kortyx/agent/evals";
import {
  appendEvalProgress,
  type claimEvalRun,
  claimEvalRuns,
  confirmEvalWorkerRetirement,
  finishEvalRun,
  getEvalAttemptEvidence,
  getEvalExecutionGeneration,
  heartbeatEvalRun,
  type TelemetryDb,
} from "@kortyx/telemetry-db";
import type { UsageOperation, UsageTelemetry } from "@kortyx/usage-telemetry";
import { getUsageTelemetry } from "@kortyx/usage-telemetry/node";
import packageJson from "../../package.json";
import { recordEvalDiagnostic } from "./diagnostics";
import {
  createEvalDispatcher,
  EvalDispatchError,
  evalExecutionIdentity,
} from "./dispatch";
import { readEvalErrorResponse } from "./error-response";
import { type AttemptExecution, executeEvaluation } from "./execute-evaluation";
import { gradeEvalExecution } from "./grade-execution";
import { type EvalTarget, readEvalWire } from "./targets";
import { evalOutcomeUsage } from "./usage";
import { EvalWorkerRetirementError } from "./worker-retirement";

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
  /** Called only after local tasks, claims and heartbeats settle. True proves
   * this owner has no unresolved durable claims. It must not dispatch/replay work.
   * Without this capability an ambiguous drain continues to fail closed.
   */
  confirmRetirement?(owner: string): Promise<boolean>;
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
  /** Custom stores own instrumentation unless explicitly supplied here. */
  usage?: UsageTelemetry | false;
  /** Full HTTP transport for idempotent admission, observation and explicit cancellation. */
  fetch?: typeof fetch;
  dispatch?: { maxRetries?: number; maxRetryWaitMs?: number };
  maxConcurrentEvaluations?: number;
  reportError?: (
    run: EvalWorkerRun,
    error: unknown,
  ) => Promise<string | undefined>;
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
  const baseStore: EvalJobStore = options.store ?? {
    claim: async (owner) => {
      const runs = await claimEvalRuns(db, owner, targets, {
        maxConcurrentEvaluations: options.maxConcurrentEvaluations ?? 4,
      });
      return runs.length ? runs : undefined;
    },
    confirmRetirement: (owner) => confirmEvalWorkerRetirement(db, owner),
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
  const reportError =
    options.reportError ??
    (options.store
      ? async () => undefined
      : (run: EvalWorkerRun, error: unknown) =>
          recordEvalDiagnostic(db, run, error));
  // Archive SDK-originated issues even without a telemetry exporter. References
  // already captured by the SDK are reused, preserving occurrence identity.
  const pendingIssues = new WeakMap<EvalIssue, Promise<void>>();
  const attemptIssues = new Map<
    string,
    Map<string, Promise<string | undefined>>
  >();
  const archiveIssue = (
    run: EvalWorkerRun,
    issue: EvalIssue,
    caseId?: string,
    repetition?: number,
    index = 0,
  ) => {
    if (issue.diagnosticId) return Promise.resolve();
    const pending = pendingIssues.get(issue);
    if (pending) return pending;
    let records = attemptIssues.get(run.id);
    if (!records) {
      records = new Map();
      attemptIssues.set(run.id, records);
    }
    const key = JSON.stringify([
      caseId ?? run.request.attempt?.caseId,
      repetition ?? run.request.attempt?.repetition,
      issue.phase,
      issue.code,
      index,
    ]);
    let capture = records.get(key);
    if (!capture) {
      capture = options.store
        ? reportError(
            run,
            issue.exception?.data ?? new Error(issue.message),
          ).catch(() => undefined)
        : recordEvalDiagnostic(
            db,
            run,
            new Error(issue.message),
            issue.exception,
            {
              phase: issue.phase,
              ...(caseId ? { caseId } : {}),
              ...(repetition ? { repetition: String(repetition) } : {}),
            },
          );
      records.set(key, capture);
    }
    const task = capture.then((diagnosticId) => {
      if (diagnosticId) issue.diagnosticId = diagnosticId;
    });
    pendingIssues.set(issue, task);
    return task;
  };
  const usage =
    options.usage === false
      ? undefined
      : (options.usage ??
        (options.store
          ? undefined
          : getUsageTelemetry(
              "studio_api",
              packageJson.version,
              "oss_studio",
            )));
  const usageScopes = new Map<string, UsageOperation>();
  const claimedRuns = new Map<string, EvalWorkerRun>();
  const heartbeats = new Set<Promise<unknown>>();
  const store: EvalJobStore = {
    heartbeat: async (id, owner) => {
      const pending = baseStore.heartbeat(id, owner);
      heartbeats.add(pending);
      try {
        return await pending;
      } finally {
        heartbeats.delete(pending);
      }
    },
    executionGeneration: async (...args) =>
      baseStore.executionGeneration?.(...args),
    executionEvidence: async (...args) =>
      baseStore.executionEvidence?.(...args),
    claim: async (owner) => {
      const claimed = await baseStore.claim(owner);
      for (const run of Array.isArray(claimed)
        ? claimed
        : claimed
          ? [claimed]
          : []) {
        claimedRuns.set(run.id, run);
        try {
          if (!usageScopes.has(run.id) && usage)
            usageScopes.set(
              run.id,
              usage.start("studio.eval.execution", {
                origin: "server",
                resource: "evals",
                phase: "execution",
                measurement_kind: run.request.attempt ? "attempt" : "execution",
              }),
            );
        } catch {
          /* Optional usage collection cannot change queue ownership. */
        }
      }
      return claimed;
    },
    progress: async (id, owner, event) => {
      const run = claimedRuns.get(id);
      if (run && event.type === "case-completed")
        for (const [index, issue] of event.result.errors.entries()) {
          if (
            issue.code !== "EVAL_RUN_TIMEOUT" &&
            issue.code !== "EVAL_CANCELLED"
          )
            await archiveIssue(
              run,
              issue,
              event.result.caseId,
              event.result.repetition,
              index,
            );
        }
      await baseStore.progress(id, owner, event);
    },
    finish: async (id, owner, outcome) => {
      const run = claimedRuns.get(id);
      if (run) {
        if (
          outcome.termination &&
          outcome.termination.code !== "EVAL_CANCELLED" &&
          !outcome.termination.diagnosticId
        ) {
          const issue =
            outcome.issue ??
            createEvalIssue("execute", new Error(outcome.termination.message), {
              code: outcome.termination.code,
            });
          await archiveIssue(run, issue);
          if (issue.diagnosticId)
            outcome.termination.diagnosticId = issue.diagnosticId;
        }
        if (
          outcome.issue &&
          outcome.issue.code !== "EVAL_RUN_TIMEOUT" &&
          outcome.issue.code !== "EVAL_CANCELLED"
        )
          await archiveIssue(run, outcome.issue);
        for (const [index, issue] of (outcome.result?.errors ?? []).entries())
          await archiveIssue(run, issue, undefined, undefined, index);
        for (const item of outcome.result?.cases ?? [])
          for (const [index, issue] of item.errors.entries()) {
            if (issue.code === "EVAL_RUN_TIMEOUT") {
              if (outcome.termination?.diagnosticId)
                issue.diagnosticId = outcome.termination.diagnosticId;
            } else if (issue.code !== "EVAL_CANCELLED")
              await archiveIssue(
                run,
                issue,
                item.caseId,
                item.repetition,
                index,
              );
          }
      }
      try {
        await baseStore.finish(id, owner, outcome);
      } catch (error) {
        // Suite execution can retain a reporting error without rejecting its task.
        // Retirement must still fail closed on an ambiguous terminal write.
        drainFailure ??= new EvalWorkerRetirementError(
          "completion",
          owner,
          error,
          id,
          run,
        );
        throw error;
      }
      try {
        const scope = usageScopes.get(id);
        if (scope) {
          const measurement = evalOutcomeUsage(outcome);
          scope.end(measurement.outcome, measurement.properties);
        }
      } catch {
        /* Persistence already succeeded; preserve its result. */
      }
      usageScopes.delete(id);
      claimedRuns.delete(id);
      attemptIssues.delete(id);
    },
  };
  const owner = randomUUID();
  const dispatcher = createEvalDispatcher(options.fetch ?? fetch, {
    ...options.dispatch,
    usage: usage ?? false,
  });
  const maxConcurrentEvaluations = options.maxConcurrentEvaluations ?? 4;
  if (
    !Number.isSafeInteger(maxConcurrentEvaluations) ||
    maxConcurrentEvaluations < 1
  )
    throw new TypeError("maxConcurrentEvaluations must be a positive integer.");
  const executing = new Set<Promise<void>>();
  let stopped = false;
  let draining = false;
  let admissionReady = false;
  let drainFailure: EvalWorkerRetirementError | undefined;
  let retirement: Promise<void> | undefined;
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
    const timeoutMs = run.request.runTimeoutMs ?? 30 * 60_000;
    let timedOut = false;
    let phase: "execute" | "grading" = "execute";
    const deadline = scheduled
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          controller.abort({ code: "EVAL_RUN_TIMEOUT", timeoutMs });
        }, timeoutMs);
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
        throw new EvalDispatchError("EVAL_JUDGE_UNAVAILABLE", failureMessage);
      }
      const executionSignal = scheduled
        ? AbortSignal.any([controller.signal, scheduled.signal])
        : controller.signal;
      const {
        runTimeoutMs: _timeout,
        resolvedSettings: _settings,
        ...consumerRequest
      } = run.request;
      const body = JSON.stringify(consumerRequest);
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
        const responseText = await readEvalErrorResponse(response);
        throw new EvalDispatchError(
          "EVAL_EXECUTOR_REJECTED",
          `Consumer rejected evaluation execution with HTTP ${response.status}.${responseText ? ` ${responseText}` : ""}`,
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
            event.message ||
              event.failure?.message ||
              "Consumer did not provide an error message.",
            undefined,
            {
              ...(event.failure ? { failure: event.failure } : {}),
              ...(event.exception ? { exception: event.exception } : {}),
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
        phase = "grading";
        result = await gradeEvalExecution(
          result,
          studioJudge,
          executionSignal,
          async (event) => {
            if (event.type === "step-completed" && capturedCase) {
              capturedCase.steps = [
                ...(capturedCase.steps ?? []).filter(
                  (step) => step.index !== event.step.index,
                ),
                event.step,
              ].sort((a, b) => a.index - b.index);
            }
            if (event.type === "case-completed") capturedCase = event.result;
            await store.progress(run.id, owner, event);
          },
          (error) => reportError(run, error),
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
      const reason = scheduled?.signal.reason;
      const timeout =
        timedOut ||
        (reason &&
          typeof reason === "object" &&
          reason.code === "EVAL_RUN_TIMEOUT");
      const diagnosticId =
        known && error.issue?.diagnosticId
          ? error.issue.diagnosticId
          : !timeout && !userCancelled
            ? await reportError(run, error).catch(() => undefined)
            : undefined;
      const unexpected = createEvalIssue(phase, error, {
        ...(diagnosticId ? { diagnosticId } : {}),
        code: "EVAL_EXECUTION_UNKNOWN",
      });
      const message = timeout
        ? `Evaluation timed out after ${timeoutMs / 60_000} minutes during ${phase}. Consumer cleanup was signalled.`
        : known
          ? error.message
          : unexpected.message;
      const code = timeout
        ? "EVAL_RUN_TIMEOUT"
        : userCancelled || scheduled?.isCancelled?.()
          ? "EVAL_CANCELLED"
          : known
            ? error.code
            : "EVAL_EXECUTION_UNKNOWN";
      await finish({
        issue: {
          ...(timeout
            ? createEvalIssue(phase, new Error(message, { cause: error }), {
                code,
              })
            : unexpected),
          phase,
          ...(timeout
            ? { details: { timeoutMs } }
            : known && error.status
              ? { details: { httpStatus: error.status } }
              : {}),
          code,
          message,
          ...(known ? error.issue : {}),
        },
        ...(timeout
          ? {
              termination: {
                code: "EVAL_RUN_TIMEOUT" as const,
                message,
                timeoutMs,
                phase,
                cleanup: "signalled" as const,
              },
            }
          : {}),
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
      if (stopped || draining || (!targets.length && !options.store)) return;
      loop ??= (async () => {
        while (!stopped && !draining) {
          try {
            if (executing.size >= maxConcurrentEvaluations) {
              await pause();
              continue;
            }
            const claimed = await store.claim(owner);
            admissionReady = true;
            if (stopped) break;
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
                    async (run, issue) => {
                      await archiveIssue(run, issue);
                      return issue.diagnosticId;
                    },
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
            void task
              .catch((error) => {
                // A lost terminal write must not become a successful retirement.
                drainFailure ??= new EvalWorkerRetirementError(
                  "completion",
                  owner,
                  error,
                  Array.isArray(claimed) ? claimed[0]?.id : claimed.id,
                  Array.isArray(claimed) ? claimed[0] : claimed,
                );
              })
              .finally(() => {
                executing.delete(task);
                // Release unfinished measurements after lease/persistence failure too.
                for (const run of Array.isArray(claimed)
                  ? claimed
                  : [claimed]) {
                  if (claimedRuns.get(run.id) !== run) continue;
                  usageScopes.delete(run.id);
                  claimedRuns.delete(run.id);
                  attemptIssues.delete(run.id);
                }
              });
          } catch (error) {
            admissionReady = false;
            if (!stopped)
              drainFailure ??= new EvalWorkerRetirementError(
                "claim",
                owner,
                error,
              );
            if (!stopped && !draining) await pause();
          }
        }
        await Promise.allSettled(executing);
      })();
    },
    /** Readiness means this loop has successfully reached its store, not just HTTP is up. */
    isReady() {
      return admissionReady && !stopped && !draining;
    },
    /** Stop admission, retaining leases, cancellation and final writes until done.
     * A claim already in flight belongs to this worker and is also completed.
     * There is no retirement timeout: the caller must preserve the owning process.
     * Use stop() explicitly to abort instead; it rejects a pending drain.
     * A drained worker cannot restart. An ambiguous drain is retryable after a
     * read-only store check proves the owner has no unresolved durable claims.
     */
    drain() {
      draining = true;
      if (retirement) return retirement;
      const attempt = (async () => {
        await loop;
        await Promise.allSettled(heartbeats);
        if (stopped)
          throw new Error(
            "Evaluation worker retirement was explicitly aborted.",
          );
        if (drainFailure) {
          let confirmed: boolean | undefined;
          try {
            confirmed = await baseStore.confirmRetirement?.(owner);
          } catch (error) {
            throw new EvalWorkerRetirementError(
              "verification",
              owner,
              new AggregateError(
                [drainFailure, error],
                "Retirement verification failed.",
              ),
            );
          }
          if (confirmed !== true) throw drainFailure;
          drainFailure = undefined;
        }
      })();
      retirement = attempt;
      void attempt.catch(() => {
        if (retirement === attempt) retirement = undefined;
      });
      return attempt;
    },
    async stop() {
      stopped = true;
      for (const controller of active) controller.abort();
      await loop;
      await Promise.allSettled(heartbeats);
      usageScopes.clear();
      claimedRuns.clear();
      attemptIssues.clear();
    },
  };
}
