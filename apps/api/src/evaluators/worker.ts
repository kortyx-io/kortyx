import { randomUUID } from "node:crypto";
import {
  type EvaluatorExecution,
  JudgeVerdictSchema,
  ScoreGroupResultSchema,
  scoreGroupOutputSchema,
} from "@kortyx/telemetry-contracts";
import {
  claimEvaluatorExecution,
  type EvaluatorScope,
  ensureProjectEnvironmentAllowed,
  finishEvaluatorExecution,
  priceEvaluatorUsage,
  type TelemetryDb,
} from "@kortyx/telemetry-db";
import type { UsageTelemetry } from "@kortyx/usage-telemetry";
import { getUsageTelemetry } from "@kortyx/usage-telemetry/node";
import { z } from "zod";
import packageJson from "../../package.json";
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
      const outputSchema = job.snapshot.scoreGroup
        ? scoreGroupOutputSchema(job.snapshot.scoreGroup.definition)
        : JudgeVerdictSchema;
      const output = await models.invoke(
        job.snapshot.definition.model,
        job.renderedMessages,
        signal,
        (value) => {
          usage = value;
        },
        z.toJSONSchema(outputSchema),
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
      phase = "validation";
      const validated = outputSchema.parse(output);
      phase = "persistence";
      const accepted = await finishEvaluatorExecution(db, job.id, owner, {
        status: "completed",
        ...(job.snapshot.scoreGroup
          ? {
              result: ScoreGroupResultSchema.parse({
                group: job.snapshot.scoreGroup,
                fields: validated,
              }),
            }
          : { verdict: JudgeVerdictSchema.parse(validated) }),
        usage,
      });
      measurement?.end(accepted ? "success" : "failed");
    } catch (cause) {
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
          : cause instanceof z.ZodError
            ? `Judge output did not match the configured fields: ${cause.issues
                .slice(0, 3)
                .map(
                  (issue) =>
                    `${issue.path.join(".") || "output"} (${issue.code})`,
                )
                .join(", ")}. Reported usage has been retained.`
            : `Assessment failed during ${phase}. Check the model connection, judge instructions and recorded inputs. Reported usage has been retained.`,
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
