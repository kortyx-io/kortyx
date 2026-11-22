import { randomUUID } from "node:crypto";
import {
  type EvaluatorExecution,
  validateScoreGroupResult,
} from "@kortyx/telemetry-contracts";
import {
  claimEvaluatorExecution,
  type EvaluatorScope,
  ensureProjectEnvironmentAllowed,
  finishEvaluatorExecution,
  priceEvaluatorUsage,
  scheduleDatasetEvaluators,
  scheduleEvaluatorRules,
  type TelemetryDb,
} from "@kortyx/telemetry-db";
import type { UsageTelemetry } from "@kortyx/usage-telemetry";
import { getUsageTelemetry } from "@kortyx/usage-telemetry/node";
import packageJson from "../../package.json";
import { validateEvaluatorReferences } from "./evidence";
import type { EvaluatorModelService } from "./model";

/** A private host may restrict claims to a trusted project scope. */
export function createEvaluatorWorker(
  db: TelemetryDb,
  models: EvaluatorModelService,
  scope?: EvaluatorScope,
  options: { usage?: UsageTelemetry | false } = {},
) {
  const owner = randomUUID();
  const telemetry =
    options.usage === false
      ? undefined
      : (options.usage ??
        getUsageTelemetry("api", packageJson.version, "oss_studio"));
  const abort = new AbortController();
  let running = false;
  let pending: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    for (const schedule of [
      scheduleEvaluatorRules,
      scheduleDatasetEvaluators,
    ]) {
      await schedule(db, scope).catch(() => {
        console.error({ code: "EVALUATOR_SCHEDULING_FAILED" });
      });
    }
    const job = await claimEvaluatorExecution(db, owner, scope);
    if (!job) return;
    const measurement = telemetry?.start("studio.evaluator.execution", {
      resource: "evaluators",
      evaluator_source: job.source,
      origin: "server",
    });
    let usage: EvaluatorExecution["usage"] = null;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]);
    let phase = "authorization";
    try {
      await ensureProjectEnvironmentAllowed(db, job);
      phase = "model";
      const output = await models.invoke(
        job.snapshot.definition.model,
        job.renderedMessages,
        signal,
        (value) => {
          usage = value;
        },
        {
          group: job.snapshot.group,
          evidenceId: job.evidence.revision,
          eventIds: job.evidence.eventIds,
        },
      );
      signal.throwIfAborted();
      if (usage && models.provider)
        usage = await priceEvaluatorUsage(
          db,
          job,
          models.provider,
          job.snapshot.definition.model,
          usage,
        );
      const value = output as { scores?: unknown };
      phase = "validation";
      const scores = validateScoreGroupResult(
        job.snapshot.group,
        value?.scores,
      );
      phase = "evidence";
      validateEvaluatorReferences(job.evidence, scores);
      phase = "persistence";
      const accepted = await finishEvaluatorExecution(db, job.id, owner, {
        status: "completed",
        scores,
        usage,
      });
      measurement?.end(accepted ? "success" : "failed");
    } catch {
      measurement?.end(abort.signal.aborted ? "cancelled" : "failed");
      if (usage && models.provider)
        usage = await priceEvaluatorUsage(
          db,
          job,
          models.provider,
          job.snapshot.definition.model,
          usage,
        ).catch(() => usage);
      await finishEvaluatorExecution(db, job.id, owner, {
        status: abort.signal.aborted ? "cancelled" : "error",
        usage,
        error: abort.signal.aborted
          ? "Assessment cancelled during shutdown."
          : `Assessment failed during ${phase}. Check the model connection, declared fields, and supplied evidence references. Reported usage has been retained.`,
      });
    }
  };
  const loop = () => {
    if (!running) return;
    pending = tick()
      .catch(() => {
        console.error({ code: "EVALUATOR_WORKER_TICK_FAILED" });
      })
      .finally(() => {
        pending = undefined;
        if (running) timer = setTimeout(loop, 1000);
      });
  };
  return {
    start() {
      if (!running) {
        running = true;
        loop();
      }
    },
    async drain() {
      running = false;
      clearTimeout(timer);
      await pending;
    },
    async stop() {
      running = false;
      clearTimeout(timer);
      abort.abort();
      await pending;
    },
    tick,
  };
}
