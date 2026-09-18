import { z } from "zod";

export const ToolOutcomeSchema = z.enum([
  "success",
  "denied",
  "fault",
  "cancelled",
]);
export const ToolObservationSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(256),
  toolCallId: z.string().min(1),
  attemptId: z.string().min(1),
  callingMode: z.enum(["direct", "model"]),
  executed: z.boolean(),
  outcome: ToolOutcomeSchema.optional(),
  denialCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
    .optional(),
  errorType: z.string().max(256).optional(),
  errorMessage: z.string().max(8192).optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  workflowId: z.string().optional(),
  nodeId: z.string().optional(),
  workflowRevisionId: z.string().optional(),
  runId: z.string().optional(),
  invocationId: z.string().optional(),
  parentInvocationId: z.string().optional(),
  branchId: z.string().optional(),
  observationKind: z.enum(["reused", "waiting"]).optional(),
  suspended: z.boolean().optional(),
  source: z
    .object({
      runId: z.string().optional(),
      invocationId: z.string().optional(),
      branchId: z.string().optional(),
      toolCallId: z.string(),
      attemptId: z.string(),
    })
    .strict()
    .optional(),
});
export type ToolObservation = z.infer<typeof ToolObservationSchema>;

/** Topology contains safe capability descriptions, never executable factories. */
export const WorkflowToolSchema = z
  .object({
    name: z.string().min(1).max(256),
    description: z.string().max(4096).optional(),
    callingMode: z.enum(["direct", "model"]),
    provenance: z.enum(["source", "observed"]),
    inputFields: z
      .array(
        z
          .object({ name: z.string(), type: z.string(), required: z.boolean() })
          .strict(),
      )
      .optional(),
  })
  .strict();
export const ToolDiscoverySchema = z
  .object({
    status: z.enum(["complete", "unresolved"]),
    publishedAt: z.string().datetime().optional(),
    warnings: z.array(z.string()).optional(),
  })
  .strict();

export const StudioToolSchema = WorkflowToolSchema.extend({
  callingMode: z.enum(["direct", "model", "unknown"]),
  calls: z.number().nonnegative(),
  replays: z.number().nonnegative(),
  successes: z.number().nonnegative(),
  denials: z.number().nonnegative(),
  faults: z.number().nonnegative(),
  cancellations: z.number().nonnegative(),
  p50DurationMs: z.number().nonnegative().nullable(),
  p95DurationMs: z.number().nonnegative().nullable(),
}).strict();
export type WorkflowTool = z.infer<typeof WorkflowToolSchema>;
export type StudioTool = z.infer<typeof StudioToolSchema>;
