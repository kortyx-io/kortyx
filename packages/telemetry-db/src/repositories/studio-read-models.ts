import {
  resolveStudioInterruptStatus,
  type StudioCatalogsResponse,
  type StudioDetailEvent,
  type StudioInterrupt,
  type StudioInterruptInteractionMode,
  type StudioInterruptOption,
  type StudioInterruptStatus,
  type StudioInterruptType,
  type StudioMetric,
  type StudioPricingSource,
  type StudioPricingStatus,
  type StudioResumeOutcome,
  type StudioRun,
  type StudioRunStatus,
  type StudioSession,
  type StudioWorkflow,
  type StudioWorkflowHealth,
  type StudioWorkflowInternalEdge,
  type StudioWorkflowNode,
  type StudioWorkflowsResponse,
  type StudioWorkflowTransition,
} from "@kortyx/telemetry-contracts";
import { and, desc, eq, isNull, or, type SQL, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { calculateGenerationCost } from "../pricing/calculate-cost";
import {
  type ModelRateCard,
  modelRateCards,
  type TelemetryEventRecord,
  telemetryEvents,
  type WorkflowRevision,
  workflowRevisions,
} from "../schema";

export type StudioReadModels = {
  runs: StudioRun[];
  sessions: StudioSession[];
  interrupts: StudioInterrupt[];
  workflows: StudioWorkflowsResponse;
  catalogs: StudioCatalogsResponse;
  detailEvents: StudioDetailEvent[];
};

type RunAggregate = {
  id: string;
  events: TelemetryEventRecord[];
  workflowId: string;
  workflowRevisionId: string | null;
  sessionId: string | null;
  environment: string;
  startedAt: Date;
  endedAt: Date | null;
  userId: string | null;
  tenantId: string | null;
  path: string[];
  providers: string[];
  models: string[];
  tokens: number | null;
  cost: number | null;
  currency: string | null;
  pricingStatus: StudioPricingStatus;
  pricingSource: StudioPricingSource;
  durationMs: number | null;
  hasTool: boolean;
  hasRetry: boolean;
  interruptNodeId: string | null;
  interruptId: string | null;
  interruptStatus: StudioInterruptStatus | null;
  interruptExpiresAt: string | null;
  status: StudioRunStatus;
  latestResult: string | null;
  latestError: string | null;
  tags: string[];
};

const EMPTY_METRIC: StudioMetric = {
  runCount: 0,
  successRate: null,
  errorRate: null,
  retryCount: null,
  interruptRate: null,
  p50DurationMs: null,
  p95DurationMs: null,
  averageTokens: null,
  averageCost: null,
  currency: null,
};

const unique = <T>(items: T[]): T[] => [...new Set(items)];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const iso = (date: Date): string => date.toISOString();

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.replace(/[_-]/g, "").toLowerCase();
  if (
    normalized.includes("authorization") ||
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("apikey")
  ) {
    return true;
  }
  return (
    normalized === "token" ||
    /^(resume|access|refresh|auth|bearer|session)token$/.test(normalized)
  );
};

const redactDetailValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactDetailValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? "[REDACTED]" : redactDetailValue(item),
    ]),
  );
};

const byTimeAsc = (a: TelemetryEventRecord, b: TelemetryEventRecord) =>
  a.occurredAt.getTime() - b.occurredAt.getTime();

const byTimeDesc = (a: { startedAt: string }, b: { startedAt: string }) =>
  Date.parse(b.startedAt) - Date.parse(a.startedAt);

const toDetailEvent = (event: TelemetryEventRecord): StudioDetailEvent => ({
  id: event.eventId,
  type: event.type as StudioDetailEvent["type"],
  occurredAt: iso(event.occurredAt),
  receivedAt: iso(event.receivedAt),
  environment: event.environment,
  serviceName: event.serviceName,
  deploymentRef: event.deploymentRef,
  traceId: event.traceId,
  spanId: event.spanId,
  parentSpanId: event.parentSpanId,
  runId: event.runId,
  sessionId: event.sessionId,
  workflowId: event.workflowId,
  workflowRevisionId: event.workflowRevisionId,
  nodeId: event.nodeId,
  userId: event.userId,
  tenantId: event.tenantId,
  tags: event.contextTags ?? [],
  metadata: event.contextMetadata
    ? (redactDetailValue(event.contextMetadata) as Record<string, unknown>)
    : null,
  payload: redactDetailValue(event.payload) as Record<string, unknown>,
});

const percentile = (values: number[], fraction: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index] ?? null;
};

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const percentage = (count: number, total: number): number | null =>
  total === 0 ? null : Number(((count / total) * 100).toFixed(1));

const usageTotal = (payload: Record<string, unknown>): number | null => {
  const usage = isRecord(payload.usage) ? payload.usage : undefined;
  if (!usage) return null;
  const total = asNumber(usage.total);
  if (total !== null) return total;
  const input = asNumber(usage.input) ?? 0;
  const output = asNumber(usage.output) ?? 0;
  const reasoning = asNumber(usage.reasoning) ?? 0;
  const computed = input + output + reasoning;
  return computed > 0 ? computed : null;
};

const errorMessage = (payload: Record<string, unknown>): string | null => {
  const error = isRecord(payload.error) ? payload.error : undefined;
  return asString(error?.message) ?? asString(payload.message);
};

const spanName = (event: TelemetryEventRecord): string | null =>
  asString(event.payload.name);

const isRunSpan = (event: TelemetryEventRecord): boolean =>
  spanName(event) === "kortyx.run";

const eventSpanId = (event: TelemetryEventRecord): string | null =>
  event.spanId ?? asString(event.payload.spanId);

type RunSpanOutcome = {
  status: "completed" | "failed" | "running";
  event: TelemetryEventRecord;
};

const lastRunSpanOutcome = (
  events: TelemetryEventRecord[],
): RunSpanOutcome | null => {
  const runSpanEvents = events.filter(
    (event) =>
      isRunSpan(event) &&
      (event.type === "span.started" ||
        event.type === "span.ended" ||
        event.type === "span.failed"),
  );
  const latestRunSpanEvent = runSpanEvents.at(-1);
  if (!latestRunSpanEvent) return null;

  const latestSpanId = eventSpanId(latestRunSpanEvent);
  const latestStarted = [...runSpanEvents]
    .reverse()
    .find(
      (event) =>
        event.type === "span.started" &&
        event.occurredAt.getTime() <= latestRunSpanEvent.occurredAt.getTime(),
    );
  const latestSpanEvents = runSpanEvents.filter((event) => {
    if (latestSpanId) return eventSpanId(event) === latestSpanId;
    if (!latestStarted) return event === latestRunSpanEvent;
    return event.occurredAt.getTime() >= latestStarted.occurredAt.getTime();
  });
  const failed = [...latestSpanEvents]
    .reverse()
    .find((event) => event.type === "span.failed");
  if (failed) {
    return { status: "failed", event: failed };
  }
  const completed = [...latestSpanEvents]
    .reverse()
    .find((event) => event.type === "span.ended");
  if (completed) {
    return { status: "completed", event: completed };
  }
  return { status: "running", event: latestRunSpanEvent };
};

const modelFrom = (event: TelemetryEventRecord): string | null =>
  asString(event.payload.model);

const providerFrom = (event: TelemetryEventRecord): string | null =>
  asString(event.payload.provider);

const workflowRevisionMap = (
  revisions: WorkflowRevision[],
): Map<string, WorkflowRevision> =>
  new Map(revisions.map((revision) => [revision.id, revision]));

const revisionForRun = (
  run: RunAggregate,
  revisionsById: Map<string, WorkflowRevision>,
): WorkflowRevision | undefined =>
  run.workflowRevisionId
    ? revisionsById.get(run.workflowRevisionId)
    : undefined;

const latestRevisionByWorkflow = (
  revisions: WorkflowRevision[],
): Map<string, WorkflowRevision> => {
  const latest = new Map<string, WorkflowRevision>();
  for (const revision of revisions) {
    const current = latest.get(revision.workflowId);
    if (!current || current.createdAt < revision.createdAt) {
      latest.set(revision.workflowId, revision);
    }
  }
  return latest;
};

const transitionKey = (args: {
  sourceWorkflowId: string;
  sourceNodeId: string | null;
  targetWorkflowId: string;
  condition: string | null;
}): string =>
  `${args.sourceWorkflowId}:${args.sourceNodeId ?? ""}:${args.targetWorkflowId}:${args.condition ?? ""}`;

const transitionKeyFromEvent = (
  event: TelemetryEventRecord,
  fallbackWorkflowId: string,
): string | null => {
  if (event.type !== "workflow.transitioned") return null;
  const sourceWorkflowId =
    asString(event.payload.sourceWorkflowId) ?? fallbackWorkflowId;
  const targetWorkflowId =
    asString(event.payload.targetWorkflowId) ?? event.workflowId;
  const sourceNodeId = asString(event.payload.sourceNodeId);
  const condition = asString(event.payload.condition);
  return transitionKey({
    sourceWorkflowId,
    sourceNodeId,
    targetWorkflowId,
    condition,
  });
};

const aggregateCost = (
  costs: Array<{
    cost: number | null;
    currency: string | null;
    pricingStatus: StudioPricingStatus;
    pricingSource: StudioPricingSource;
  }>,
): {
  cost: number | null;
  currency: string | null;
  pricingStatus: StudioPricingStatus;
  pricingSource: StudioPricingSource;
} => {
  const priced = costs.filter(
    (cost) => cost.pricingStatus === "priced" && cost.cost !== null,
  );
  if (priced.length > 0) {
    const currencies = unique(
      priced
        .map((cost) => cost.currency)
        .filter((value): value is string => Boolean(value)),
    );
    const sources = unique(
      priced
        .map((cost) => cost.pricingSource)
        .filter((value): value is NonNullable<StudioPricingSource> =>
          Boolean(value),
        ),
    );
    return {
      cost:
        currencies.length === 1
          ? priced.reduce((sum, item) => sum + (item.cost ?? 0), 0)
          : null,
      currency: currencies.length === 1 ? (currencies[0] ?? null) : null,
      pricingStatus: "priced",
      pricingSource: sources.length === 1 ? (sources[0] ?? null) : null,
    };
  }
  if (costs.some((cost) => cost.pricingStatus === "unpriced")) {
    return {
      cost: null,
      currency: null,
      pricingStatus: "unpriced",
      pricingSource: null,
    };
  }
  return {
    cost: null,
    currency: null,
    pricingStatus: "unknown",
    pricingSource: null,
  };
};

const aggregateRunGroups = (
  events: TelemetryEventRecord[],
  rateCards: ModelRateCard[],
  groupKeyFor: (event: TelemetryEventRecord) => string,
  aggregateIdFor: (groupKey: string, events: TelemetryEventRecord[]) => string,
): RunAggregate[] => {
  const grouped = new Map<string, TelemetryEventRecord[]>();
  for (const event of events) {
    const groupKey = groupKeyFor(event);
    const list = grouped.get(groupKey) ?? [];
    list.push(event);
    grouped.set(groupKey, list);
  }

  return Array.from(grouped.entries())
    .map(([groupKey, runEvents]) => {
      const ordered = [...runEvents].sort(byTimeAsc);
      const first = ordered[0];
      if (!first) throw new Error("Run aggregate cannot be empty.");
      const runId = aggregateIdFor(groupKey, ordered);
      const last = ordered.at(-1) ?? first;
      const failed = [...ordered]
        .reverse()
        .find((event) => event.type === "span.failed");
      const cancelled = [...ordered]
        .reverse()
        .find((event) => event.type === "run.cancelled");
      const interrupt = [...ordered]
        .reverse()
        .find((event) => event.type === "interrupt.created");
      const interruptId = asString(interrupt?.payload.interruptId);
      const interruptTerminal = interruptId
        ? [...ordered]
            .reverse()
            .find(
              (event) =>
                (event.type === "interrupt.resolved" ||
                  event.type === "interrupt.cancelled" ||
                  event.type === "interrupt.expired") &&
                asString(event.payload.interruptId) === interruptId,
            )
        : undefined;
      const interruptExpiresAt = asString(interrupt?.payload.expiresAt) ?? null;
      const interruptStatus: StudioInterruptStatus | null = interrupt
        ? resolveStudioInterruptStatus({
            status:
              interruptTerminal?.type === "interrupt.cancelled"
                ? "cancelled"
                : interruptTerminal?.type === "interrupt.expired"
                  ? "expired"
                  : interruptTerminal?.type === "interrupt.resolved"
                    ? asString(interruptTerminal.payload.resumeOutcome) ===
                      "failed"
                      ? "failed"
                      : "resolved"
                    : "pending",
            expiresAt: interruptExpiresAt,
          })
        : null;
      const interruptedByInput =
        Boolean(interrupt) &&
        (interruptStatus === "pending" || interruptStatus === "expired");
      const runOutcome = lastRunSpanOutcome(ordered);
      const status: StudioRunStatus = cancelled
        ? "cancelled"
        : interruptedByInput
          ? "interrupted"
          : runOutcome?.status === "running"
            ? "running"
            : runOutcome?.status === "failed" || (!runOutcome && failed)
              ? "failed"
              : runOutcome?.status === "completed"
                ? "completed"
                : "running";
      const endedAt =
        status === "running"
          ? null
          : status === "interrupted" && interrupt
            ? interrupt.occurredAt
            : (cancelled?.occurredAt ??
              runOutcome?.event.occurredAt ??
              failed?.occurredAt ??
              last.occurredAt);
      const generationEvents = ordered.filter(
        (event) => event.type === "generation.completed",
      );
      const tokens = generationEvents
        .map((event) => usageTotal(event.payload))
        .filter((value): value is number => value !== null)
        .reduce((sum, value) => sum + value, 0);
      const providers = unique(
        generationEvents
          .map(providerFrom)
          .filter((value): value is string => Boolean(value)),
      );
      const models = unique(
        generationEvents
          .map(modelFrom)
          .filter((value): value is string => Boolean(value)),
      );
      const cost = aggregateCost(
        generationEvents.map((event) =>
          calculateGenerationCost(event, rateCards),
        ),
      );
      const path = unique(
        ordered.flatMap((event) => [
          ...(event.nodeId ? [event.nodeId] : []),
          ...(event.type === "session.checkpointed"
            ? asStringArray(event.payload.nodes)
            : []),
        ]),
      );
      const durationMs = endedAt
        ? endedAt.getTime() - first.occurredAt.getTime()
        : null;
      const latestError =
        status === "failed" && failed ? errorMessage(failed.payload) : null;
      return {
        id: runId,
        events: ordered,
        workflowId: first.workflowId,
        workflowRevisionId: first.workflowRevisionId,
        sessionId: first.sessionId,
        environment: first.environment,
        startedAt: first.occurredAt,
        endedAt,
        userId: first.userId,
        tenantId: first.tenantId,
        path,
        providers,
        models,
        tokens: tokens > 0 ? tokens : null,
        cost: cost.cost,
        currency: cost.currency,
        pricingStatus: cost.pricingStatus,
        pricingSource: cost.pricingSource,
        durationMs,
        hasTool: ordered.some((event) => event.type.startsWith("tool.")),
        hasRetry: ordered.some((event) =>
          JSON.stringify(event.payload).toLowerCase().includes("retry"),
        ),
        interruptNodeId: interrupt?.nodeId ?? null,
        interruptId,
        interruptStatus,
        interruptExpiresAt,
        status,
        latestResult:
          latestError ??
          (interruptedByInput
            ? interruptStatus === "expired"
              ? `Input expired at ${interrupt?.nodeId ?? first.workflowId}`
              : `Waiting for input at ${interrupt?.nodeId ?? first.workflowId}`
            : status === "completed"
              ? "Completed"
              : status === "cancelled"
                ? "Cancelled"
                : null),
        latestError,
        tags: unique(
          ordered.flatMap((event) => asStringArray(event.contextTags)),
        ),
      } satisfies RunAggregate;
    })
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
};

const reconcileSupersededRuns = (runs: RunAggregate[]): RunAggregate[] =>
  runs.map((run) => {
    if (run.status !== "running" || !run.sessionId) return run;
    const lastObservedAt =
      run.events.at(-1)?.occurredAt.getTime() ?? run.startedAt.getTime();
    const hasLaterTerminalRun = runs.some(
      (candidate) =>
        candidate.id !== run.id &&
        candidate.sessionId === run.sessionId &&
        candidate.status !== "running" &&
        candidate.startedAt.getTime() > lastObservedAt,
    );
    if (!hasLaterTerminalRun) return run;
    return {
      ...run,
      status: "incomplete",
      endedAt: null,
      durationMs: null,
      latestResult: "Telemetry ended before a terminal run event was observed.",
      latestError: null,
    };
  });

const aggregateRuns = (
  events: TelemetryEventRecord[],
  rateCards: ModelRateCard[],
): RunAggregate[] =>
  reconcileSupersededRuns(
    aggregateRunGroups(
      events,
      rateCards,
      (event) => event.runId,
      (runId) => runId,
    ),
  );

const aggregateWorkflowRuns = (
  events: TelemetryEventRecord[],
  rateCards: ModelRateCard[],
): RunAggregate[] =>
  reconcileSupersededRuns(
    aggregateRunGroups(
      events,
      rateCards,
      (event) =>
        `${event.runId}\u0000${event.workflowId}\u0000${event.workflowRevisionId ?? ""}`,
      (_groupKey, ordered) => {
        const first = ordered[0];
        if (!first) throw new Error("Workflow run aggregate cannot be empty.");
        return `${first.runId}:${first.workflowId}${
          first.workflowRevisionId ? `:${first.workflowRevisionId}` : ""
        }`;
      },
    ),
  );

const runToStudioRun = (
  run: RunAggregate,
  revisionsById: Map<string, WorkflowRevision>,
): StudioRun => {
  const revision = revisionForRun(run, revisionsById);
  const workflowRefs = Array.from(
    new Map(
      run.events.map((event) => {
        const eventRevision = event.workflowRevisionId
          ? revisionsById.get(event.workflowRevisionId)
          : undefined;
        return [
          `${event.workflowId}:${event.workflowRevisionId ?? ""}`,
          {
            workflowId: event.workflowId,
            workflowRevisionId: event.workflowRevisionId,
            declaredVersion: eventRevision?.declaredVersion ?? null,
          },
        ];
      }),
    ).values(),
  );
  return {
    id: run.id,
    status: run.status,
    startedAt: iso(run.startedAt),
    endedAt: run.endedAt ? iso(run.endedAt) : null,
    workflowId: run.workflowId,
    workflowIds: unique(workflowRefs.map((ref) => ref.workflowId)),
    workflowRefs,
    workflowRevisionId: run.workflowRevisionId,
    declaredVersion: revision?.declaredVersion ?? null,
    transitionIds: unique(
      run.events
        .map((event) => transitionKeyFromEvent(event, run.workflowId))
        .filter((id): id is string => Boolean(id)),
    ),
    path: run.path,
    sessionId: run.sessionId,
    provider: run.providers[0] ?? null,
    model: run.models[0] ?? null,
    models: run.models,
    durationMs: run.durationMs,
    tokens: run.tokens,
    cost: run.cost,
    pricingStatus: run.pricingStatus,
    pricingSource: run.pricingSource,
    currency: run.currency,
    result: run.latestResult,
    environment: run.environment,
    userId: run.userId,
    tenantId: run.tenantId,
    hasTool: run.hasTool,
    hasRetry: run.hasRetry,
    interruptNodeId: run.interruptNodeId,
    interruptId: run.interruptId,
    interruptStatus: run.interruptStatus,
    interruptExpiresAt: run.interruptExpiresAt,
  };
};

const aggregateSessions = (
  runs: RunAggregate[],
  revisionsById: Map<string, WorkflowRevision>,
): StudioSession[] => {
  const grouped = new Map<string, RunAggregate[]>();
  for (const run of runs) {
    if (!run.sessionId) continue;
    const list = grouped.get(run.sessionId) ?? [];
    list.push(run);
    grouped.set(run.sessionId, list);
  }

  return Array.from(grouped.entries())
    .map(([sessionId, sessionRuns]) => {
      const sorted = [...sessionRuns].sort(
        (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
      );
      const latest = sorted[0];
      if (!latest) throw new Error("Session aggregate cannot be empty.");
      const sessionEvents = sorted.flatMap((run) => run.events).sort(byTimeAsc);
      const workflowActivityEvents = sessionEvents.filter(
        (event) => !event.type.startsWith("session."),
      );
      const latestEvent = workflowActivityEvents.at(-1) ?? sessionEvents.at(-1);
      const workflowIds = unique(
        sessionEvents.map((event) => event.workflowId),
      );
      const activeWorkflowId = latestEvent?.workflowId ?? latest.workflowId;
      const activeRevision =
        latestEvent?.workflowRevisionId !== null &&
        latestEvent?.workflowRevisionId !== undefined
          ? revisionsById.get(latestEvent.workflowRevisionId)
          : revisionForRun(latest, revisionsById);
      const checkpoints = sorted.reduce(
        (count, run) =>
          count +
          run.events.filter((event) => event.type === "session.checkpointed")
            .length,
        0,
      );
      const tokens = sorted.reduce((sum, run) => sum + (run.tokens ?? 0), 0);
      const cost = aggregateCost(sorted);
      const duration = sorted.reduce(
        (sum, run) => sum + (run.durationMs ?? 0),
        0,
      );
      return {
        id: sessionId,
        status: latest.status,
        lastActivityAt: iso(
          latestEvent?.occurredAt ?? latest.endedAt ?? latest.startedAt,
        ),
        workflowIds,
        workflowCount: workflowIds.length,
        activeWorkflowId,
        activeVersion: activeRevision?.declaredVersion ?? null,
        userId: latest.userId,
        tenantId: latest.tenantId,
        runs: sorted.length,
        succeeded: sorted.filter((run) => run.status === "completed").length,
        failed: sorted.filter((run) => run.status === "failed").length,
        interrupted: sorted.filter((run) => run.status === "interrupted")
          .length,
        checkpoints,
        hasFork: sorted.some((run) =>
          run.events.some((event) => event.type === "session.forked"),
        ),
        durationMs: duration > 0 ? duration : null,
        tokens: tokens > 0 ? tokens : null,
        cost: cost.cost,
        pricingStatus: cost.pricingStatus,
        pricingSource: cost.pricingSource,
        currency: cost.currency,
        latestResult: latest.latestResult,
        latestError: latest.latestError,
        pendingInterruptId:
          latest.status === "interrupted" ? latest.interruptId : null,
        interruptStatus:
          latest.status === "interrupted" ? latest.interruptStatus : null,
        interruptExpiresAt:
          latest.status === "interrupted" ? latest.interruptExpiresAt : null,
        providers: unique(sorted.flatMap((run) => run.providers)),
        models: unique(sorted.flatMap((run) => run.models)),
        tags: unique(sorted.flatMap((run) => run.tags)),
        environment: latest.environment,
      } satisfies StudioSession;
    })
    .sort(
      (a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
    );
};

const mapInterruptType = (kind: string | null): StudioInterruptType => {
  if (kind === "choice") return "choice";
  if (kind === "multi-choice") return "multi-choice";
  if (kind === "text") return "text";
  return "unknown";
};

const mapResumeOutcome = (
  status: StudioInterruptStatus,
  raw: string | null,
): StudioResumeOutcome | null => {
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired before resume";
  if (raw === "failed") return "resume failed";
  if (raw === "completed" || raw === "resumed") return "resumed";
  return null;
};

const mapInterruptInteractionMode = (
  raw: string | null,
  type: StudioInterruptType,
  optionCount: number | null,
  schemaId: string | null,
): StudioInterruptInteractionMode => {
  if (
    raw === "static-options" ||
    raw === "dynamic-picker" ||
    raw === "freeform" ||
    raw === "unknown"
  ) {
    return raw;
  }
  if (type === "text") return "freeform";
  if (
    (type === "choice" || type === "multi-choice") &&
    optionCount !== null &&
    optionCount > 0
  ) {
    return "static-options";
  }
  if (
    (type === "choice" || type === "multi-choice") &&
    optionCount === 0 &&
    schemaId
  ) {
    return "dynamic-picker";
  }
  return "unknown";
};

const mapInterruptOptions = (
  value: unknown,
): StudioInterruptOption[] | null => {
  if (!Array.isArray(value)) return null;
  return value.flatMap((option) => {
    if (!isRecord(option)) return [];
    const id = asString(option.id);
    const label = asString(option.label);
    if (!id || !label) return [];
    return [
      {
        id,
        label,
        description: asString(option.description),
      },
    ];
  });
};

const aggregateInterrupts = (
  events: TelemetryEventRecord[],
): StudioInterrupt[] => {
  const byInterrupt = new Map<string, TelemetryEventRecord[]>();
  for (const event of events) {
    if (!event.type.startsWith("interrupt.")) continue;
    const interruptId = asString(event.payload.interruptId);
    if (!interruptId) continue;
    const list = byInterrupt.get(interruptId) ?? [];
    list.push(event);
    byInterrupt.set(interruptId, list);
  }

  const now = Date.now();
  return Array.from(byInterrupt.entries())
    .map(([interruptId, interruptEvents]) => {
      const ordered = [...interruptEvents].sort(byTimeAsc);
      const created = ordered.find(
        (event) => event.type === "interrupt.created",
      );
      const terminal = [...ordered]
        .reverse()
        .find(
          (event) =>
            event.type === "interrupt.resolved" ||
            event.type === "interrupt.expired" ||
            event.type === "interrupt.cancelled",
        );
      const first = created ?? ordered[0];
      if (!first) throw new Error("Interrupt aggregate cannot be empty.");
      const expiresAt = asString(first.payload.expiresAt);
      const recordedStatus: StudioInterruptStatus =
        terminal?.type === "interrupt.cancelled"
          ? "cancelled"
          : terminal?.type === "interrupt.expired"
            ? "expired"
            : terminal?.type === "interrupt.resolved"
              ? asString(terminal.payload.resumeOutcome) === "failed"
                ? "failed"
                : "resolved"
              : "pending";
      const status = resolveStudioInterruptStatus(
        { status: recordedStatus, expiresAt },
        now,
      );
      const question = asString(first.payload.question);
      const optionCount = asNumber(first.payload.optionCount);
      const options = mapInterruptOptions(first.payload.options);
      const type = mapInterruptType(asString(first.payload.kind));
      const schemaId = asString(first.payload.schemaId);
      const responseEvent = [...ordered]
        .reverse()
        .find(
          (event) =>
            event.type === "interrupt.resolved" &&
            (asString(event.payload.response) !== null ||
              asBoolean(event.payload.responseCaptured) !== null),
        );
      const response = asString(responseEvent?.payload.response);
      return {
        id: interruptId,
        status,
        type,
        interactionMode: mapInterruptInteractionMode(
          asString(first.payload.interactionMode),
          type,
          optionCount,
          schemaId,
        ),
        schemaId,
        schemaVersion: asString(first.payload.schemaVersion),
        createdAt: iso(first.occurredAt),
        resolvedAt: terminal ? iso(terminal.occurredAt) : null,
        expiresAt,
        question,
        contentCaptured: question !== null || options !== null,
        optionCount,
        options,
        workflowId: first.workflowId,
        nodeId: first.nodeId ?? asString(first.payload.nodeId),
        sessionId: first.sessionId,
        userId: first.userId,
        tenantId: first.tenantId,
        response,
        responseCaptured:
          asBoolean(responseEvent?.payload.responseCaptured) ??
          response !== null,
        resumeOutcome: mapResumeOutcome(
          status,
          asString(terminal?.payload.resumeOutcome),
        ),
        resumeError: asString(terminal?.payload.resumeError),
        runId: first.runId,
        // Resume tokens are capability secrets and must never leave the Studio API.
        resumeToken: null,
        resolvedBy: asString(terminal?.payload.resolvedBy),
        environment: first.environment,
      } satisfies StudioInterrupt;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

const metricsForRuns = (runs: RunAggregate[]): StudioMetric => {
  if (runs.length === 0) return EMPTY_METRIC;
  const completed = runs.filter((run) => run.status === "completed").length;
  const failed = runs.filter((run) => run.status === "failed").length;
  const interrupted = runs.filter((run) => run.status === "interrupted").length;
  const durations = runs
    .map((run) => run.durationMs)
    .filter((value): value is number => value !== null);
  const tokenValues = runs
    .map((run) => run.tokens)
    .filter((value): value is number => value !== null);
  const cost = aggregateCost(runs);
  const costValues = runs
    .map((run) => run.cost)
    .filter((value): value is number => value !== null);
  return {
    runCount: runs.length,
    successRate: percentage(completed, runs.length),
    errorRate: percentage(failed, runs.length),
    retryCount: runs.filter((run) => run.hasRetry).length,
    interruptRate: percentage(interrupted, runs.length),
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    averageTokens: average(tokenValues),
    averageCost: cost.currency ? average(costValues) : null,
    currency: cost.currency,
  };
};

const healthFor = (runs: RunAggregate[]): StudioWorkflowHealth => {
  if (runs.length === 0) return "unknown";
  const latestActivity = Math.max(
    ...runs.map((run) => (run.endedAt ?? run.startedAt).getTime()),
  );
  if (Date.now() - latestActivity > 7 * 24 * 60 * 60 * 1000) return "idle";
  const metric = metricsForRuns(runs);
  if ((metric.errorRate ?? 0) >= 20) return "failing";
  if ((metric.errorRate ?? 0) >= 5 || (metric.interruptRate ?? 0) >= 25) {
    return "degraded";
  }
  return "healthy";
};

const nodeStateFor = (
  nodeId: string,
  runs: RunAggregate[],
): StudioWorkflowNode["state"] => {
  const nodeRuns = runs.filter((run) => run.path.includes(nodeId));
  if (nodeRuns.some((run) => run.status === "failed")) return "failed";
  if (nodeRuns.some((run) => run.interruptNodeId === nodeId)) {
    return "interrupted";
  }
  if (nodeRuns.some((run) => run.hasRetry)) return "retried";
  if (nodeRuns.length > 0) return "healthy";
  return null;
};

const workflowModels = (
  revisions: WorkflowRevision[],
  runs: RunAggregate[],
): StudioWorkflowsResponse => {
  const byWorkflow = new Map<string, WorkflowRevision[]>();
  for (const revision of revisions) {
    const list = byWorkflow.get(revision.workflowId) ?? [];
    list.push(revision);
    byWorkflow.set(revision.workflowId, list);
  }
  for (const run of runs) {
    if (!byWorkflow.has(run.workflowId)) byWorkflow.set(run.workflowId, []);
  }
  const latest = latestRevisionByWorkflow(revisions);

  const workflows: StudioWorkflow[] = Array.from(byWorkflow.entries())
    .map(([workflowId, workflowRevisionsForId]) => {
      const active = latest.get(workflowId);
      const workflowRuns = runs.filter((run) => run.workflowId === workflowId);
      const nodes: StudioWorkflowNode[] = (active?.nodes ?? []).map((node) => {
        const nodeRuns = workflowRuns.filter((run) =>
          run.path.includes(node.id),
        );
        return {
          id: node.id,
          label: node.label ?? node.id,
          type: node.type ?? null,
          state: nodeStateFor(node.id, workflowRuns),
          provider: node.provider ?? null,
          model: node.model ?? null,
          metrics: metricsForRuns(nodeRuns),
        };
      });
      const internalEdges: StudioWorkflowInternalEdge[] = (
        active?.edges ?? []
      ).map((edge) => ({
        id: `${edge.sourceNodeId}->${edge.targetNodeId}`,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        condition: edge.condition ?? null,
      }));
      const lastActivity = workflowRuns
        .map((run) => run.endedAt ?? run.startedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        id: workflowId,
        name: workflowId,
        description: active?.description ?? null,
        versions: unique(
          workflowRevisionsForId.map((revision) => revision.declaredVersion),
        ),
        activeVersion: active?.declaredVersion ?? null,
        activeRevisionId: active?.id ?? null,
        health: healthFor(workflowRuns),
        tags: unique(
          workflowRevisionsForId.flatMap((revision) => revision.tags ?? []),
        ),
        lastActivityAt: lastActivity ? iso(lastActivity) : null,
        metrics: metricsForRuns(workflowRuns),
        nodes,
        internalEdges,
      } satisfies StudioWorkflow;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const transitions = aggregateTransitions(runs, latest);
  return {
    workflows,
    transitions,
    cohort: {
      range: "All time",
      startedAfter: null,
      startedBefore: null,
      workflowId: null,
      version: null,
    },
  };
};

const aggregateTransitions = (
  runs: RunAggregate[],
  latestRevisionsByWorkflow: Map<string, WorkflowRevision>,
): StudioWorkflowTransition[] => {
  const declared = new Map<string, StudioWorkflowTransition>();
  for (const revision of latestRevisionsByWorkflow.values()) {
    for (const transition of revision.workflowTransitions ?? []) {
      const sourceNodeId = transition.sourceNodeId ?? null;
      const condition = transition.condition ?? null;
      const key = transitionKey({
        sourceWorkflowId: revision.workflowId,
        sourceNodeId,
        targetWorkflowId: transition.targetWorkflowId,
        condition,
      });
      declared.set(key, {
        id: key,
        sourceWorkflowId: revision.workflowId,
        sourceNodeId,
        targetWorkflowId: transition.targetWorkflowId,
        condition,
        volume: 0,
        successRate: null,
        medianDurationMs: null,
        errorRate: null,
      });
    }
  }

  const transitionEvents = runs.flatMap((run) =>
    run.events
      .filter((event) => event.type === "workflow.transitioned")
      .map((event) => ({ run, event })),
  );
  const grouped = new Map<
    string,
    { run: RunAggregate; event: TelemetryEventRecord }[]
  >();
  for (const item of transitionEvents) {
    const sourceWorkflowId =
      asString(item.event.payload.sourceWorkflowId) ?? item.run.workflowId;
    const targetWorkflowId =
      asString(item.event.payload.targetWorkflowId) ?? item.event.workflowId;
    const sourceNodeId = asString(item.event.payload.sourceNodeId);
    const condition = asString(item.event.payload.condition);
    const key = transitionKey({
      sourceWorkflowId,
      sourceNodeId,
      targetWorkflowId,
      condition,
    });
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  const observed = Array.from(grouped.entries()).map(([id, items]) => {
    const first = items[0];
    if (!first) throw new Error("Transition aggregate cannot be empty.");
    const sourceWorkflowId =
      asString(first.event.payload.sourceWorkflowId) ?? first.run.workflowId;
    const targetWorkflowId =
      asString(first.event.payload.targetWorkflowId) ?? first.event.workflowId;
    const sourceNodeId = asString(first.event.payload.sourceNodeId);
    const condition = asString(first.event.payload.condition);
    const failed = items.filter((item) => item.run.status === "failed").length;
    const completed = items.filter(
      (item) => item.run.status === "completed",
    ).length;
    const durations = items
      .map((item) => item.run.durationMs)
      .filter((value): value is number => value !== null);
    return {
      id,
      sourceWorkflowId,
      sourceNodeId,
      targetWorkflowId,
      condition,
      volume: items.length,
      successRate: percentage(completed, items.length),
      medianDurationMs: percentile(durations, 0.5),
      errorRate: percentage(failed, items.length),
    } satisfies StudioWorkflowTransition;
  });

  for (const transition of observed) {
    declared.set(transition.id, transition);
  }

  return Array.from(declared.values()).sort((a, b) => a.id.localeCompare(b.id));
};

const catalogsFor = (
  events: TelemetryEventRecord[],
  revisions: WorkflowRevision[],
  runs: RunAggregate[],
): StudioCatalogsResponse => ({
  environments: unique([
    ...events.map((event) => event.environment),
    ...revisions.map((revision) => revision.environment),
  ]).sort(),
  providers: unique(runs.flatMap((run) => run.providers)).sort(),
  models: unique(runs.flatMap((run) => run.models)).sort(),
  workflows: unique([
    ...runs.map((run) => run.workflowId),
    ...revisions.map((revision) => revision.workflowId),
  ]).sort(),
  tags: unique([
    ...runs.flatMap((run) => run.tags),
    ...revisions.flatMap((revision) => revision.tags ?? []),
  ]).sort(),
});

export const getStudioReadModels = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    limit?: number | undefined;
  },
): Promise<StudioReadModels> => {
  const limit = input.limit ?? 5_000;
  const [events, revisions, rates] = await Promise.all([
    db
      .select()
      .from(telemetryEvents)
      .where(
        and(
          eq(telemetryEvents.organizationId, input.organizationId),
          eq(telemetryEvents.projectId, input.projectId),
        ),
      )
      .orderBy(desc(telemetryEvents.occurredAt))
      .limit(limit),
    db
      .select()
      .from(workflowRevisions)
      .where(
        and(
          eq(workflowRevisions.organizationId, input.organizationId),
          eq(workflowRevisions.projectId, input.projectId),
        ),
      )
      .orderBy(desc(workflowRevisions.createdAt)),
    db
      .select()
      .from(modelRateCards)
      .where(
        or(
          and(
            eq(modelRateCards.organizationId, input.organizationId),
            eq(modelRateCards.projectId, input.projectId),
          ),
          and(
            isNull(modelRateCards.organizationId),
            isNull(modelRateCards.projectId),
          ),
        ),
      ),
  ]);
  const chronologicalEvents = [...events].sort(byTimeAsc);
  return createStudioReadModelsFromRecords({
    events: chronologicalEvents,
    revisions,
    rates,
  });
};

const loadScopedStudioModels = async (
  db: TelemetryDb,
  input: { organizationId: string; projectId: string },
  eventPredicate: SQL,
): Promise<StudioReadModels> => {
  const [events, revisions, rates] = await Promise.all([
    db
      .select()
      .from(telemetryEvents)
      .where(
        and(
          eq(telemetryEvents.organizationId, input.organizationId),
          eq(telemetryEvents.projectId, input.projectId),
          eventPredicate,
        ),
      )
      .orderBy(telemetryEvents.occurredAt),
    db
      .select()
      .from(workflowRevisions)
      .where(
        and(
          eq(workflowRevisions.organizationId, input.organizationId),
          eq(workflowRevisions.projectId, input.projectId),
        ),
      )
      .orderBy(desc(workflowRevisions.createdAt)),
    db
      .select()
      .from(modelRateCards)
      .where(
        or(
          and(
            eq(modelRateCards.organizationId, input.organizationId),
            eq(modelRateCards.projectId, input.projectId),
          ),
          and(
            isNull(modelRateCards.organizationId),
            isNull(modelRateCards.projectId),
          ),
        ),
      ),
  ]);
  return createStudioReadModelsFromRecords({ events, revisions, rates });
};

export const getStudioRunReadModel = async (
  db: TelemetryDb,
  input: { organizationId: string; projectId: string; runId: string },
): Promise<StudioReadModels> => {
  const runScope = await db
    .select({ sessionId: telemetryEvents.sessionId })
    .from(telemetryEvents)
    .where(
      and(
        eq(telemetryEvents.organizationId, input.organizationId),
        eq(telemetryEvents.projectId, input.projectId),
        eq(telemetryEvents.runId, input.runId),
      ),
    )
    .limit(1);
  const sessionId = runScope[0]?.sessionId;
  return loadScopedStudioModels(
    db,
    input,
    sessionId
      ? eq(telemetryEvents.sessionId, sessionId)
      : eq(telemetryEvents.runId, input.runId),
  );
};

export const getStudioSessionReadModel = (
  db: TelemetryDb,
  input: { organizationId: string; projectId: string; sessionId: string },
) =>
  loadScopedStudioModels(
    db,
    input,
    eq(telemetryEvents.sessionId, input.sessionId),
  );

export const getStudioInterruptReadModel = async (
  db: TelemetryDb,
  input: { organizationId: string; projectId: string; interruptId: string },
): Promise<StudioReadModels> => {
  const interruptRows = await db
    .select({ runId: telemetryEvents.runId })
    .from(telemetryEvents)
    .where(
      and(
        eq(telemetryEvents.organizationId, input.organizationId),
        eq(telemetryEvents.projectId, input.projectId),
        sql`${telemetryEvents.payload} ->> 'interruptId' = ${input.interruptId}`,
      ),
    )
    .limit(1);
  const runId = interruptRows[0]?.runId;
  if (!runId) {
    return createStudioReadModelsFromRecords({
      events: [],
      revisions: [],
      rates: [],
    });
  }
  return getStudioRunReadModel(db, { ...input, runId });
};

export const createStudioReadModelsFromRecords = (input: {
  events: TelemetryEventRecord[];
  revisions: WorkflowRevision[];
  rates: ModelRateCard[];
}): StudioReadModels => {
  const revisionsById = workflowRevisionMap(input.revisions);
  const events = [...input.events].sort(byTimeAsc);
  const runs = aggregateRuns(events, input.rates);
  const workflowRuns = aggregateWorkflowRuns(events, input.rates);
  return {
    runs: runs
      .map((run) => runToStudioRun(run, revisionsById))
      .sort(byTimeDesc),
    sessions: aggregateSessions(runs, revisionsById),
    interrupts: aggregateInterrupts(events),
    workflows: workflowModels(input.revisions, workflowRuns),
    catalogs: catalogsFor(events, input.revisions, workflowRuns),
    detailEvents: events.map(toDetailEvent),
  };
};
