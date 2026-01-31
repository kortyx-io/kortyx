// Workflow schema definitions for Kortyx.
// This matches the simplified unified workflow schema used by TS/YAML/JSON.

import { z } from "zod";

export const RetrySchema = z
  .object({
    maxAttempts: z.number().int().min(0).optional(),
    delayMs: z.number().int().min(0).optional(),
  })
  .strict();

export const NodeOnErrorSchema = z
  .object({
    mode: z
      .enum(["emit-and-stop", "silent", "emit-and-continue", "rethrow"])
      .optional(),
  })
  .strict();

export const WorkflowNodeBehaviorSchema = z
  .object({
    retry: RetrySchema.optional(),
    onError: NodeOnErrorSchema.optional(),
  })
  .strict();

export type WorkflowNodeBehavior = z.infer<typeof WorkflowNodeBehaviorSchema>;

export const WorkflowNodeDefSchema = z
  .object({
    run: z.union([z.string(), z.function()]),
    params: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
    behavior: WorkflowNodeBehaviorSchema.optional(),
  })
  .strict();

export type WorkflowNodeDef = z.infer<typeof WorkflowNodeDefSchema>;

export const EdgeConditionSchema = z
  .object({
    when: z.string(),
  })
  .strict();

export type WorkflowEdgeCondition = z.infer<typeof EdgeConditionSchema>;

export const WorkflowEdgeSchema = z.union([
  z.tuple([z.string(), z.string()]),
  z.tuple([z.string(), z.string(), EdgeConditionSchema]),
]);

export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowDefinitionSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    description: z.string().optional(),
    nodes: z.record(WorkflowNodeDefSchema),
    edges: z.array(WorkflowEdgeSchema),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export type WorkflowConfig = z.infer<typeof WorkflowDefinitionSchema>;
