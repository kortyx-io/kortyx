import {
  resolveStudioInterruptStatus,
  resolveStudioTimeRange,
  type StudioInterrupt,
  type StudioInterruptInteractionMode,
  type StudioInterruptStatus,
  type StudioRun,
  type StudioSession,
  type StudioTimeRangeContext,
} from "@kortyx/telemetry-contracts";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { TelemetryDb } from "../client";
import { studioInterrupts, studioRuns, studioSessions } from "../schema";

export type StudioListQuery = Record<string, string | undefined>;

export type StudioListPage<T> = {
  items: T[];
  totalCount: number;
};

const queryValues = (value: string | undefined): string[] =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const queryNumber = (value: string | undefined): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const queryBoolean = (value: string | undefined): boolean =>
  value === "true" || value === "1";

const normalizeProjectionDateTime = (
  value: string | Date | null | undefined,
): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const pageOptions = (query: StudioListQuery) => {
  const cursor = Math.max(0, Math.floor(queryNumber(query.cursor)));
  const requestedSize = Math.floor(queryNumber(query.pageSize));
  return {
    cursor,
    pageSize: Math.min(250, Math.max(1, requestedSize || 25)),
  };
};

const containsJsonValue = (
  column: AnyPgColumn,
  value: string | undefined,
): SQL | undefined =>
  value?.trim()
    ? sql`${column} @> ${JSON.stringify([value.trim()])}::jsonb`
    : undefined;

const timeRangeConditions = (
  column: AnyPgColumn,
  range: StudioTimeRangeContext,
): Array<SQL | undefined> => {
  return [
    range.startedAfter ? gte(column, new Date(range.startedAfter)) : undefined,
    range.startedBefore
      ? lte(column, new Date(range.startedBefore))
      : undefined,
  ];
};

const resolveListTimeRange = (query: StudioListQuery) => {
  const resolution = resolveStudioTimeRange(query);
  if ("error" in resolution) throw new Error(resolution.error);
  return resolution.value;
};

const runStatusOrder = sql<number>`case ${studioRuns.status}
  when 'running' then 0
  when 'completed' then 1
  when 'interrupted' then 2
  when 'incomplete' then 3
  when 'failed' then 4
  when 'cancelled' then 5
  else 6 end`;
const sessionStatusOrder = sql<number>`case ${studioSessions.status}
  when 'running' then 0
  when 'completed' then 1
  when 'interrupted' then 2
  when 'incomplete' then 3
  when 'failed' then 4
  when 'cancelled' then 5
  else 6 end`;
const effectiveInterruptStatusSql = sql<StudioInterruptStatus>`case
  when ${studioInterrupts.status} = 'pending'
    and ${studioInterrupts.expiresAt} is not null
    and ${studioInterrupts.expiresAt} <= now()
  then 'expired'
  else ${studioInterrupts.status}
end`;
const latestRunInterruptIdSql = sql<string | null>`(
  select linked.interrupt_id
  from studio_interrupts as linked
  where linked.organization_id = "studio_runs"."organization_id"
    and linked.project_id = "studio_runs"."project_id"
    and linked.run_id = "studio_runs"."run_id"
  order by linked.created_at desc
  limit 1
)`;
const latestRunInterruptStatusSql = sql<StudioInterruptStatus | null>`(
  select case
    when linked.status = 'pending'
      and linked.expires_at is not null
      and linked.expires_at <= now()
    then 'expired'
    else linked.status
  end
  from studio_interrupts as linked
  where linked.organization_id = "studio_runs"."organization_id"
    and linked.project_id = "studio_runs"."project_id"
    and linked.run_id = "studio_runs"."run_id"
  order by linked.created_at desc
  limit 1
)`;
const latestRunInterruptExpiresAtSql = sql<string | null>`(
  select linked.expires_at
  from studio_interrupts as linked
  where linked.organization_id = "studio_runs"."organization_id"
    and linked.project_id = "studio_runs"."project_id"
    and linked.run_id = "studio_runs"."run_id"
  order by linked.created_at desc
  limit 1
)`;
const sessionInterruptStatusSql = sql<StudioInterruptStatus | null>`(
  select case
    when linked.status = 'pending'
      and linked.expires_at is not null
      and linked.expires_at <= now()
    then 'expired'
    else linked.status
  end
  from studio_interrupts as linked
  where linked.organization_id = "studio_sessions"."organization_id"
    and linked.project_id = "studio_sessions"."project_id"
    and linked.interrupt_id = "studio_sessions"."pending_interrupt_id"
  limit 1
)`;
const sessionInterruptExpiresAtSql = sql<string | null>`(
  select linked.expires_at
  from studio_interrupts as linked
  where linked.organization_id = "studio_sessions"."organization_id"
    and linked.project_id = "studio_sessions"."project_id"
    and linked.interrupt_id = "studio_sessions"."pending_interrupt_id"
  limit 1
)`;
const interruptStatusOrder = sql<number>`case ${effectiveInterruptStatusSql}
  when 'pending' then 0
  when 'resolved' then 1
  when 'expired' then 2
  when 'failed' then 3
  when 'cancelled' then 4
  else 5 end`;

const directedOrder = (
  direction: "asc" | "desc",
  value: SQL | Parameters<typeof asc>[0],
) => (direction === "asc" ? asc(value) : desc(value));

const effectiveInterruptStatusCondition = (
  statuses: string[],
): SQL | undefined => {
  if (statuses.length === 0) return undefined;
  const conditions: SQL[] = [];
  if (statuses.includes("pending")) {
    const pending = and(
      eq(studioInterrupts.status, "pending"),
      or(
        isNull(studioInterrupts.expiresAt),
        gt(studioInterrupts.expiresAt, sql`now()`),
      ),
    );
    if (pending) conditions.push(pending);
  }
  if (statuses.includes("expired")) {
    const expired = or(
      eq(studioInterrupts.status, "expired"),
      and(
        eq(studioInterrupts.status, "pending"),
        lte(studioInterrupts.expiresAt, sql`now()`),
      ),
    );
    if (expired) conditions.push(expired);
  }
  const recordedStatuses = statuses.filter(
    (status) => status !== "pending" && status !== "expired",
  );
  if (recordedStatuses.length > 0) {
    conditions.push(inArray(studioInterrupts.status, recordedStatuses));
  }
  return conditions.length === 1 ? conditions[0] : or(...conditions);
};

const effectiveResumeOutcomeCondition = (
  outcomes: string[],
): SQL | undefined => {
  if (outcomes.length === 0) return undefined;
  const conditions: SQL[] = [];
  if (outcomes.includes("expired before resume")) {
    conditions.push(eq(effectiveInterruptStatusSql, "expired"));
  }
  const recordedOutcomes = outcomes.filter(
    (outcome) => outcome !== "expired before resume",
  );
  if (recordedOutcomes.length > 0) {
    conditions.push(inArray(studioInterrupts.resumeOutcome, recordedOutcomes));
  }
  return conditions.length === 1 ? conditions[0] : or(...conditions);
};

const isInterruptInteractionMode = (
  value: unknown,
): value is StudioInterruptInteractionMode =>
  value === "static-options" ||
  value === "dynamic-picker" ||
  value === "freeform" ||
  value === "unknown";

/**
 * Projection JSON survives application upgrades. Normalize rows written by
 * older Studio versions instead of requiring a blocking database backfill.
 */
export const normalizeStudioInterruptProjection = (
  interrupt: StudioInterrupt,
  now: Date | number = Date.now(),
): StudioInterrupt => {
  const legacy = interrupt as StudioInterrupt &
    Partial<
      Pick<
        StudioInterrupt,
        | "interactionMode"
        | "schemaId"
        | "schemaVersion"
        | "options"
        | "responseCaptured"
      >
    >;
  const interactionMode = isInterruptInteractionMode(legacy.interactionMode)
    ? legacy.interactionMode
    : legacy.type === "text"
      ? "freeform"
      : (legacy.type === "choice" || legacy.type === "multi-choice") &&
          legacy.optionCount !== null &&
          legacy.optionCount > 0
        ? "static-options"
        : "unknown";
  return {
    ...interrupt,
    status: resolveStudioInterruptStatus(interrupt, now),
    interactionMode,
    schemaId: legacy.schemaId ?? null,
    schemaVersion: legacy.schemaVersion ?? null,
    options: Array.isArray(legacy.options) ? legacy.options : null,
    responseCaptured:
      typeof legacy.responseCaptured === "boolean"
        ? legacy.responseCaptured
        : legacy.response !== null,
    resumeOutcome:
      resolveStudioInterruptStatus(interrupt, now) === "expired"
        ? "expired before resume"
        : interrupt.resumeOutcome,
  };
};

export const normalizeStudioRunProjection = (
  run: StudioRun,
  now: Date | number = Date.now(),
): StudioRun => {
  const interruptExpiresAt = normalizeProjectionDateTime(
    run.interruptExpiresAt,
  );
  const interruptStatus = run.interruptStatus
    ? resolveStudioInterruptStatus(
        {
          status: run.interruptStatus,
          expiresAt: interruptExpiresAt,
        },
        now,
      )
    : null;
  return {
    ...run,
    interruptId: run.interruptId ?? null,
    interruptStatus,
    interruptExpiresAt,
    result:
      run.status === "interrupted" && interruptStatus === "expired"
        ? `Input expired${run.interruptNodeId ? ` at ${run.interruptNodeId}` : ""}`
        : run.result,
  };
};

export const normalizeStudioSessionProjection = (
  session: StudioSession,
  now: Date | number = Date.now(),
): StudioSession => {
  const interruptExpiresAt = normalizeProjectionDateTime(
    session.interruptExpiresAt,
  );
  const interruptStatus = session.interruptStatus
    ? resolveStudioInterruptStatus(
        {
          status: session.interruptStatus,
          expiresAt: interruptExpiresAt,
        },
        now,
      )
    : null;
  return {
    ...session,
    interruptStatus,
    interruptExpiresAt,
    latestResult:
      session.status === "interrupted" && interruptStatus === "expired"
        ? "Input expired"
        : session.latestResult,
  };
};

export const listStudioRuns = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    query: StudioListQuery;
  },
): Promise<StudioListPage<StudioRun>> => {
  const { query } = input;
  const statuses = queryValues(query.status);
  const providers = queryValues(query.provider);
  const minimumCost = queryNumber(query.minCost);
  const minimumDurationMs = queryNumber(query.minDuration) * 1_000;
  const minimumTokens = queryNumber(query.minTokens);
  const timeRange = resolveListTimeRange(query);
  const conditions = [
    eq(studioRuns.organizationId, input.organizationId),
    eq(studioRuns.projectId, input.projectId),
    query.env && query.env !== "All environments"
      ? eq(studioRuns.environment, query.env)
      : undefined,
    statuses.length > 0 ? inArray(studioRuns.status, statuses) : undefined,
    providers.length > 0 ? inArray(studioRuns.provider, providers) : undefined,
    queryBoolean(query.tool) ? eq(studioRuns.hasTool, true) : undefined,
    containsJsonValue(studioRuns.workflowIds, query.workflow),
    query.workflow && query.version
      ? sql`${studioRuns.data} -> 'workflowRefs' @> ${JSON.stringify([
          {
            workflowId: query.workflow.trim(),
            declaredVersion: query.version.trim(),
          },
        ])}::jsonb`
      : containsJsonValue(studioRuns.workflowVersions, query.version),
    containsJsonValue(studioRuns.transitionIds, query.transition),
    containsJsonValue(studioRuns.path, query.path),
    query.session
      ? ilike(studioRuns.sessionId, `%${query.session.trim()}%`)
      : undefined,
    query.model
      ? ilike(studioRuns.model, `%${query.model.trim()}%`)
      : undefined,
    query.result
      ? sql`${studioRuns.data} ->> 'result' ilike ${`%${query.result.trim()}%`}`
      : undefined,
    minimumCost > 0 ? gte(studioRuns.cost, minimumCost) : undefined,
    minimumDurationMs > 0
      ? gte(studioRuns.durationMs, minimumDurationMs)
      : undefined,
    minimumTokens > 0 ? gte(studioRuns.tokens, minimumTokens) : undefined,
    query.q ? ilike(studioRuns.searchText, `%${query.q.trim()}%`) : undefined,
    ...timeRangeConditions(studioRuns.startedAt, timeRange),
  ];
  const where = and(...conditions);
  const direction = query.dir === "asc" ? "asc" : "desc";
  const sortExpression =
    query.sort === "duration"
      ? sql`coalesce(${studioRuns.durationMs}, -1)`
      : query.sort === "tokens"
        ? sql`coalesce(${studioRuns.tokens}, -1)`
        : query.sort === "cost"
          ? sql`coalesce(${studioRuns.cost}, -1)`
          : query.sort === "status"
            ? runStatusOrder
            : studioRuns.startedAt;
  const { cursor, pageSize } = pageOptions(query);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        data: studioRuns.data,
        interruptId: latestRunInterruptIdSql,
        interruptStatus: latestRunInterruptStatusSql,
        interruptExpiresAt: latestRunInterruptExpiresAtSql,
      })
      .from(studioRuns)
      .where(where)
      .orderBy(
        directedOrder(direction, sortExpression),
        directedOrder(direction, studioRuns.runId),
      )
      .limit(pageSize)
      .offset(cursor),
    db.select({ value: count() }).from(studioRuns).where(where),
  ]);
  return {
    items: rows.map((row) =>
      normalizeStudioRunProjection({
        ...row.data,
        interruptId: row.interruptId ?? row.data.interruptId ?? null,
        interruptStatus:
          row.interruptStatus ?? row.data.interruptStatus ?? null,
        interruptExpiresAt:
          row.interruptExpiresAt ?? row.data.interruptExpiresAt ?? null,
      }),
    ),
    totalCount: totalRows[0]?.value ?? 0,
  };
};

export const listStudioSessions = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    query: StudioListQuery;
  },
): Promise<StudioListPage<StudioSession>> => {
  const { query } = input;
  const statuses = queryValues(query.status);
  const minimumCost = queryNumber(query.minCost);
  const maximumCost = queryNumber(query.maxCost);
  const minimumTokens = queryNumber(query.minTokens);
  const maximumTokens = queryNumber(query.maxTokens);
  const minimumDurationMs = queryNumber(query.minDuration) * 1_000;
  const maximumDurationMs = queryNumber(query.maxDuration) * 1_000;
  const timeRange = resolveListTimeRange(query);
  const conditions = [
    eq(studioSessions.organizationId, input.organizationId),
    eq(studioSessions.projectId, input.projectId),
    query.env && query.env !== "All environments"
      ? eq(studioSessions.environment, query.env)
      : undefined,
    statuses.length > 0 ? inArray(studioSessions.status, statuses) : undefined,
    queryBoolean(query.error) ? eq(studioSessions.hasError, true) : undefined,
    queryBoolean(query.interrupt)
      ? eq(studioSessions.hasInterrupt, true)
      : undefined,
    queryBoolean(query.checkpoint)
      ? eq(studioSessions.hasCheckpoint, true)
      : undefined,
    queryBoolean(query.fork) ? eq(studioSessions.hasFork, true) : undefined,
    containsJsonValue(studioSessions.workflowIds, query.workflow),
    query.user
      ? ilike(studioSessions.userId, `%${query.user.trim()}%`)
      : undefined,
    query.tenant
      ? ilike(studioSessions.tenantId, `%${query.tenant.trim()}%`)
      : undefined,
    containsJsonValue(studioSessions.providers, query.provider),
    containsJsonValue(studioSessions.models, query.model),
    containsJsonValue(studioSessions.tags, query.tags),
    minimumCost > 0 ? gte(studioSessions.cost, minimumCost) : undefined,
    maximumCost > 0 ? lte(studioSessions.cost, maximumCost) : undefined,
    minimumTokens > 0 ? gte(studioSessions.tokens, minimumTokens) : undefined,
    maximumTokens > 0 ? lte(studioSessions.tokens, maximumTokens) : undefined,
    minimumDurationMs > 0
      ? gte(studioSessions.durationMs, minimumDurationMs)
      : undefined,
    maximumDurationMs > 0
      ? lte(studioSessions.durationMs, maximumDurationMs)
      : undefined,
    query.q
      ? ilike(studioSessions.searchText, `%${query.q.trim()}%`)
      : undefined,
    ...timeRangeConditions(studioSessions.lastActivityAt, timeRange),
  ];
  const where = and(...conditions);
  const direction = query.dir === "asc" ? "asc" : "desc";
  const sortExpression =
    query.sort === "duration"
      ? sql`coalesce(${studioSessions.durationMs}, -1)`
      : query.sort === "tokens"
        ? sql`coalesce(${studioSessions.tokens}, -1)`
        : query.sort === "cost"
          ? sql`coalesce(${studioSessions.cost}, -1)`
          : query.sort === "runs"
            ? studioSessions.runCount
            : query.sort === "status"
              ? sessionStatusOrder
              : studioSessions.lastActivityAt;
  const { cursor, pageSize } = pageOptions(query);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        data: studioSessions.data,
        interruptStatus: sessionInterruptStatusSql,
        interruptExpiresAt: sessionInterruptExpiresAtSql,
      })
      .from(studioSessions)
      .where(where)
      .orderBy(
        directedOrder(direction, sortExpression),
        directedOrder(direction, studioSessions.sessionId),
      )
      .limit(pageSize)
      .offset(cursor),
    db.select({ value: count() }).from(studioSessions).where(where),
  ]);
  return {
    items: rows.map((row) =>
      normalizeStudioSessionProjection({
        ...row.data,
        interruptStatus:
          row.interruptStatus ?? row.data.interruptStatus ?? null,
        interruptExpiresAt:
          row.interruptExpiresAt ?? row.data.interruptExpiresAt ?? null,
      }),
    ),
    totalCount: totalRows[0]?.value ?? 0,
  };
};

export const listStudioInterrupts = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    query: StudioListQuery;
  },
): Promise<StudioListPage<StudioInterrupt>> => {
  const { query } = input;
  const statuses = queryValues(query.status);
  const types = queryValues(query.type);
  const outcomes = queryValues(query.outcome);
  const minimumAgeMs = queryNumber(query.minAge) * 60_000;
  const maximumAgeMs = queryNumber(query.maxAge) * 60_000;
  const now = Date.now();
  const timeRange = resolveListTimeRange(query);
  const conditions = [
    eq(studioInterrupts.organizationId, input.organizationId),
    eq(studioInterrupts.projectId, input.projectId),
    query.env && query.env !== "All environments"
      ? eq(studioInterrupts.environment, query.env)
      : undefined,
    effectiveInterruptStatusCondition(statuses),
    types.length > 0 ? inArray(studioInterrupts.type, types) : undefined,
    effectiveResumeOutcomeCondition(outcomes),
    queryBoolean(query.error) ? eq(studioInterrupts.hasError, true) : undefined,
    query.workflow
      ? ilike(studioInterrupts.workflowId, `%${query.workflow.trim()}%`)
      : undefined,
    query.node
      ? ilike(studioInterrupts.nodeId, `%${query.node.trim()}%`)
      : undefined,
    query.session
      ? ilike(studioInterrupts.sessionId, `%${query.session.trim()}%`)
      : undefined,
    query.user
      ? ilike(studioInterrupts.userId, `%${query.user.trim()}%`)
      : undefined,
    query.tenant
      ? ilike(studioInterrupts.tenantId, `%${query.tenant.trim()}%`)
      : undefined,
    query.resolver
      ? ilike(studioInterrupts.resolvedBy, `%${query.resolver.trim()}%`)
      : undefined,
    minimumAgeMs > 0
      ? lte(studioInterrupts.createdAt, new Date(now - minimumAgeMs))
      : undefined,
    maximumAgeMs > 0
      ? gte(studioInterrupts.createdAt, new Date(now - maximumAgeMs))
      : undefined,
    query.q
      ? ilike(studioInterrupts.searchText, `%${query.q.trim()}%`)
      : undefined,
    ...timeRangeConditions(studioInterrupts.createdAt, timeRange),
  ];
  const where = and(...conditions);
  const direction = query.dir === "desc" ? "desc" : "asc";
  const regularSort =
    query.sort === "status"
      ? interruptStatusOrder
      : query.sort === "age"
        ? sql<number>`-extract(epoch from ${studioInterrupts.createdAt})`
        : studioInterrupts.createdAt;
  const priorityStatus = sql<number>`case when ${effectiveInterruptStatusSql} = 'pending' then 0 else 1 end`;
  const priorityTime = sql<number>`case
    when ${effectiveInterruptStatusSql} = 'pending'
      then extract(epoch from ${studioInterrupts.createdAt})
    else -extract(epoch from ${studioInterrupts.createdAt})
    end`;
  const order =
    !query.sort || query.sort === "priority"
      ? [
          directedOrder(direction, priorityStatus),
          directedOrder(direction, priorityTime),
          directedOrder(direction, studioInterrupts.interruptId),
        ]
      : [
          directedOrder(direction, regularSort),
          directedOrder(direction, studioInterrupts.interruptId),
        ];
  const { cursor, pageSize } = pageOptions(query);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        data: studioInterrupts.data,
        effectiveStatus: effectiveInterruptStatusSql,
      })
      .from(studioInterrupts)
      .where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset(cursor),
    db.select({ value: count() }).from(studioInterrupts).where(where),
  ]);
  return {
    items: rows.map((row) =>
      normalizeStudioInterruptProjection(
        { ...row.data, status: row.effectiveStatus },
        now,
      ),
    ),
    totalCount: totalRows[0]?.value ?? 0,
  };
};
