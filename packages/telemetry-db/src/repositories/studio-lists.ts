import {
  LEGACY_TABLE_FILTERS,
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
  type asc,
  count,
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
import { withRunFeedback } from "./scores";
import {
  parseStudioFilters,
  studioFiltersCondition,
  studioSortExpression,
} from "./table-filters";

export type StudioListQuery = Record<string, string | undefined>;

export type StudioListPage<T> = {
  items: T[];
  totalCount: number;
};

const _queryValues = (value: string | undefined): string[] =>
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

const _containsJsonValue = (
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
) =>
  direction === "asc"
    ? sql`${value} asc nulls last`
    : sql`${value} desc nulls last`;

const _effectiveInterruptStatusCondition = (
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

const _effectiveResumeOutcomeCondition = (
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
        | "contract"
        | "schemaId"
        | "schemaVersion"
        | "request"
        | "requestCaptured"
        | "options"
        | "responseValue"
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
    contract: legacy.contract ?? null,
    schemaId: legacy.schemaId ?? null,
    schemaVersion: legacy.schemaVersion ?? null,
    request:
      legacy.request && typeof legacy.request === "object"
        ? legacy.request
        : null,
    requestCaptured:
      typeof legacy.requestCaptured === "boolean"
        ? legacy.requestCaptured
        : legacy.request !== null && legacy.request !== undefined,
    options: Array.isArray(legacy.options) ? legacy.options : null,
    responseValue: legacy.responseValue ?? null,
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
    runIds?: readonly string[];
  },
): Promise<StudioListPage<StudioRun>> => {
  const filters = parseStudioFilters(input.query, "runs");
  const query = { ...input.query };
  for (const alias of Object.keys(LEGACY_TABLE_FILTERS)) delete query[alias];
  if (input.runIds?.length === 0) return { items: [], totalCount: 0 };
  const timeRange = resolveListTimeRange(query);
  const conditions = [
    eq(studioRuns.organizationId, input.organizationId),
    eq(studioRuns.projectId, input.projectId),
    query.env && query.env !== "All environments"
      ? eq(studioRuns.environment, query.env)
      : undefined,
    query.q ? ilike(studioRuns.searchText, `%${query.q.trim()}%`) : undefined,
    ...timeRangeConditions(studioRuns.startedAt, timeRange),
    input.runIds ? inArray(studioRuns.runId, [...input.runIds]) : undefined,
    queryBoolean(query.includeChildren) ||
    filters.rules.some((rule) =>
      ["execution", "parentRunId", "callId"].includes(rule.field),
    )
      ? undefined
      : sql`${studioRuns.data} ->> 'parentRunId' is null`,
  ];
  const where = and(...conditions, studioFiltersCondition("runs", filters));
  const direction = query.dir === "asc" ? "asc" : "desc";
  const sortExpression =
    studioSortExpression("runs", query.sort) ??
    (query.sort === "duration"
      ? sql`coalesce(${studioRuns.durationMs}, -1)`
      : query.sort === "tokens"
        ? sql`coalesce(${studioRuns.tokens}, -1)`
        : query.sort === "cost"
          ? sql`coalesce(${studioRuns.cost}, -1)`
          : query.sort === "status"
            ? runStatusOrder
            : studioRuns.startedAt);
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
    items: await withRunFeedback(
      db,
      input,
      rows.map((row) =>
        normalizeStudioRunProjection({
          ...row.data,
          interruptId: row.interruptId ?? row.data.interruptId ?? null,
          interruptStatus:
            row.interruptStatus ?? row.data.interruptStatus ?? null,
          interruptExpiresAt:
            row.interruptExpiresAt ?? row.data.interruptExpiresAt ?? null,
        }),
      ),
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
  const filters = parseStudioFilters(input.query, "sessions");
  const query = { ...input.query };
  for (const alias of Object.keys(LEGACY_TABLE_FILTERS)) delete query[alias];
  const timeRange = resolveListTimeRange(query);
  const conditions = [
    eq(studioSessions.organizationId, input.organizationId),
    eq(studioSessions.projectId, input.projectId),
    query.env && query.env !== "All environments"
      ? eq(studioSessions.environment, query.env)
      : undefined,
    query.q
      ? ilike(studioSessions.searchText, `%${query.q.trim()}%`)
      : undefined,
    ...timeRangeConditions(studioSessions.lastActivityAt, timeRange),
  ];
  const where = and(...conditions, studioFiltersCondition("sessions", filters));
  const direction = query.dir === "asc" ? "asc" : "desc";
  const sortExpression =
    studioSortExpression("sessions", query.sort) ??
    (query.sort === "duration"
      ? sql`coalesce(${studioSessions.durationMs}, -1)`
      : query.sort === "tokens"
        ? sql`coalesce(${studioSessions.tokens}, -1)`
        : query.sort === "cost"
          ? sql`coalesce(${studioSessions.cost}, -1)`
          : query.sort === "runs"
            ? studioSessions.runCount
            : query.sort === "status"
              ? sessionStatusOrder
              : studioSessions.lastActivityAt);
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
  const filters = parseStudioFilters(input.query, "interrupts");
  const query = { ...input.query };
  for (const alias of Object.keys(LEGACY_TABLE_FILTERS)) delete query[alias];
  const timeRange = resolveListTimeRange(query);
  const conditions = [
    eq(studioInterrupts.organizationId, input.organizationId),
    eq(studioInterrupts.projectId, input.projectId),
    query.env && query.env !== "All environments"
      ? eq(studioInterrupts.environment, query.env)
      : undefined,
    query.q
      ? ilike(studioInterrupts.searchText, `%${query.q.trim()}%`)
      : undefined,
    ...timeRangeConditions(studioInterrupts.createdAt, timeRange),
  ];
  const where = and(
    ...conditions,
    studioFiltersCondition("interrupts", filters),
  );
  const direction = query.dir === "desc" ? "desc" : "asc";
  const regularSort =
    studioSortExpression("interrupts", query.sort) ??
    (query.sort === "status"
      ? interruptStatusOrder
      : query.sort === "age"
        ? sql<number>`-extract(epoch from ${studioInterrupts.createdAt})`
        : studioInterrupts.createdAt);
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
        Date.now(),
      ),
    ),
    totalCount: totalRows[0]?.value ?? 0,
  };
};
