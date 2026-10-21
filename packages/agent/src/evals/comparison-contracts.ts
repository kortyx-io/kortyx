import { z } from "zod";
import { StudioEvaluationSummarySchema } from "./evaluation-contracts";
import { ResolvedEvalSettingsSchema } from "./settings";
import { EvalCostsSchema } from "./studio-contracts";

/** A bounded read model. Fingerprints compare context without transferring it. */
export const EVAL_COMPARISON_LIMITS = {
  suites: 100,
  attempts: 2_000,
  stepsPerAttempt: 100,
  responseBytes: 2 * 1024 * 1024,
} as const;

export const StudioEvaluationComparisonSchema = z.object({
  run: StudioEvaluationSummarySchema.extend({
    suites: z
      .array(
        z.object({
          id: z.string(),
          suiteId: z.string(),
          name: z.string(),
          targetId: z.string(),
          environment: z.string(),
          status: z.string(),
          resolvedSettings: ResolvedEvalSettingsSchema.optional(),
          judge: z.string().nullable(),
          definitions: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              fingerprint: z.string(),
            }),
          ),
          cases: z.array(
            z.object({
              caseId: z.string(),
              repetition: z.number().int().positive(),
              status: z.string(),
              durationMs: z.number().nonnegative().optional(),
              costs: EvalCostsSchema.optional(),
              contexts: z.array(
                z.object({ index: z.number(), fingerprint: z.string() }),
              ),
            }),
          ),
        }),
      )
      .max(EVAL_COMPARISON_LIMITS.suites),
  }),
});
export type StudioEvaluationComparison = z.infer<
  typeof StudioEvaluationComparisonSchema
>["run"];
