import { z } from "zod";

export const FEEDBACK_FILTERS = ["positive", "negative", "unrated"] as const;
export const FeedbackSummarySchema = z
  .object({
    positive: z.number().int().nonnegative(),
    negative: z.number().int().nonnegative(),
  })
  .strict();

export const FeedbackReasonSchema = z.enum([
  "incorrect",
  "irrelevant",
  "incomplete",
  "unsafe",
  "other",
]);
export const ReviewVerdictSchema = z.enum([
  "correct",
  "partially-correct",
  "incorrect",
]);
const runId = z.string().trim().min(1).max(512);
const actorId = z.string().trim().min(1).max(256);
const comment = z.string().trim().max(4000).nullable().optional();

// This request is server-to-server. The application derives actorId from its
// authenticated user and verifies that the user may rate the requested run.
export const UserFeedbackRequestSchema = z
  .object({
    runId,
    actorId,
    value: z.union([z.literal(0), z.literal(1)]),
    reasons: z.array(FeedbackReasonSchema).max(5).optional(),
    comment,
  })
  .strict();
export const ClearUserFeedbackRequestSchema = UserFeedbackRequestSchema.pick({
  runId: true,
  actorId: true,
});
export const StudioReviewRequestSchema = z
  .object({ value: ReviewVerdictSchema, comment })
  .strict();

const BaseScoreSchema = z
  .object({
    id: z.string().uuid(),
    target: z.object({ type: z.literal("run"), runId }).strict(),
    environment: z.string().min(1),
    name: z.string().min(1),
    source: z.enum(["end-user", "human-review", "evaluator"]),
    actorId,
    reasons: z.array(FeedbackReasonSchema),
    comment: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const StudioScoreSchema = z.discriminatedUnion("dataType", [
  BaseScoreSchema.extend({
    dataType: z.literal("BOOLEAN"),
    value: z.union([z.literal(0), z.literal(1)]),
  }),
  BaseScoreSchema.extend({
    dataType: z.literal("CATEGORICAL"),
    value: z.string(),
  }),
  BaseScoreSchema.extend({
    dataType: z.literal("NUMERIC"),
    value: z.number().finite(),
  }),
]);
export const StudioScoreResponseSchema = z
  .object({ score: StudioScoreSchema })
  .strict();
export const ClearScoreResponseSchema = z
  .object({ ok: z.literal(true) })
  .strict();

export type FeedbackSummary = z.infer<typeof FeedbackSummarySchema>;
export type StudioScore = z.infer<typeof StudioScoreSchema>;
export type UserFeedbackRequest = z.infer<typeof UserFeedbackRequestSchema>;
export type StudioReviewRequest = z.infer<typeof StudioReviewRequestSchema>;

export function summarizeUserFeedback(
  scores: readonly StudioScore[],
): FeedbackSummary {
  const feedback = { positive: 0, negative: 0 };
  for (const score of scores) {
    if (
      score.source !== "end-user" ||
      score.name !== "user-feedback" ||
      score.dataType !== "BOOLEAN"
    )
      continue;
    if (score.value === 1) feedback.positive += 1;
    if (score.value === 0) feedback.negative += 1;
  }
  return feedback;
}
