import { z } from "zod";

export const WorkflowHealthSchema = z.enum([
  "healthy",
  "degraded",
  "failing",
  "idle",
]);

export const WorkflowNodeMetricsSchema = z.object({
  runCount: z.number(),
  successRate: z.number().optional(),
  errorRate: z.number().optional(),
  retryCount: z.number().optional(),
  interruptRate: z.number().optional(),
  p50DurationMs: z.number().optional(),
  p95DurationMs: z.number().optional(),
  averageTokens: z.number().optional(),
  averageCost: z.number().optional(),
});

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string().optional(),
  state: z
    .enum(["healthy", "warning", "failed", "interrupted", "retried"])
    .optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  metrics: WorkflowNodeMetricsSchema,
});

export const WorkflowInternalEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  condition: z.string().optional(),
  intent: z.string().optional(),
});

export const WorkflowTransitionSchema = z.object({
  id: z.string(),
  sourceWorkflowId: z.string(),
  sourceNodeId: z.string().optional(),
  targetWorkflowId: z.string(),
  condition: z.string().optional(),
  intent: z.string().optional(),
  volume: z.number(),
  successRate: z.number().optional(),
  medianDurationMs: z.number().optional(),
  errorRate: z.number().optional(),
});

export const WorkflowSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  versions: z.array(z.string()),
  activeVersion: z.string(),
  health: WorkflowHealthSchema,
  tags: z.array(z.string()).optional(),
  lastActivityAt: z.string().optional(),
  metrics: WorkflowNodeMetricsSchema,
  nodes: z.array(WorkflowNodeSchema),
  internalEdges: z.array(WorkflowInternalEdgeSchema),
});

export const WorkflowSystemSchema = z.object({
  workflows: z.array(WorkflowSummarySchema),
  transitions: z.array(WorkflowTransitionSchema),
});

export type WorkflowHealth = z.infer<typeof WorkflowHealthSchema>;
export type WorkflowNodeMetrics = z.infer<typeof WorkflowNodeMetricsSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowInternalEdge = z.infer<typeof WorkflowInternalEdgeSchema>;
export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;
export type WorkflowSummary = z.infer<typeof WorkflowSummarySchema>;
export type WorkflowSystem = z.infer<typeof WorkflowSystemSchema>;
