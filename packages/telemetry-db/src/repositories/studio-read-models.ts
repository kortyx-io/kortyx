import type {
  StudioCatalogsResponse,
  StudioDetailEvent,
  StudioInterrupt,
  StudioInterruptStatus,
  StudioInterruptType,
  StudioMetric,
  StudioPricingSource,
  StudioPricingStatus,
  StudioResumeOutcome,
  StudioRun,
  StudioRunStatus,
  StudioSession,
  StudioWorkflow,
  StudioWorkflowHealth,
  StudioWorkflowInternalEdge,
  StudioWorkflowNode,
  StudioWorkflowsResponse,
  StudioWorkflowTransition,
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

const lastRunSpanOutcome = (
  events: TelemetryEventRecord[],
): "completed" | "failed" | "running" | null => {
  const runSpanEvents = events.filter(
    (event) =>
      isRunSpan(event) &&
      (event.type === "span.started" ||
        event.type === "span.ended" ||
        event.type === "span.failed"),
  );
  const started = runSpanEvents.filter(
    (event) => event.type === "span.started",
  );
  const latestStarted = started.at(-1);
  if (!latestStarted) return null;

  const latestSpanId = eventSpanId(latestStarted);
  const latestSpanEvents = runSpanEvents.filter((event) =>
    latestSpanId
      ? eventSpanId(event) === latestSpanId
      : event.occurredAt.getTime() >= latestStarted.occurredAt.getTime(),
  );
  if (latestSpanEvents.some((event) => event.type === "span.failed")) {
    return "failed";
  }
  if (latestSpanEvents.some((event) => event.type === "span.ended")) {
    return "completed";
  }
  return "running";
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
      const failed = ordered.find((event) => event.type === "span.failed");
      const cancelled = ordered.find((event) => event.type === "run.cancelled");
      const interrupt = [...ordered]
        .reverse()
        .find((event) => event.type === "interrupt.created");
      const resolvedInterruptIds = new Set(
        ordered
          .filter(
            (event) =>
              event.type === "interrupt.resolved" ||
              event.type === "interrupt.cancelled" ||
              event.type === "interrupt.expired",
          )
          .map((event) => asString(event.payload.interruptId))
          .filter((id): id is string => Boolean(id)),
      );
      const pendingInterrupt =
        interrupt &&
        !resolvedInterruptIds.has(
          asString(interrupt.payload.interruptId) ?? "",
        );
      const runOutcome = lastRunSpanOutcome(ordered);
      const status: StudioRunStatus = cancelled
        ? "cancelled"
        : pendingInterrupt
          ? "interrupted"
          : runOutcome === "running"
            ? "running"
            : runOutcome === "failed" || (!runOutcome && failed)
              ? "failed"
              : runOutcome === "completed"
                ? "completed"
                : "running";
      const endedAt = status === "running" ? null : last.occurredAt;
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
        status,
        latestResult:
          latestError ??
          (pendingInterrupt
            ? `Interrupted at ${interrupt.nodeId ?? first.workflowId}`
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

const aggregateRuns = (
  events: TelemetryEventRecord[],
  rateCards: ModelRateCard[],
): RunAggregate[] =>
  aggregateRunGroups(
    events,
    rateCards,
    (event) => event.runId,
    (runId) => runId,
  );

const aggregateWorkflowRuns = (
  events: TelemetryEventRecord[],
  rateCards: ModelRateCard[],
): RunAggregate[] =>
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
          latest.status === "interrupted"
            ? (asString(
                [...latest.events]
                  .reverse()
                  .find((event) => event.type === "interrupt.created")?.payload
                  .interruptId,
              ) ?? null)
            : null,
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
            event.type === "interrupt.cancelled",
        );
      const first = created ?? ordered[0];
      if (!first) throw new Error("Interrupt aggregate cannot be empty.");
      const expiresAt = asString(first.payload.expiresAt);
      const status: StudioInterruptStatus =
        terminal?.type === "interrupt.cancelled"
          ? "cancelled"
          : terminal?.type === "interrupt.resolved"
            ? asString(terminal.payload.resumeOutcome) === "failed"
              ? "failed"
              : "resolved"
            : expiresAt && Date.parse(expiresAt) <= now
              ? "expired"
              : "pending";
      const question = asString(first.payload.question);
      const optionCount = asNumber(first.payload.optionCount);
      return {
        id: interruptId,
        status,
        type: mapInterruptType(asString(first.payload.kind)),
        createdAt: iso(first.occurredAt),
        resolvedAt: terminal ? iso(terminal.occurredAt) : null,
        expiresAt,
        question,
        contentCaptured: question !== null,
        optionCount,
        workflowId: first.workflowId,
        nodeId: first.nodeId ?? asString(first.payload.nodeId),
        sessionId: first.sessionId,
        userId: first.userId,
        tenantId: first.tenantId,
        response: asString(terminal?.payload.response),
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
  return { workflows, transitions };
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

export const getStudioRunReadModel = (
  db: TelemetryDb,
  input: { organizationId: string; projectId: string; runId: string },
) => loadScopedStudioModels(db, input, eq(telemetryEvents.runId, input.runId));

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
