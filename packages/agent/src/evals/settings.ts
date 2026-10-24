import { z } from "zod";
import { DEFAULT_EVAL_GRADING_TIMEOUT_MS } from "./grading-timeout";

const timeout = z.number().int().min(1).max(2_147_483_647);
export const EvalSettingsSchema = z
  .object({
    repetitions: z.number().int().min(1).max(20).optional(),
    concurrency: z.number().int().min(1).max(20).optional(),
    caseTimeoutMs: timeout.optional(),
    gradingTimeoutMs: timeout.optional(),
    runTimeoutMs: timeout.optional(),
    judge: z.enum(["studio", "app"]).optional(),
  })
  .strict();
export type EvalSettings = z.infer<typeof EvalSettingsSchema>;
export const EvalExecutionSettingsSchema = z
  .object({
    defaults: EvalSettingsSchema.omit({ runTimeoutMs: true, judge: true }),
    limits: z
      .object({
        concurrency: z.number().int().positive().max(20).optional(),
        caseTimeoutMs: timeout.optional(),
        gradingTimeoutMs: timeout.optional(),
      })
      .strict(),
    overrides: z.array(
      z.enum([
        "repetitions",
        "concurrency",
        "caseTimeoutMs",
        "gradingTimeoutMs",
      ]),
    ),
  })
  .strict();
const settingSource = z.enum([
  "run",
  "studio",
  "sdk",
  "sdk-default",
  "studio-default",
]);
export const ResolvedEvalSettingsSchema = z
  .object({
    values: EvalSettingsSchema.required().extend({
      // Historical snapshots predate this setting and used the fixed Studio budget.
      gradingTimeoutMs: timeout.default(DEFAULT_EVAL_GRADING_TIMEOUT_MS),
    }),
    sources: z
      .object({
        repetitions: settingSource,
        concurrency: settingSource,
        caseTimeoutMs: settingSource,
        gradingTimeoutMs: settingSource.default("studio-default"),
        runTimeoutMs: settingSource,
        judge: settingSource,
      })
      .strict(),
  })
  .strict();
export type ResolvedEvalSettings = z.infer<typeof ResolvedEvalSettingsSchema>;
export const EvalSettingsResponseSchema = z.object({
  defaults: EvalSettingsSchema,
  installation: EvalSettingsSchema,
  maxRunTimeoutMs: timeout,
  canEdit: z.boolean(),
});
export const EvalTerminationSchema = z
  .object({
    code: z.enum([
      "EVAL_RUN_TIMEOUT",
      "EVAL_CANCELLED",
      "EVAL_LEASE_LOST",
      "EVAL_EXECUTION_UNKNOWN",
      "EVAL_EXECUTOR_FAILED",
    ]),
    message: z.string(),
    timeoutMs: timeout.optional(),
    phase: z.string().optional(),
    cleanup: z.enum(["signalled", "unknown"]).optional(),
    diagnosticId: z.string().uuid().optional(),
  })
  .strict();
export type EvalTermination = z.infer<typeof EvalTerminationSchema>;

/** Resolve only defined fields. Ceilings never participate in precedence. */
export function resolveEvalSettings(
  overrides: EvalSettings = {},
  studio: EvalSettings = {},
  execution?: z.infer<typeof EvalExecutionSettingsSchema>,
  installation: EvalSettings = {},
  maxRunTimeoutMs = 2_147_483_647,
): ResolvedEvalSettings {
  const values: ResolvedEvalSettings["values"] = {
    repetitions: 1,
    concurrency: 1,
    caseTimeoutMs: 60_000,
    gradingTimeoutMs: DEFAULT_EVAL_GRADING_TIMEOUT_MS,
    runTimeoutMs: 30 * 60_000,
    judge: "studio",
  };
  const sources: ResolvedEvalSettings["sources"] = {
    repetitions: "sdk-default",
    concurrency: "sdk-default",
    caseTimeoutMs: "sdk-default",
    gradingTimeoutMs: "sdk-default",
    runTimeoutMs: "studio-default",
    judge: "studio-default",
  };
  for (const [input, source] of [
    [execution?.defaults ?? {}, "sdk"],
    [installation, "studio"],
    [studio, "studio"],
    [overrides, "run"],
  ] as const) {
    const parsed = EvalSettingsSchema.parse(input);
    for (const key of Object.keys(parsed) as (keyof EvalSettings)[]) {
      if (parsed[key] !== undefined) {
        Object.assign(values, { [key]: parsed[key] });
        sources[key] = source;
      }
    }
  }
  if (values.runTimeoutMs > maxRunTimeoutMs)
    throw new Error(
      `Evaluation timeout exceeds the administrator maximum of ${maxRunTimeoutMs} ms.`,
    );
  for (const key of [
    "concurrency",
    "caseTimeoutMs",
    "gradingTimeoutMs",
  ] as const) {
    const max = execution?.limits[key];
    if (max !== undefined && values[key] > max)
      throw new Error(`${key} exceeds the application maximum of ${max}.`);
  }
  // Old consumers reject unknown request fields. Their case deadline cannot be changed.
  if (
    !execution?.overrides.includes("caseTimeoutMs") &&
    (overrides.caseTimeoutMs !== undefined ||
      studio.caseTimeoutMs !== undefined ||
      installation.caseTimeoutMs !== undefined)
  )
    throw new Error(
      "Update the consumer SDK to support case timeout overrides.",
    );
  if (
    values.judge === "app" &&
    !execution?.overrides.includes("gradingTimeoutMs") &&
    [overrides, studio, installation].some(
      (input) => input.gradingTimeoutMs !== undefined,
    )
  )
    throw new Error(
      "Update the consumer SDK to support App grading timeout overrides.",
    );
  return { values, sources };
}
