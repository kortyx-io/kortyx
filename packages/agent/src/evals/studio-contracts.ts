import { PromptSnapshotSchema } from "@kortyx/prompts/browser";
import { z } from "zod";
import {
  EvalIssueSchema,
  EvalJudgeIdentitySchema,
  EvalManifestSchema,
  EvalProgressSchema,
  EvalRunResultSchema,
  EvalSuiteSchema,
} from "./contracts";
import {
  EvalSettingsResponseSchema,
  EvalTerminationSchema,
  ResolvedEvalSettingsSchema,
} from "./settings";
export const StudioEvalTargetsResponseSchema = z.object({
  canRun: z.boolean(),
  settings: EvalSettingsResponseSchema.optional(),
  studioJudge: EvalJudgeIdentitySchema.nullable().optional(),
  targets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      environment: z.string(),
      error: z.string().nullable(),
      // Safe discovery diagnostics; optional for compatibility with older APIs.
      diagnostic: z
        .object({
          code: z.enum([
            "environment_forbidden",
            "environment_unavailable",
            "endpoint_not_found",
            "endpoint_unauthorized",
            "endpoint_http_error",
            "endpoint_unreachable",
            "manifest_invalid",
          ]),
          httpStatus: z.number().int().min(100).max(599).optional(),
        })
        .nullable()
        .optional(),
      manifest: EvalManifestSchema.nullable(),
      revisions: z.record(z.string(), z.string()),
    }),
  ),
});
export const EvalCostAmountSchema = z.object({
  costSummary: z
    .object({
      amounts: z.array(
        z.object({
          amount: z.number().finite().nonnegative(),
          currency: z.string().nullable(),
        }),
      ),
      complete: z.boolean(),
    })
    .optional(),
  amount: z.number().finite().nonnegative().nullable(),
  currency: z.string().nullable(),
  status: z.enum(["complete", "partial", "unavailable"]),
  calls: z.number().int().nonnegative(),
  unpricedCalls: z.number().int().nonnegative(),
  estimated: z.boolean(),
});
export const EvalCostsSchema = z.object({
  workflow: EvalCostAmountSchema,
  judge: EvalCostAmountSchema,
  total: EvalCostAmountSchema,
});
export type EvalCosts = z.infer<typeof EvalCostsSchema>;
export type EvalCostAmount = z.infer<typeof EvalCostAmountSchema>;
export const StudioEvalRunSummarySchema = z.object({
  issue: EvalIssueSchema.nullable().optional(),
  termination: EvalTerminationSchema.nullable().optional(),
  resolvedSettings: ResolvedEvalSettingsSchema.optional(),
  id: z.uuid(),
  evaluationId: z.uuid().nullable().optional(),
  targetId: z.string(),
  targetName: z.string(),
  environment: z.string(),
  suiteId: z.string(),
  suiteRevision: z.string(),
  status: z.enum([
    "queued",
    "running",
    "passed",
    "failed",
    "error",
    "cancelled",
  ]),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  error: z.string().nullable(),
  cancelRequestedAt: z.string().nullable(),
  costs: EvalCostsSchema.optional(),
  counts: z
    .object({
      passed: z.number(),
      failed: z.number(),
      error: z.number(),
      cancelled: z.number(),
    })
    .nullable()
    .optional(),
  suiteName: z.string().nullable().optional(),
  totalAttempts: z.number().int().nonnegative().optional(),
  completedAttempts: z.number().int().nonnegative().optional(),
  phase: z.string().optional(),
});
export const StudioEvalHistorySchema = z.object({
  runs: z.array(StudioEvalRunSummarySchema),
});
export const StudioEvalDetailSchema = z.object({
  run: StudioEvalRunSummarySchema.extend({
    caseVersion: z.string().optional(),
    caseCosts: z.record(z.string(), EvalCostsSchema).optional(),
    request: z
      .object({
        caseIds: z.array(z.string()).optional(),
        grading: z.enum(["app", "studio"]).optional(),
        judge: EvalJudgeIdentitySchema.optional(),
        repetitions: z.number().int().positive(),
        concurrency: z.number().optional(),
        caseTimeoutMs: z.number().optional(),
        runTimeoutMs: z.number().optional(),
        resolvedSettings: ResolvedEvalSettingsSchema.optional(),
        promptSnapshot: PromptSnapshotSchema.optional(),
        promptGroupName: z.string().optional(),
      })
      .optional(),
    suite: EvalSuiteSchema,
    result: EvalRunResultSchema.nullable(),
    events: z.array(z.object({ id: z.number(), event: EvalProgressSchema })),
  }),
});
export type StudioEvalTargets = z.infer<typeof StudioEvalTargetsResponseSchema>;
export type StudioEvalHistory = z.infer<typeof StudioEvalHistorySchema>;
export type StudioEvalDetail = z.infer<typeof StudioEvalDetailSchema>["run"];

export type StudioEvalRunSummary = z.infer<typeof StudioEvalRunSummarySchema>;

/** Table facts only. Conversation inputs, outputs and judge evidence are read separately. */
export const StudioEvalCaseSummarySchema = z.object({
  evidenceVersion: z.string().optional(),
  caseId: z.string(),
  repetition: z.number().int().positive(),
  status: z.string(),
  sessionId: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  completedSteps: z.number().int().nonnegative(),
  criteriaPassed: z.number().int().nonnegative(),
  criteriaTotal: z.number().int().nonnegative(),
  failures: z.array(z.string()),
  errors: z.array(EvalIssueSchema),
  phase: z.string().optional(),
  phaseDurationsMs: z.record(z.string(), z.number()).optional(),
  retryAt: z.string().optional(),
  httpStatus: z.number().optional(),
  costs: EvalCostsSchema.optional(),
});
export type StudioEvalCaseSummary = z.infer<typeof StudioEvalCaseSummarySchema>;
export const StudioEvalLiveStateSchema = StudioEvalRunSummarySchema.extend({
  version: z.string(),
  cases: z.array(StudioEvalCaseSummarySchema),
  errors: z.array(EvalIssueSchema),
});
export const StudioEvalLiveDetailSchema = z.object({
  run: StudioEvalLiveStateSchema.extend({
    suite: EvalSuiteSchema,
    request: StudioEvalDetailSchema.shape.run.shape.request,
  }),
});
export const StudioEvalLiveUpdateSchema = z.object({
  version: z.string(),
  run: StudioEvalLiveStateSchema.nullable(),
});
export type StudioEvalLiveDetail = z.infer<
  typeof StudioEvalLiveDetailSchema
>["run"];
