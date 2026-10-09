import { z } from "zod";
import { EvalEvidencePolicySchema } from "./evidence-policy";
import type { EvalSuite } from "./types";

const id = z.string().trim().min(1).max(256);
const handler = z.object({ using: id, params: z.json().optional() }).strict();
export const EvalResumeResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }).strict(),
  z.object({ type: z.literal("select"), ids: z.array(z.string()) }).strict(),
  z.object({ type: z.literal("value"), value: z.json() }).strict(),
  z.object({ type: z.literal("cancel") }).strict(),
]);
const expectation = z
  .object({
    type: z.enum(["answer", "interrupt"]),
    schemaId: id.optional(),
    schemaVersion: id.optional(),
    outputs: z
      .array(z.object({ schemaId: id, schemaVersion: id.optional() }).strict())
      .optional(),
    criteria: z
      .array(
        z.union([
          z.string().trim().min(1),
          z.object({ id, text: z.string().trim().min(1) }).strict(),
        ]),
      )
      .optional(),
    reference: z.json().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === "answer" && (value.schemaId || value.schemaVersion))
      ctx.addIssue({
        code: "custom",
        message: "Interrupt schemas require an interrupt expectation.",
      });
    const ids =
      value.criteria?.map((item, index) =>
        typeof item === "string" ? String(index) : item.id,
      ) ?? [];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Criterion IDs must be unique within a step.",
      });
  });
export const EvalSuiteSchema = z
  .object({
    evidence: EvalEvidencePolicySchema.optional(),
    id,
    name: z.string().optional(),
    cases: z
      .array(
        z
          .object({
            id,
            name: z.string().optional(),
            params: z.json().optional(),
            workflowId: id.optional(),
            steps: z
              .array(
                z.union([
                  z
                    .object({ message: z.string().min(1), expect: expectation })
                    .strict(),
                  z
                    .object({
                      resume: z.union([EvalResumeResponseSchema, handler]),
                      expect: expectation,
                    })
                    .strict(),
                ]),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export const EvalVerdictSchema = z
  .object({
    passed: z.boolean(),
    reason: z.string().trim().min(1),
    evidence: z.array(z.string().min(1)),
  })
  .strict();
export const EvalObservationSchema = z
  .object({
    type: z.enum(["answer", "interrupt", "error", "cancelled"]),
    text: z.string(),
    structured: z.array(z.json()),
    events: z.array(z.json()).optional(),
    runId: z.string().optional(),
    checkpointId: z.string().optional(),
    interrupt: z
      .object({
        requestId: z.string(),
        kind: z.enum(["text", "choice", "multi-choice", "custom"]),
        question: z.string().optional(),
        schemaId: z.string().optional(),
        schemaVersion: z.string().optional(),
        options: z.array(
          z
            .object({
              id: z.string(),
              label: z.string(),
              description: z.string().optional(),
            })
            .strict(),
        ),
        request: z.json().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.type === "interrupt") !== Boolean(value.interrupt))
      ctx.addIssue({
        code: "custom",
        message: "Interrupt observations require exactly one interrupt.",
      });
  });

const status = z.enum(["passed", "failed", "error", "cancelled", "ungraded"]);
const issue = z
  .object({
    phase: z.enum([
      "params",
      "setup",
      "execute",
      "responder",
      "reference",
      "grading",
      "cleanup",
      "reporting",
    ]),
    code: z.string(),
    message: z.string(),
  })
  .strict();
/** Billing evidence only: no prompts, provider raw responses, or credentials. */
export const EvalJudgeUsageSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    occurredAt: z.iso.datetime(),
    usage: z
      .object({
        input: z.number().finite().nonnegative().optional(),
        output: z.number().finite().nonnegative().optional(),
        total: z.number().finite().nonnegative().optional(),
        reasoning: z.number().finite().nonnegative().optional(),
        cacheRead: z.number().finite().nonnegative().optional(),
        cacheWrite: z.number().finite().nonnegative().optional(),
        cacheWrite1h: z.number().finite().nonnegative().optional(),
        outputIncludesReasoning: z.boolean().optional(),
        inputIncludesCacheRead: z.boolean().optional(),
        inputIncludesCacheWrite: z.boolean().optional(),
      })
      .strict()
      .optional(),
    pricingContext: z
      .object({
        serviceTier: z.string().min(1).max(100).optional(),
        inferenceGeo: z.string().min(1).max(100).optional(),
        speed: z.string().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
    pricing: z
      .object({
        source: z.literal("provider"),
        currency: z.literal("USD"),
        actualCostMicros: z.number().int().nonnegative().safe(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const EvalStepResultSchema = z
  .object({
    evidence: z
      .object({
        version: z.literal("compact-v1"),
        history: z.boolean(),
        observation: EvalObservationSchema,
      })
      .strict()
      .optional(),
    index: z.number().int().nonnegative(),
    input: z.union([
      z.object({ message: z.string() }).strict(),
      z.object({ resume: EvalResumeResponseSchema }).strict(),
    ]),
    expectation,
    observation: EvalObservationSchema,
    reference: z.json().optional(),
    status,
    reason: z.string().optional(),
    judgeCalls: z.number().int().nonnegative().optional(),
    judgeUsage: z.array(EvalJudgeUsageSchema).optional(),
    criteria: z.array(
      EvalVerdictSchema.extend({ id: z.string(), text: z.string() }),
    ),
  })
  .strict();
const runtimeExecution = z
  .object({ sessionId: z.string().min(1), runId: z.string().min(1) })
  .strict();
export const EvalCaseResultSchema = z
  .object({
    caseId: id,
    repetition: z.number().int().positive(),
    attemptId: z.uuid().optional(),
    runtimeExecutions: z.array(runtimeExecution).optional(),
    sessionId: z.string(),
    status,
    durationMs: z.number().nonnegative(),
    steps: z.array(EvalStepResultSchema),
    errors: z.array(issue),
  })
  .strict();
export const EvalJudgeIdentitySchema = z
  .object({
    id,
    version: id,
    location: z.enum(["app", "studio"]).optional(),
  })
  .strict();
const judge = EvalJudgeIdentitySchema;
export const StudioEvalJudgeRequestSchema = z
  .object({
    environment: id,
    judge: EvalJudgeIdentitySchema,
    criterion: z
      .object({ id, text: z.string().trim().min(1).max(16_384) })
      .strict(),
    input: EvalStepResultSchema.shape.input,
    observation: EvalObservationSchema,
    reference: z.json().optional(),
    conversation: z.array(EvalStepResultSchema).max(100),
  })
  .strict();
export const StudioEvalJudgeResponseSchema = z
  .object({
    judge: EvalJudgeIdentitySchema,
    verdict: EvalVerdictSchema,
    usage: z.array(EvalJudgeUsageSchema).optional(),
  })
  .strict();
export const EvalRunResultSchema = z
  .object({
    id: z.uuid(),
    suiteId: id,
    suiteRevision: z.string().regex(/^[a-f0-9]{64}$/),
    suite: EvalSuiteSchema,
    judge: judge.optional(),
    startedAt: z.iso.datetime(),
    durationMs: z.number().nonnegative(),
    status,
    counts: z
      .object({
        passed: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        error: z.number().int().nonnegative(),
        cancelled: z.number().int().nonnegative(),
        ungraded: z.number().int().nonnegative().optional(),
      })
      .strict(),
    cases: z.array(EvalCaseResultSchema),
    errors: z.array(issue),
  })
  .strict();
export const EvalManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    studioJudging: z.literal(true).optional(),
    attemptScheduling: z.literal(true).optional(),
    suites: z.array(EvalSuiteSchema),
    responders: z.array(
      z
        .object({
          name: id,
          schemaId: id.optional(),
          schemaVersion: id.optional(),
        })
        .strict(),
    ),
    references: z.array(id),
    paramsSchema: z.record(z.string(), z.unknown()).optional(),
    judge: judge.optional(),
  })
  .strict();
export const EvalProgressSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("case-runtime-associated"),
      caseId: id,
      repetition: z.number().int().positive(),
      attemptId: z.uuid(),
      execution: runtimeExecution,
    })
    .strict(),
  z
    .object({
      type: z.literal("run-started"),
      caseIds: z.array(id).min(1),
      repetitions: z.number().int().positive(),
      concurrency: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("case-progress"),
      caseId: id,
      repetition: z.number().int().positive(),
      phase: issue.shape.phase,
      stepIndex: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("case-started"),
      attemptId: z.uuid().optional(),
      caseId: id,
      repetition: z.number().int().positive(),
      sessionId: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("step-completed"),
      caseId: id,
      repetition: z.number().int().positive(),
      step: EvalStepResultSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("case-completed"), result: EvalCaseResultSchema })
    .strict(),
]);
export const EvalRemoteRunRequestSchema = z
  .object({
    suiteId: id,
    suiteRevision: z.string().regex(/^[a-f0-9]{64}$/),
    grading: z.enum(["app", "studio"]).optional(),
    judge: EvalJudgeIdentitySchema.optional(),
    caseIds: z.array(id).min(1).max(100).optional(),
    repetitions: z.number().int().min(1).max(20).default(1),
    concurrency: z.number().int().min(1).max(20).default(1),
    attempt: z
      .object({
        caseId: id,
        repetition: z.number().int().min(1).max(20),
        evaluationId: z.uuid(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const StudioEvalStartRequestSchema = EvalRemoteRunRequestSchema.omit({
  grading: true,
  judge: true,
  attempt: true,
}).extend({
  targetId: z.string().min(1).max(128),
  judge: z.enum(["studio", "app"]).default("studio"),
});
export const EvalWireEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), event: EvalProgressSchema }).strict(),
  z.object({ type: z.literal("result"), result: EvalRunResultSchema }).strict(),
  z.object({ type: z.literal("error"), message: z.string() }).strict(),
]);
export type EvalManifest = z.infer<typeof EvalManifestSchema>;
export type EvalRemoteRunRequest = z.infer<typeof EvalRemoteRunRequestSchema>;
export type EvalWireEvent = z.infer<typeof EvalWireEventSchema>;

export class EvalConfigurationError extends Error {
  override name = "EvalConfigurationError";
}

export function parseEvalSuite(value: unknown): EvalSuite {
  const result = EvalSuiteSchema.safeParse(value);
  if (!result.success)
    throw new EvalConfigurationError(
      "Invalid suite. Expected serializable cases, conversation steps, and expectations.",
    );
  const ids = result.data.cases.map((item) => item.id);
  if (new Set(ids).size !== ids.length)
    throw new EvalConfigurationError("Case IDs must be unique within a suite.");
  for (const item of result.data.cases) {
    let waiting = false;
    for (const step of item.steps) {
      if ("resume" in step !== waiting)
        throw new EvalConfigurationError(
          "A resume step must follow an expected interrupt; a message must follow an answer.",
        );
      waiting = step.expect.type === "interrupt";
    }
  }
  return result.data as EvalSuite;
}
