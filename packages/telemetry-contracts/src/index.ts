import { z } from "zod";
export const TELEMETRY_EVENT_TYPES = [
  "span.started",
  "span.ended",
  "span.failed",
  "generation.completed",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "interrupt.created",
  "interrupt.resolved",
  "interrupt.expired",
  "interrupt.cancelled",
  "run.cancelled",
  "workflow.transitioned",
  "session.checkpointed",
  "session.forked",
  "session.rolled_back",
] as const;
export const TelemetryServiceSchema = z
  .object({
    name: z.string().min(1),
    deploymentRef: z.string().min(1).optional(),
  })
  .strict();
export const WorkflowTopologyNodeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().optional(),
    type: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export const WorkflowTopologyEdgeSchema = z
  .object({
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    condition: z.string().optional(),
  })
  .strict();
export const EnsureWorkflowTopologyRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: z.string().min(1),
    service: TelemetryServiceSchema,
    workflow: z
      .object({
        id: z.string().min(1),
        declaredVersion: z.string().min(1),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        topologyHash: z.string().regex(/^[a-f0-9]{64}$/),
        nodes: z.array(WorkflowTopologyNodeSchema),
        edges: z.array(WorkflowTopologyEdgeSchema),
      })
      .strict(),
  })
  .strict();
export const EnsureWorkflowTopologyResponseSchema = z
  .object({ workflowRevisionId: z.string().min(1), created: z.boolean() })
  .strict();
export const TelemetryEventTypeSchema = z.enum(TELEMETRY_EVENT_TYPES);
export const TelemetryEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().min(1),
    occurredAt: z.string().datetime({ offset: true }),
    environment: z.string().min(1),
    service: TelemetryServiceSchema,
    correlation: z
      .object({
        traceId: z.string().optional(),
        spanId: z.string().optional(),
        parentSpanId: z.string().optional(),
        runId: z.string().min(1),
        sessionId: z.string().optional(),
        workflowId: z.string().min(1),
        workflowRevisionId: z.string().optional(),
        topologyHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        nodeId: z.string().optional(),
      })
      .strict(),
    context: z
      .object({
        userId: z.string().optional(),
        tenantId: z.string().optional(),
        tags: z.array(z.string()).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .optional(),
    type: TelemetryEventTypeSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export const TelemetryEventBatchSchema = z
  .object({ events: z.array(TelemetryEventSchema).min(1) })
  .strict();
export type KortyxTelemetryService = z.infer<typeof TelemetryServiceSchema>;
export type KortyxWorkflowTopologyNode = z.infer<
  typeof WorkflowTopologyNodeSchema
>;
export type KortyxWorkflowTopologyEdge = z.infer<
  typeof WorkflowTopologyEdgeSchema
>;
export type EnsureWorkflowTopologyRequest = z.infer<
  typeof EnsureWorkflowTopologyRequestSchema
>;
export type EnsureWorkflowTopologyResponse = z.infer<
  typeof EnsureWorkflowTopologyResponseSchema
>;
export type KortyxTelemetryEventType = z.infer<typeof TelemetryEventTypeSchema>;
export type KortyxTelemetryEvent = z.infer<typeof TelemetryEventSchema>;
