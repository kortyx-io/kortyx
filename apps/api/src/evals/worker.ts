import { randomUUID } from "node:crypto";
import { getEvalSuiteRevision } from "@kortyx/agent";
import type {
  EvalProgress,
  EvalRunResult,
  EvalSuite,
} from "@kortyx/agent/evals";
import {
  appendEvalProgress,
  claimEvalRun,
  finishEvalRun,
  heartbeatEvalRun,
  type TelemetryDb,
} from "@kortyx/telemetry-db";
import { type EvalTarget, readEvalWire } from "./targets";

export function createEvalWorker(
  db: TelemetryDb,
  targets: readonly EvalTarget[],
) {
  const owner = randomUUID();
  let stopped = false;
  let loop: Promise<void> | undefined;
  let active: AbortController | undefined;
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 500));
  async function execute(
    run: NonNullable<Awaited<ReturnType<typeof claimEvalRun>>>,
  ) {
    const controller = new AbortController();
    active = controller;
    let userCancelled = false;
    let heartbeatBusy = false;
    const timer = setInterval(() => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      void heartbeatEvalRun(db, run.id, owner)
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
      const target = targets.find(
        (value) =>
          value.id === run.targetId &&
          value.organizationId === run.organizationId &&
          value.projectId === run.projectId &&
          value.environment === run.environment,
      );
      if (!target) throw new Error("Target no longer configured.");
      const executionSignal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(30 * 60_000),
      ]);
      const response = await fetch(target.url, {
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
      )
        throw new Error("Consumer rejected execution.");
      let result: EvalRunResult | undefined;
      for await (const event of readEvalWire(response.body, executionSignal)) {
        if (result) throw new Error("Consumer emitted data after completion.");
        if (event.type === "error")
          throw new Error("Consumer eval runner failed.");
        if (event.type === "progress")
          await appendEvalProgress(
            db,
            run.id,
            owner,
            event.event as EvalProgress,
          );
        else result = event.result as EvalRunResult;
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
        expectedIds.flatMap((id) =>
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
      const counts = { passed: 0, failed: 0, error: 0, cancelled: 0 };
      for (const item of result.cases) counts[item.status]++;
      const status =
        result.errors.length || counts.error
          ? "error"
          : counts.cancelled
            ? "cancelled"
            : counts.failed
              ? "failed"
              : "passed";
      if (
        result.status !== status ||
        Object.keys(counts).some(
          (key) =>
            counts[key as keyof typeof counts] !==
            result.counts[key as keyof typeof counts],
        )
      )
        throw new Error("Inconsistent eval verdicts.");
      await finishEvalRun(db, run.id, owner, { result });
    } catch {
      await finishEvalRun(db, run.id, owner, {
        cancelled: userCancelled,
        error: userCancelled
          ? "Cancellation requested. Consumer cleanup was signalled."
          : "Eval execution disconnected or failed. Inspect the consumer before starting a new run.",
      });
    } finally {
      clearInterval(timer);
      active = undefined;
    }
  }
  return {
    start() {
      if (!targets.length) return;
      loop ??= (async () => {
        while (!stopped) {
          try {
            const run = await claimEvalRun(db, owner, targets);
            if (run) await execute(run);
            else await pause();
          } catch {
            if (!stopped) await pause();
          }
        }
      })();
    },
    async stop() {
      stopped = true;
      active?.abort();
      await loop;
    },
  };
}
