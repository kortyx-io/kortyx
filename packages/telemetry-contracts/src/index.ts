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
export const WorkflowTopologyTransitionSchema = z
  .object({
    sourceNodeId: z.string().min(1).optional(),
    targetWorkflowId: z.string().min(1),
    condition: z.string().optional(),
    intent: z.string().optional(),
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
        transitions: z.array(WorkflowTopologyTransitionSchema).optional(),
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
export const TelemetryEventBatchResponseSchema = z
  .object({
    accepted: z.number().int().nonnegative(),
    inserted: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
  })
  .strict();
export const TelemetryPricingSourceSchema = z.enum([
  "sdk",
  "provider",
  "custom",
  "project-rate-card",
  "default-rate-card",
]);
export const TelemetryPricingUnitSchema = z.enum([
  "token",
  "character",
  "request",
  "image",
  "audio_second",
  "audio_minute",
  "video_second",
  "video_minute",
  "second",
  "minute",
  "custom",
]);
export const TelemetryPricingUsageTypeSchema = z.enum([
  "input",
  "output",
  "reasoning",
  "cache_read",
  "cache_write",
  "embedding",
  "image_input",
  "image_output",
  "audio_input",
  "audio_output",
  "video_input",
  "video_output",
  "request",
  "custom",
]);
export const TelemetryUsageItemSchema = z
  .object({
    usageType: TelemetryPricingUsageTypeSchema,
    quantity: z.number().nonnegative(),
    unit: TelemetryPricingUnitSchema,
    label: z.string().optional(),
  })
  .strict();
export const TelemetryUnitPriceSchema = z
  .object({
    usageType: TelemetryPricingUsageTypeSchema,
    unit: TelemetryPricingUnitSchema,
    unitQuantity: z.number().positive().default(1),
    priceMicros: z.number().int().nonnegative(),
    label: z.string().optional(),
  })
  .strict();
export const TelemetryPricingLineItemSchema = z
  .object({
    usageType: TelemetryPricingUsageTypeSchema,
    quantity: z.number().nonnegative(),
    unit: TelemetryPricingUnitSchema,
    unitQuantity: z.number().positive().default(1),
    unitPriceMicros: z.number().int().nonnegative().optional(),
    totalCostMicros: z.number().int().nonnegative().optional(),
    label: z.string().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.totalCostMicros !== undefined ||
      value.unitPriceMicros !== undefined,
    "line item requires totalCostMicros or unitPriceMicros",
  );
export const TelemetryPricingHintSchema = z
  .object({
    source: TelemetryPricingSourceSchema.extract(["sdk", "provider", "custom"]),
    currency: z.string().min(3).max(12).default("USD"),
    actualCostMicros: z.number().int().nonnegative().optional(),
    lineItems: z.array(TelemetryPricingLineItemSchema).optional(),
    unitPrices: z.array(TelemetryUnitPriceSchema).optional(),
    usageItems: z.array(TelemetryUsageItemSchema).optional(),
    pricingRef: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type KortyxTelemetryService = z.infer<typeof TelemetryServiceSchema>;
export type KortyxWorkflowTopologyNode = z.infer<
  typeof WorkflowTopologyNodeSchema
>;
export type KortyxWorkflowTopologyEdge = z.infer<
  typeof WorkflowTopologyEdgeSchema
>;
export type KortyxWorkflowTopologyTransition = z.infer<
  typeof WorkflowTopologyTransitionSchema
>;
export type EnsureWorkflowTopologyRequest = z.infer<
  typeof EnsureWorkflowTopologyRequestSchema
>;
export type EnsureWorkflowTopologyResponse = z.infer<
  typeof EnsureWorkflowTopologyResponseSchema
>;
export type KortyxTelemetryEventType = z.infer<typeof TelemetryEventTypeSchema>;
export type KortyxTelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type TelemetryEventBatch = z.infer<typeof TelemetryEventBatchSchema>;
export type TelemetryEventBatchResponse = z.infer<
  typeof TelemetryEventBatchResponseSchema
>;
export type TelemetryPricingSource = z.infer<
  typeof TelemetryPricingSourceSchema
>;
export type TelemetryPricingUnit = z.infer<typeof TelemetryPricingUnitSchema>;
export type TelemetryPricingUsageType = z.infer<
  typeof TelemetryPricingUsageTypeSchema
>;
export type TelemetryUsageItem = z.infer<typeof TelemetryUsageItemSchema>;
export type TelemetryUnitPrice = z.infer<typeof TelemetryUnitPriceSchema>;
export type TelemetryPricingLineItem = z.infer<
  typeof TelemetryPricingLineItemSchema
>;
export type TelemetryPricingHint = z.infer<typeof TelemetryPricingHintSchema>;

export const StudioRunStatusSchema = z.enum([
  "running",
  "completed",
  "interrupted",
  "incomplete",
  "failed",
  "cancelled",
]);
export const STUDIO_TIME_RANGES = [
  "Last hour",
  "24 hours",
  "7 days",
  "30 days",
  "All time",
  "Custom range",
] as const;
export const StudioTimeRangeSchema = z.enum(STUDIO_TIME_RANGES);
export const StudioTimeRangeQuerySchema = z
  .object({
    range: StudioTimeRangeSchema.optional(),
    startedAfter: z.string().optional(),
    startedBefore: z.string().optional(),
  })
  .strict();
export const StudioTimeRangeContextSchema = z
  .object({
    range: StudioTimeRangeSchema,
    startedAfter: z.string().datetime({ offset: true }).nullable(),
    startedBefore: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export type StudioTimeRangeResolution =
  | {
      ok: true;
      value: z.infer<typeof StudioTimeRangeContextSchema>;
    }
  | {
      ok: false;
      error: string;
    };

const STUDIO_TIME_RANGE_MILLISECONDS: Partial<
  Record<z.infer<typeof StudioTimeRangeSchema>, number>
> = {
  "Last hour": 60 * 60 * 1_000,
  "24 hours": 24 * 60 * 60 * 1_000,
  "7 days": 7 * 24 * 60 * 60 * 1_000,
  "30 days": 30 * 24 * 60 * 60 * 1_000,
};

const parseIsoBoundary = (
  value: string | undefined,
  label: string,
): { ok: true; date: Date } | { ok: false; error: string } => {
  if (!value) {
    return { ok: false, error: `${label} is required for a custom range.` };
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return {
      ok: false,
      error: `${label} must include an explicit UTC offset.`,
    };
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? { ok: true, date }
    : { ok: false, error: `${label} must be a valid ISO date and time.` };
};

/**
 * Resolves Studio time filters into absolute UTC boundaries.
 *
 * Relative presets are evaluated against `now`. Custom boundaries must be
 * complete ISO timestamps with an explicit offset and are normalized to UTC.
 */
export const resolveStudioTimeRange = (
  input: {
    range?: string | undefined;
    startedAfter?: string | undefined;
    startedBefore?: string | undefined;
  },
  now = new Date(),
): StudioTimeRangeResolution => {
  const parsedRange = StudioTimeRangeSchema.safeParse(
    input.range || "24 hours",
  );
  if (!parsedRange.success) {
    return {
      ok: false,
      error: `Unknown time range "${input.range}".`,
    };
  }
  if (!Number.isFinite(now.getTime())) {
    return { ok: false, error: "The time range reference date is invalid." };
  }
  const range = parsedRange.data;
  if (range === "All time") {
    return {
      ok: true,
      value: { range, startedAfter: null, startedBefore: null },
    };
  }
  if (range === "Custom range") {
    const after = parseIsoBoundary(input.startedAfter, "Start time");
    if ("error" in after) return { ok: false, error: after.error };
    const before = parseIsoBoundary(input.startedBefore, "End time");
    if ("error" in before) return { ok: false, error: before.error };
    if (after.date.getTime() >= before.date.getTime()) {
      return {
        ok: false,
        error: "Start time must be before end time.",
      };
    }
    return {
      ok: true,
      value: {
        range,
        startedAfter: after.date.toISOString(),
        startedBefore: before.date.toISOString(),
      },
    };
  }
  const duration = STUDIO_TIME_RANGE_MILLISECONDS[range];
  if (!duration) {
    return { ok: false, error: `Unknown time range "${range}".` };
  }
  return {
    ok: true,
    value: {
      range,
      startedAfter: new Date(now.getTime() - duration).toISOString(),
      startedBefore: now.toISOString(),
    },
  };
};
export const StudioInterruptStatusSchema = z.enum([
  "pending",
  "resolved",
  "expired",
  "failed",
  "cancelled",
]);
export const resolveStudioInterruptStatus = (
  input: {
    status: z.infer<typeof StudioInterruptStatusSchema>;
    expiresAt?: string | null | undefined;
  },
  now: Date | number = Date.now(),
): z.infer<typeof StudioInterruptStatusSchema> => {
  if (input.status !== "pending" || !input.expiresAt) return input.status;
  const expiresAt = Date.parse(input.expiresAt);
  const nowMs = typeof now === "number" ? now : now.getTime();
  return Number.isFinite(expiresAt) &&
    Number.isFinite(nowMs) &&
    expiresAt <= nowMs
    ? "expired"
    : input.status;
};
export const StudioInterruptTypeSchema = z.enum([
  "choice",
  "multi-choice",
  "text",
  "unknown",
]);
export const StudioInterruptInteractionModeSchema = z.enum([
  "static-options",
  "dynamic-picker",
  "freeform",
  "unknown",
]);
export const StudioInterruptOptionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().nullable(),
  })
  .strict();
export const StudioResumeOutcomeSchema = z.enum([
  "resumed",
  "resume failed",
  "expired before resume",
  "cancelled",
]);
export const StudioWorkflowHealthSchema = z.enum([
  "unknown",
  "healthy",
  "degraded",
  "failing",
  "idle",
]);
export const StudioPricingStatusSchema = z.enum([
  "priced",
  "unpriced",
  "unknown",
]);
export const StudioPricingSourceSchema =
  TelemetryPricingSourceSchema.nullable();
export const StudioChangeResourceSchema = z.enum([
  "runs",
  "sessions",
  "interrupts",
]);
export const StudioChangeSchema = z
  .object({
    schemaVersion: z.literal(1),
    changeId: z.string().min(1),
    emittedAt: z.string().datetime({ offset: true }),
    organizationId: z.string().min(1),
    projectId: z.string().min(1),
    resources: z.array(StudioChangeResourceSchema).min(1),
  })
  .strict();
export const StudioMetricSchema = z
  .object({
    runCount: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(100).nullable(),
    errorRate: z.number().min(0).max(100).nullable(),
    retryCount: z.number().int().nonnegative().nullable(),
    interruptRate: z.number().min(0).max(100).nullable(),
    p50DurationMs: z.number().nonnegative().nullable(),
    p95DurationMs: z.number().nonnegative().nullable(),
    averageTokens: z.number().nonnegative().nullable(),
    averageCost: z.number().nonnegative().nullable(),
    currency: z.string().nullable(),
  })
  .strict();
export const StudioRunSchema = z
  .object({
    id: z.string().min(1),
    status: StudioRunStatusSchema,
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }).nullable(),
    workflowId: z.string().min(1),
    workflowIds: z.array(z.string().min(1)),
    workflowRefs: z.array(
      z
        .object({
          workflowId: z.string().min(1),
          workflowRevisionId: z.string().nullable(),
          declaredVersion: z.string().nullable(),
        })
        .strict(),
    ),
    workflowRevisionId: z.string().nullable(),
    declaredVersion: z.string().nullable(),
    transitionIds: z.array(z.string().min(1)),
    path: z.array(z.string()),
    sessionId: z.string().nullable(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    models: z.array(z.string()),
    durationMs: z.number().nonnegative().nullable(),
    tokens: z.number().int().nonnegative().nullable(),
    cost: z.number().nonnegative().nullable(),
    pricingStatus: StudioPricingStatusSchema,
    pricingSource: StudioPricingSourceSchema,
    currency: z.string().nullable(),
    result: z.string().nullable(),
    environment: z.string().min(1),
    userId: z.string().nullable(),
    tenantId: z.string().nullable(),
    hasTool: z.boolean(),
    hasRetry: z.boolean(),
    interruptNodeId: z.string().nullable(),
    interruptId: z.string().nullable().optional(),
    interruptStatus: StudioInterruptStatusSchema.nullable().optional(),
    interruptExpiresAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
  })
  .strict();
export const StudioSessionSchema = z
  .object({
    id: z.string().min(1),
    status: StudioRunStatusSchema,
    lastActivityAt: z.string().datetime({ offset: true }),
    workflowIds: z.array(z.string()),
    workflowCount: z.number().int().nonnegative(),
    activeWorkflowId: z.string().nullable(),
    activeVersion: z.string().nullable(),
    userId: z.string().nullable(),
    tenantId: z.string().nullable(),
    runs: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    interrupted: z.number().int().nonnegative(),
    checkpoints: z.number().int().nonnegative(),
    hasFork: z.boolean(),
    durationMs: z.number().nonnegative().nullable(),
    tokens: z.number().int().nonnegative().nullable(),
    cost: z.number().nonnegative().nullable(),
    pricingStatus: StudioPricingStatusSchema,
    pricingSource: StudioPricingSourceSchema,
    currency: z.string().nullable(),
    latestResult: z.string().nullable(),
    latestError: z.string().nullable(),
    pendingInterruptId: z.string().nullable(),
    interruptStatus: StudioInterruptStatusSchema.nullable().optional(),
    interruptExpiresAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
    providers: z.array(z.string()),
    models: z.array(z.string()),
    tags: z.array(z.string()),
    environment: z.string().min(1),
  })
  .strict();
export const StudioInterruptSchema = z
  .object({
    id: z.string().min(1),
    status: StudioInterruptStatusSchema,
    type: StudioInterruptTypeSchema,
    interactionMode: StudioInterruptInteractionModeSchema,
    schemaId: z.string().nullable(),
    schemaVersion: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    resolvedAt: z.string().datetime({ offset: true }).nullable(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    question: z.string().nullable(),
    contentCaptured: z.boolean(),
    optionCount: z.number().int().nonnegative().nullable(),
    options: z.array(StudioInterruptOptionSchema).nullable(),
    workflowId: z.string().min(1),
    nodeId: z.string().nullable(),
    sessionId: z.string().nullable(),
    userId: z.string().nullable(),
    tenantId: z.string().nullable(),
    response: z.string().nullable(),
    responseCaptured: z.boolean(),
    resumeOutcome: StudioResumeOutcomeSchema.nullable(),
    resumeError: z.string().nullable(),
    runId: z.string().min(1),
    resumeToken: z.string().nullable(),
    resolvedBy: z.string().nullable(),
    environment: z.string().min(1),
  })
  .strict();
export const StudioDetailEventSchema = z
  .object({
    id: z.string().min(1),
    type: TelemetryEventTypeSchema,
    occurredAt: z.string().datetime({ offset: true }),
    receivedAt: z.string().datetime({ offset: true }),
    environment: z.string().min(1),
    serviceName: z.string().min(1),
    deploymentRef: z.string().nullable(),
    traceId: z.string().nullable(),
    spanId: z.string().nullable(),
    parentSpanId: z.string().nullable(),
    runId: z.string().min(1),
    sessionId: z.string().nullable(),
    workflowId: z.string().min(1),
    workflowRevisionId: z.string().nullable(),
    nodeId: z.string().nullable(),
    userId: z.string().nullable(),
    tenantId: z.string().nullable(),
    tags: z.array(z.string()),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export const StudioWorkflowNodeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string(),
    type: z.string().nullable(),
    state: z
      .enum(["healthy", "warning", "failed", "interrupted", "retried"])
      .nullable(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    metrics: StudioMetricSchema,
  })
  .strict();
export const StudioWorkflowInternalEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    condition: z.string().nullable(),
  })
  .strict();
export const StudioWorkflowTransitionSchema = z
  .object({
    id: z.string().min(1),
    sourceWorkflowId: z.string().min(1),
    sourceNodeId: z.string().nullable(),
    targetWorkflowId: z.string().min(1),
    condition: z.string().nullable(),
    volume: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(100).nullable(),
    medianDurationMs: z.number().nonnegative().nullable(),
    errorRate: z.number().min(0).max(100).nullable(),
  })
  .strict();
export const StudioWorkflowSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable(),
    versions: z.array(z.string()),
    activeVersion: z.string().nullable(),
    activeRevisionId: z.string().nullable(),
    health: StudioWorkflowHealthSchema,
    tags: z.array(z.string()),
    lastActivityAt: z.string().datetime({ offset: true }).nullable(),
    metrics: StudioMetricSchema,
    nodes: z.array(StudioWorkflowNodeSchema),
    internalEdges: z.array(StudioWorkflowInternalEdgeSchema),
  })
  .strict();
export const StudioRunsResponseSchema = z
  .object({
    runs: z.array(StudioRunSchema),
    totalCount: z.number().int().nonnegative(),
  })
  .strict();
export const StudioSessionsResponseSchema = z
  .object({
    sessions: z.array(StudioSessionSchema),
    totalCount: z.number().int().nonnegative(),
  })
  .strict();
export const StudioInterruptsResponseSchema = z
  .object({
    interrupts: z.array(StudioInterruptSchema),
    totalCount: z.number().int().nonnegative(),
  })
  .strict();
export const StudioRunDetailResponseSchema = z
  .object({
    run: StudioRunSchema,
    events: z.array(StudioDetailEventSchema),
    session: StudioSessionSchema.nullable(),
    interrupts: z.array(StudioInterruptSchema),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const StudioSessionDetailResponseSchema = z
  .object({
    session: StudioSessionSchema,
    runs: z.array(StudioRunSchema),
    events: z.array(StudioDetailEventSchema),
    interrupts: z.array(StudioInterruptSchema),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const StudioInterruptDetailResponseSchema = z
  .object({
    interrupt: StudioInterruptSchema,
    events: z.array(StudioDetailEventSchema),
    run: StudioRunSchema.nullable(),
    session: StudioSessionSchema.nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const StudioWorkflowsResponseSchema = z
  .object({
    workflows: z.array(StudioWorkflowSchema),
    transitions: z.array(StudioWorkflowTransitionSchema),
    cohort: StudioTimeRangeContextSchema.extend({
      workflowId: z.string().nullable(),
      version: z.string().nullable(),
    }).strict(),
  })
  .strict();
export const StudioCatalogsResponseSchema = z
  .object({
    environments: z.array(z.string()),
    providers: z.array(z.string()),
    models: z.array(z.string()),
    workflows: z.array(z.string()),
    tags: z.array(z.string()),
  })
  .strict();
export const StudioContextResponseSchema = z
  .object({
    organization: z
      .object({
        name: z.string().min(1),
      })
      .strict(),
    project: z
      .object({
        name: z.string().min(1),
      })
      .strict(),
    environments: z.array(z.string()),
    apiKey: z
      .object({
        mode: z.enum(["test", "live"]),
        scopes: z.array(z.string()),
      })
      .strict(),
    api: z
      .object({
        status: z.literal("ok"),
        service: z.literal("kortyx-api"),
        version: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type StudioRunStatus = z.infer<typeof StudioRunStatusSchema>;
export type StudioTimeRange = z.infer<typeof StudioTimeRangeSchema>;
export type StudioTimeRangeContext = z.infer<
  typeof StudioTimeRangeContextSchema
>;
export type StudioInterruptStatus = z.infer<typeof StudioInterruptStatusSchema>;
export type StudioInterruptType = z.infer<typeof StudioInterruptTypeSchema>;
export type StudioInterruptInteractionMode = z.infer<
  typeof StudioInterruptInteractionModeSchema
>;
export type StudioInterruptOption = z.infer<typeof StudioInterruptOptionSchema>;
export type StudioResumeOutcome = z.infer<typeof StudioResumeOutcomeSchema>;
export type StudioWorkflowHealth = z.infer<typeof StudioWorkflowHealthSchema>;
export type StudioPricingStatus = z.infer<typeof StudioPricingStatusSchema>;
export type StudioPricingSource = z.infer<typeof StudioPricingSourceSchema>;
export type StudioChangeResource = z.infer<typeof StudioChangeResourceSchema>;
export type StudioChange = z.infer<typeof StudioChangeSchema>;
export type StudioMetric = z.infer<typeof StudioMetricSchema>;
export type StudioRun = z.infer<typeof StudioRunSchema>;
export type StudioSession = z.infer<typeof StudioSessionSchema>;
export type StudioInterrupt = z.infer<typeof StudioInterruptSchema>;
export type StudioWorkflowNode = z.infer<typeof StudioWorkflowNodeSchema>;
export type StudioWorkflowInternalEdge = z.infer<
  typeof StudioWorkflowInternalEdgeSchema
>;
export type StudioWorkflowTransition = z.infer<
  typeof StudioWorkflowTransitionSchema
>;
export type StudioWorkflow = z.infer<typeof StudioWorkflowSchema>;
export type StudioRunsResponse = z.infer<typeof StudioRunsResponseSchema>;
export type StudioSessionsResponse = z.infer<
  typeof StudioSessionsResponseSchema
>;
export type StudioInterruptsResponse = z.infer<
  typeof StudioInterruptsResponseSchema
>;
export type StudioDetailEvent = z.infer<typeof StudioDetailEventSchema>;
export type StudioRunDetailResponse = z.infer<
  typeof StudioRunDetailResponseSchema
>;
export type StudioSessionDetailResponse = z.infer<
  typeof StudioSessionDetailResponseSchema
>;
export type StudioInterruptDetailResponse = z.infer<
  typeof StudioInterruptDetailResponseSchema
>;
export type StudioWorkflowsResponse = z.infer<
  typeof StudioWorkflowsResponseSchema
>;
export type StudioCatalogsResponse = z.infer<
  typeof StudioCatalogsResponseSchema
>;
export type StudioContextResponse = z.infer<typeof StudioContextResponseSchema>;
