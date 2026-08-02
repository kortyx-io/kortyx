import { z } from "zod";

export const InterruptStatusSchema = z.enum([
  "pending",
  "resolved",
  "expired",
  "failed",
  "cancelled",
]);
export const InterruptTypeSchema = z.enum([
  "choice",
  "multi-choice",
  "text",
  "unknown",
]);
export const InterruptInteractionModeSchema = z.enum([
  "static-options",
  "dynamic-picker",
  "freeform",
  "unknown",
]);
export const InterruptOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().nullable(),
});
export const ResumeOutcomeSchema = z.enum([
  "resumed",
  "resume failed",
  "expired before resume",
  "cancelled",
]);
export const InterruptSortKeySchema = z.enum([
  "priority",
  "created",
  "age",
  "status",
]);
const EnvironmentSchema = z.string();

export const InterruptSchema = z.object({
  id: z.string(),
  status: InterruptStatusSchema,
  type: InterruptTypeSchema,
  interactionMode: InterruptInteractionModeSchema,
  schemaId: z.string().optional(),
  schemaVersion: z.string().optional(),
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  question: z.string(),
  optionCount: z.number().optional(),
  options: z.array(InterruptOptionSchema).optional(),
  workflow: z.string(),
  node: z.string(),
  session: z.string(),
  user: z.string().optional(),
  tenant: z.string().optional(),
  response: z.string().optional(),
  responseCaptured: z.boolean(),
  resumeOutcome: ResumeOutcomeSchema.optional(),
  resumeError: z.string().optional(),
  runId: z.string(),
  resumeToken: z.string(),
  resolvedBy: z.string().optional(),
  environment: EnvironmentSchema,
});

export type InterruptStatus = z.infer<typeof InterruptStatusSchema>;
export type InterruptType = z.infer<typeof InterruptTypeSchema>;
export type InterruptInteractionMode = z.infer<
  typeof InterruptInteractionModeSchema
>;
export type ResumeOutcome = z.infer<typeof ResumeOutcomeSchema>;
export type InterruptSortKey = z.infer<typeof InterruptSortKeySchema>;
export type Interrupt = z.infer<typeof InterruptSchema>;
