import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getEvalSuiteRevision } from "@kortyx/agent";
import type {
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
  heartbeatEvalRun,
  type TelemetryDb,
} from "@kortyx/telemetry-db";
import { type AttemptExecution, executeEvaluation } from "./execute-evaluation";
import { gradeEvalExecution } from "./grade-execution";
import { type EvalTarget, readEvalWire } from "./targets";

export type EvalWorkerRun = NonNullable<
  Awaited<ReturnType<typeof claimEvalRun>>
>;
/** A restricted durable queue can replace the self-hosted database operations. */
export interface EvalJobStore {
  /** Return all siblings atomically for an evaluation, or a legacy standalone run. */
  claim(owner: string): Promise<EvalWorkerRun | EvalWorkerRun[] | undefined>;
  heartbeat(
    id: string,
    owner: string,
  ): Promise<{ cancelRequestedAt: Date | null } | undefined>;
  progress(id: string, owner: string, event: EvalProgress): Promise<void>;
  finish(
    id: string,
    owner: string,
    outcome: Parameters<typeof finishEvalRun>[3],
  ): Promise<void>;
}
export interface EvalWorkerOptions {
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
    progress: (id, owner, event) => appendEvalProgress(db, id, owner, event),
    finish: (id, owner, outcome) => finishEvalRun(db, id, owner, outcome),
  };
  const owner = randomUUID();
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
      if (!target) throw new Error("Target no longer configured.");
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
      const response = options.request
        ? await options.request(
            target,
            JSON.stringify(run.request),
            executionSignal,
            run.id,
          )
        : await fetch(target.url, {
            method: "POST",
            headers: {
              authorization: `Bearer ${target.serviceKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(run.request),
            signal: executionSignal,
            redirect: "error",
          });
      if (
        !response.ok ||
        !response.body ||
        !response.headers
          .get("content-type")
          ?.startsWith("application/x-ndjson")
      ) {
        await response.body?.cancel().catch(() => {});
        throw new Error("Consumer rejected execution.");
      }
      let result: EvalRunResult | undefined;
      for await (const event of readEvalWire(response.body, executionSignal)) {
        if (result) throw new Error("Consumer emitted data after completion.");
        if (event.type === "error")
          throw new Error("Consumer eval runner failed.");
        if (event.type === "progress") {
          const progress = event.event;
          if (run.request.attempt && progress.type !== "run-started") {
            const identity =
              progress.type === "case-completed" ? progress.result : progress;
            if (
              identity.caseId !== run.request.attempt.caseId ||
              identity.repetition !== run.request.attempt.repetition
            )
              throw new Error("Consumer emitted progress for another attempt.");
          }
          await store.progress(run.id, owner, progress as EvalProgress);
        } else result = event.result as EvalRunResult;
      }
      if (
        !result ||
        result.suiteId !== run.suiteId ||
        result.suiteRevision !== run.suiteRevision ||
        getEvalSuiteRevision(result.suite as EvalSuite) !== run.suiteRevision
      )
        throw new Error("Missing or mismatched eval result.");
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
        throw new Error("Incomplete case results.");
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
          throw new Error("Incomplete scenario execution.");
        for (const [index, step] of item.steps.entries()) {
          const expectedStep = definition.steps[index];
          if (
            !expectedStep ||
            step.index !== index ||
            !isDeepStrictEqual(step.expectation, expectedStep.expect)
          )
            throw new Error("Consumer changed the scenario expectations.");
          if (!studioGrading && step.status === "ungraded")
            throw new Error("App judge left a step ungraded.");
          if (step.status === "ungraded" && !step.expectation.criteria?.length)
            throw new Error("Unexpected ungraded step.");
          if (
            !studioGrading &&
            step.status === "passed" &&
            step.criteria.length !== (step.expectation.criteria?.length ?? 0)
          )
            throw new Error("App judge returned incomplete criterion results.");
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
        throw new Error("Inconsistent eval verdicts.");
      if (
        run.request.judge &&
        (result.judge?.id !== run.request.judge.id ||
          result.judge?.version !== run.request.judge.version ||
          result.judge?.location !== run.request.judge.location)
      )
        throw new Error("Consumer changed the selected judge.");
      if (studioGrading) {
        if (!studioJudge) throw new Error("Studio judge unavailable.");
        for (const item of result.cases)
          for (const step of item.steps) {
            if (
              step.criteria.length ||
              (step.status === "passed" && step.expectation.criteria?.length)
            )
              throw new Error("Consumer did not defer judging to Studio.");
          }
        result = await gradeEvalExecution(
          result,
          studioJudge,
          executionSignal,
          (event) => store.progress(run.id, owner, event),
        );
      } else if (counts.ungraded)
        throw new Error("App judge did not finish grading.");
      executionSignal.throwIfAborted();
      await finish({ result });
    } catch {
      await finish({
        cancelled: userCancelled,
        error: userCancelled
          ? "Cancellation requested. Consumer cleanup was signalled."
          : failureMessage,
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
            const run = await store.claim(owner);
            if (Array.isArray(run) && run.length > 1) {
              const controller = new AbortController();
              active.add(controller);
              try {
                await executeEvaluation(
                  run,
                  owner,
                  store,
                  controller.signal,
                  execute,
                );
              } finally {
                active.delete(controller);
              }
            } else if (run) {
              const single = Array.isArray(run) ? run[0] : run;
              if (single) await execute(single);
              else await pause();
            } else await pause();
          } catch {
            if (!stopped) await pause();
          }
        }
      })();
    },
    async stop() {
      stopped = true;
      for (const controller of active) controller.abort();
      await loop;
    },
  };
}
