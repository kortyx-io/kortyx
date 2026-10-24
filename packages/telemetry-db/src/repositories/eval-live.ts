import { createHash } from "node:crypto";
import type {
  EvalCaseResult,
  EvalCosts,
  EvalJudgeIdentity,
  StudioEvalCaseSummary,
  StudioEvalLiveDetail,
} from "@kortyx/agent/evals";
import { and, asc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError } from "../errors";
import { evalRunEvents, evalRuns, telemetryEvents } from "../schema";
import {
  calculateEvalAttemptCosts,
  type EvalBillingAttempt,
  evalBillingGenerationSelection,
  matchesEvalAttempt,
  sumEvalCosts,
} from "./eval-costs";
import {
  type Attempt,
  compactIssue,
  type EvalLiveProjection,
  emptyEvalLiveProjection,
  type ProjectionCase,
  type ProjectionProgress,
  projectEvalProgress,
} from "./eval-live-projection";
import {
  getModelRateCardVersion,
  listApplicableModelRateCards,
} from "./model-rate-cards";

type Run = typeof evalRuns.$inferSelect;
type ProjectionSource = Pick<
  Run,
  "id" | "organizationId" | "projectId" | "environment" | "liveProjection"
> & {
  result: { cases: ProjectionCase[]; errors?: EvalCaseResult["errors"] } | null;
};
export type EvalLiveSummary = Omit<
  StudioEvalLiveDetail,
  "suite" | "request"
> & { judge?: EvalJudgeIdentity | undefined; resultRecorded: boolean };
export type EvalLiveRun = EvalLiveSummary & {
  suite: Run["suite"];
  request: Run["request"];
};
type Scope = {
  organizationId: string;
  projectId: string;
  environment?: string | undefined;
};
// Historical warming must also stay small: project inside PostgreSQL, before
// any observations, prompt inputs or criterion evidence reach the API process.
const compactIssueSql = (
  value: SQL,
) => sql`jsonb_strip_nulls(jsonb_build_object(
  'phase', ${value}->'phase', 'code', ${value}->'code',
  'message', CASE WHEN length(${value}->>'message')>2000 THEN left(${value}->>'message',2000)||'…' ELSE ${value}->>'message' END,
  'diagnosticId', ${value}->'diagnosticId'))`;
const compactIssuesSql = (
  value: SQL,
) => sql`coalesce((SELECT jsonb_agg(${compactIssueSql(sql`live_issue`)})
  FROM jsonb_array_elements(coalesce(${value}, '[]'::jsonb)) AS live_issues(live_issue)), '[]'::jsonb)`;
const compactStepSql = (value: SQL) => sql`jsonb_strip_nulls(jsonb_build_object(
  'index', ${value}->'index', 'status', ${value}->'status',
  'reason', CASE WHEN length(${value}->>'reason')>2000 THEN left(${value}->>'reason',2000)||'…' ELSE ${value}->>'reason' END,
  'criteria', coalesce((SELECT jsonb_agg(jsonb_build_object('passed', criterion->'passed'))
    FROM jsonb_array_elements(coalesce(${value}->'criteria', '[]'::jsonb)) criterion), '[]'::jsonb),
  'expectation', '{}'::jsonb,
  'judgeUsage', coalesce(${value}->'judgeUsage', '[]'::jsonb),
  'judgeCalls', coalesce(${value}->'judgeCalls', to_jsonb(CASE WHEN ${value}->>'status'='ungraded' THEN 0
    ELSE jsonb_array_length(coalesce(${value}->'criteria', '[]'::jsonb)) +
      CASE WHEN ${value}->>'status'='error' AND jsonb_array_length(coalesce(${value}->'expectation'->'criteria', '[]'::jsonb))>0 THEN 1 ELSE 0 END END))
))`;
const compactCaseSql = (value: SQL) => sql`jsonb_strip_nulls(jsonb_build_object(
  'caseId', ${value}->'caseId', 'repetition', ${value}->'repetition',
  'attemptId', ${value}->'attemptId', 'sessionId', ${value}->'sessionId',
  'runtimeExecutions', ${value}->'runtimeExecutions', 'status', ${value}->'status',
  'durationMs', ${value}->'durationMs', 'phaseDurationsMs', ${value}->'phaseDurationsMs',
  'errors', ${compactIssuesSql(sql`${value}->'errors'`)},
  'steps', coalesce((SELECT jsonb_agg(${compactStepSql(sql`step`)})
    FROM jsonb_array_elements(coalesce(${value}->'steps', '[]'::jsonb)) step), '[]'::jsonb)
))`;
const compactProgressSql = sql<ProjectionProgress>`CASE ${evalRunEvents.event}->>'type'
  WHEN 'step-completed' THEN jsonb_build_object('type', 'step-completed',
    'caseId', ${evalRunEvents.event}->'caseId', 'repetition', ${evalRunEvents.event}->'repetition',
    'step', ${compactStepSql(sql`${evalRunEvents.event}->'step'`)})
  WHEN 'case-completed' THEN jsonb_build_object('type', 'case-completed',
    'result', ${compactCaseSql(sql`${evalRunEvents.event}->'result'`)})
  ELSE ${evalRunEvents.event} END`;
const compactResultSql = sql<
  ProjectionSource["result"]
>`CASE WHEN ${evalRuns.result} IS NULL THEN NULL
  ELSE jsonb_build_object('errors', ${compactIssuesSql(sql`${evalRuns.result}->'errors'`)}, 'cases', coalesce((SELECT jsonb_agg(${compactCaseSql(sql`item`)})
    FROM jsonb_array_elements(${evalRuns.result}->'cases') item), '[]'::jsonb)) END`;
const billingAttempt = (attempt: Attempt): EvalBillingAttempt => ({
  sessionId: attempt.summary.sessionId ?? "",
  attemptId: attempt.attemptId,
  runtimeExecutions: attempt.runtimeExecutions,
  finished: ["passed", "failed", "error", "cancelled"].includes(
    attempt.summary.status,
  ),
  steps: attempt.steps.map((step) => ({
    ...step,
    criteria: [],
    expectation: {},
  })),
});

/** Only changed attempts are priced; SELECT excludes all conversation evidence. */
export async function priceEvalProjection(
  db: TelemetryDb,
  run: Pick<Run, "organizationId" | "projectId" | "environment">,
  projection: EvalLiveProjection,
  keys = Object.keys(projection.attempts),
) {
  const pricingVersion = await getModelRateCardVersion(db, run);
  const selected = (
    projection.pricingVersion === pricingVersion
      ? keys
      : Object.keys(projection.attempts)
  )
    .map((key) => projection.attempts[key])
    .filter((a): a is Attempt => Boolean(a?.summary.sessionId));
  projection.pricingVersion = pricingVersion;
  if (!selected.length) return;
  const filters = selected.flatMap((a) =>
    a.attemptId
      ? a.runtimeExecutions.map((r) =>
          and(
            eq(telemetryEvents.sessionId, r.sessionId),
            eq(telemetryEvents.runId, r.runId),
            sql`${telemetryEvents.payload}->>'evalAttemptId' = ${a.attemptId}`,
          ),
        )
      : [
          and(
            eq(telemetryEvents.sessionId, a.summary.sessionId ?? ""),
            sql`${telemetryEvents.payload}->>'evalAttemptId' IS NULL`,
          ),
        ],
  );
  const [rates, generations] = await Promise.all([
    listApplicableModelRateCards(db, run),
    filters.length
      ? db
          .select(evalBillingGenerationSelection)
          .from(telemetryEvents)
          .where(
            and(
              eq(telemetryEvents.organizationId, run.organizationId),
              eq(telemetryEvents.projectId, run.projectId),
              eq(telemetryEvents.environment, run.environment),
              eq(telemetryEvents.type, "generation.completed"),
              or(...filters),
            ),
          )
      : Promise.resolve([]),
  ]);
  for (const attempt of selected) {
    const billing = billingAttempt(attempt);
    attempt.summary.costs = calculateEvalAttemptCosts(
      billing,
      generations.filter((event) => matchesEvalAttempt(billing, event)),
      rates,
    );
    if (projection.dirtyBilling)
      delete projection.dirtyBilling[
        attempt.attemptId
          ? `a:${attempt.attemptId}`
          : `s:${attempt.summary.sessionId}`
      ];
  }
}

/** Caller holds the run lock. Old rows are built once, never on every live read. */
export async function initializeEvalProjection(
  db: TelemetryDb,
  run: ProjectionSource,
  pricingVersion?: string,
  persist = true,
): Promise<EvalLiveProjection> {
  if (run.liveProjection) {
    const projection = run.liveProjection;
    const dirty = Object.entries(projection.attempts)
      .filter(
        ([, a]) =>
          projection.dirtyBilling?.[
            a.attemptId ? `a:${a.attemptId}` : `s:${a.summary.sessionId}`
          ],
      )
      .map(([key]) => key);
    if (
      dirty.length ||
      (pricingVersion !== undefined &&
        projection.pricingVersion !== pricingVersion)
    ) {
      await priceEvalProjection(db, run, projection, dirty);
      projection.revision++;
      if (persist)
        await db
          .update(evalRuns)
          .set({ liveProjection: projection })
          .where(eq(evalRuns.id, run.id));
    }
    return projection;
  }
  const projection = emptyEvalLiveProjection();
  projection.errors = (run.result?.errors ?? []).map(compactIssue);
  if (!run.result) {
    let after = 0;
    for (;;) {
      const events = await db
        .select({ id: evalRunEvents.id, event: compactProgressSql })
        .from(evalRunEvents)
        .where(
          and(
            eq(evalRunEvents.organizationId, run.organizationId),
            eq(evalRunEvents.projectId, run.projectId),
            eq(evalRunEvents.runId, run.id),
            sql`${evalRunEvents.id} > ${after}`,
          ),
        )
        .orderBy(asc(evalRunEvents.id))
        .limit(50);
      for (const { event } of events) projectEvalProgress(projection, event);
      if (events.length < 50) break;
      const last = events.at(-1);
      if (!last) break;
      after = last.id;
    }
  }
  for (const result of run.result?.cases ?? [])
    projectEvalProgress(projection, { type: "case-completed", result });
  await priceEvalProjection(db, run, projection);
  projection.revision++;
  if (persist)
    await db
      .update(evalRuns)
      .set({ liveProjection: projection })
      .where(eq(evalRuns.id, run.id));
  return projection;
}

/** Derived UI/billing failures must not roll back canonical progress or results. */
export async function maintainEvalProjection(
  db: TelemetryDb,
  run: ProjectionSource,
  apply: (tx: TelemetryDb, projection: EvalLiveProjection) => Promise<void>,
) {
  try {
    await db.transaction(async (tx) => {
      const projection = await initializeEvalProjection(tx as TelemetryDb, run);
      await apply(tx as TelemetryDb, projection);
      projection.revision++;
      await tx
        .update(evalRuns)
        .set({ liveProjection: projection })
        .where(eq(evalRuns.id, run.id));
    });
  } catch {
    await db
      .update(evalRuns)
      .set({ liveProjection: null })
      .where(eq(evalRuns.id, run.id));
    console.warn("Evaluation live view maintenance was deferred.");
  }
}

const scopeWhere = (scope: Scope) =>
  and(
    eq(evalRuns.organizationId, scope.organizationId),
    eq(evalRuns.projectId, scope.projectId),
    scope.environment ? eq(evalRuns.environment, scope.environment) : undefined,
  );

/** Late, duplicate and out-of-order billing is reconciled at ingestion, independent of viewers. */
export async function refreshEvalBilling(
  db: TelemetryDb,
  scope: Scope,
  identities: { environment: string; attemptId?: string; sessionId?: string }[],
) {
  const matches = identities.flatMap((id) =>
    id.attemptId
      ? [
          sql`${evalRuns.liveProjection} @> ${JSON.stringify({ attemptIds: [id.attemptId] })}::jsonb`,
        ]
      : id.sessionId
        ? [
            sql`${evalRuns.liveProjection} @> ${JSON.stringify({ sessionIds: [id.sessionId] })}::jsonb`,
          ]
        : [],
  );
  if (!matches.length) return;
  const runs = await db
    .select({
      id: evalRuns.id,
      organizationId: evalRuns.organizationId,
      projectId: evalRuns.projectId,
      environment: evalRuns.environment,
      liveProjection: evalRuns.liveProjection,
    })
    .from(evalRuns)
    .where(and(scopeWhere(scope), or(...matches)))
    .orderBy(evalRuns.id)
    .for("update");
  for (const run of runs) {
    const projection = run.liveProjection;
    if (!projection) continue;
    const keys = Object.entries(projection.attempts)
      .filter(([, a]) =>
        identities.some(
          (id) =>
            id.environment === run.environment &&
            (a.attemptId
              ? a.attemptId === id.attemptId
              : !id.attemptId && a.summary.sessionId === id.sessionId),
        ),
      )
      .map(([key]) => key);
    if (!keys.length) continue;
    await maintainEvalProjection(
      db,
      { ...run, result: null },
      async (projectionDb, current) => {
        await priceEvalProjection(projectionDb, run, current, keys);
      },
    );
  }
}

export function evalProjectionCosts(
  projection: { cases: StudioEvalCaseSummary[] },
  status: string,
): EvalCosts | undefined {
  const parts = projection.cases.flatMap((a) => (a.costs ? [a.costs] : []));
  if (!parts.length) return;
  const workflow = sumEvalCosts(parts.map((c) => c.workflow));
  const judge = sumEvalCosts(parts.map((c) => c.judge));
  if (status === "running" || status === "queued")
    for (const cost of [workflow, judge]) {
      if (cost.amount !== null) cost.status = "partial";
      if (cost.costSummary) cost.costSummary.complete = false;
    }
  return { workflow, judge, total: sumEvalCosts([workflow, judge]) };
}

// Drizzle wraps driver errors; only write-authority failures permit a read-only fallback.
function cacheWriteDenied(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    if ("code" in error && ["42501", "25006"].includes(String(error.code)))
      return true;
    error = "cause" in error ? error.cause : undefined;
  }
  return false;
}

/** Public live reads exclude results, progress payloads and private billing inputs at SQL level. */
async function readEvalLiveRuns(
  db: TelemetryDb,
  scope: Scope,
  ids: string[],
  includeDefinition: boolean,
  reconciliations = 0,
  readOnlyProjections = new Map<string, EvalLiveProjection>(),
): Promise<
  (EvalLiveSummary & {
    suite: Run["suite"] | null;
    request: Run["request"] | null;
  })[]
> {
  if (!ids.length) return [];
  const pricingVersion = await getModelRateCardVersion(db, scope);
  const rows = await db
    .select({
      id: evalRuns.id,
      evaluationId: evalRuns.evaluationId,
      targetId: evalRuns.targetId,
      targetName: evalRuns.targetName,
      environment: evalRuns.environment,
      suiteId: evalRuns.suiteId,
      suiteRevision: evalRuns.suiteRevision,
      suite: includeDefinition
        ? evalRuns.suite
        : sql<Run["suite"] | null>`NULL`,
      request: includeDefinition
        ? evalRuns.request
        : sql<Run["request"] | null>`NULL`,
      judge: sql<EvalJudgeIdentity | null>`${evalRuns.request}->'judge'`,
      suiteName: sql<string | null>`${evalRuns.suite}->>'name'`,
      resolvedSettings: sql<
        Run["request"]["resolvedSettings"]
      >`${evalRuns.request}->'resolvedSettings'`,
      totalAttempts: sql<number>`coalesce(jsonb_array_length(${evalRuns.request}->'caseIds'), jsonb_array_length(${evalRuns.suite}->'cases'), 0) * coalesce((${evalRuns.request}->>'repetitions')::integer, 1)`,
      status: evalRuns.status,
      createdAt: evalRuns.createdAt,
      startedAt: evalRuns.startedAt,
      endedAt: evalRuns.endedAt,
      cancelRequestedAt: evalRuns.cancelRequestedAt,
      error: sql<
        string | null
      >`CASE WHEN length(${evalRuns.error})>2000 THEN left(${evalRuns.error},2000)||'…' ELSE ${evalRuns.error} END`,
      issue: sql<
        Run["issue"]
      >`CASE WHEN ${evalRuns.issue} IS NULL THEN NULL ELSE ${compactIssueSql(sql`${evalRuns.issue}`)} END`,
      termination: evalRuns.termination,
      revision: sql<
        number | null
      >`(${evalRuns.liveProjection}->>'revision')::integer`,
      pricingVersion: sql<
        string | null
      >`${evalRuns.liveProjection}->>'pricingVersion'`,
      dirtyBilling: sql<boolean>`coalesce(${evalRuns.liveProjection}->'dirtyBilling', '{}'::jsonb) <> '{}'::jsonb`,
      cases: sql<
        StudioEvalCaseSummary[] | null
      >`(SELECT jsonb_agg(value->'summary') FROM jsonb_each(${evalRuns.liveProjection}->'attempts'))`,
      resultRecorded: sql<boolean>`${evalRuns.result} IS NOT NULL`,
      errors: sql<
        NonNullable<Run["result"]>["errors"]
      >`coalesce(${evalRuns.liveProjection}->'errors', '[]'::jsonb)`,
    })
    .from(evalRuns)
    .where(and(scopeWhere(scope), inArray(evalRuns.id, ids)));
  for (const row of rows) {
    const projection = readOnlyProjections.get(row.id);
    if (
      projection &&
      projection.pricingVersion === pricingVersion &&
      (row.revision === null ||
        row.dirtyBilling ||
        row.pricingVersion !== pricingVersion)
    ) {
      row.revision = projection.revision;
      row.cases = Object.values(projection.attempts).map(
        (attempt) => attempt.summary,
      );
      row.errors = projection.errors;
      row.pricingVersion = pricingVersion;
      row.dirtyBilling = false;
    }
  }
  const missing = rows.filter(
    (row) =>
      row.revision === null ||
      row.dirtyBilling ||
      row.pricingVersion !== pricingVersion,
  );
  if (missing.length && reconciliations >= 2)
    throw new Error("Evaluation progress is changing. Retry this read.");
  for (const row of missing) {
    try {
      await db.transaction(async (tx) => {
        const [run] = await tx
          .select({
            id: evalRuns.id,
            organizationId: evalRuns.organizationId,
            projectId: evalRuns.projectId,
            environment: evalRuns.environment,
            liveProjection: evalRuns.liveProjection,
          })
          .from(evalRuns)
          .where(and(scopeWhere(scope), eq(evalRuns.id, row.id)))
          .for("update")
          .limit(1);
        if (!run) throw new TelemetryNotFoundError("Eval run not found.");
        if (run.liveProjection)
          await initializeEvalProjection(
            tx as TelemetryDb,
            {
              ...run,
              result: null,
            },
            pricingVersion,
          );
        else {
          const [saved] = await tx
            .select({ result: compactResultSql })
            .from(evalRuns)
            .where(eq(evalRuns.id, run.id))
            .limit(1);
          await initializeEvalProjection(tx as TelemetryDb, {
            ...run,
            result: saved?.result ?? null,
          });
        }
      });
    } catch (error) {
      if (
        !cacheWriteDenied(error) &&
        !(error instanceof TelemetryNotFoundError)
      )
        throw error;
      // The failed cache savepoint has rolled back. A viewer needs SELECT only;
      // retain compact SQL evidence selection and never broaden its permissions.
      const [run] = await db
        .select({
          id: evalRuns.id,
          organizationId: evalRuns.organizationId,
          projectId: evalRuns.projectId,
          environment: evalRuns.environment,
          liveProjection: evalRuns.liveProjection,
          result: compactResultSql,
          evidenceVersion: sql<string>`${sql.raw(`md5(coalesce("eval_runs"."result"::text, '') || ':' || coalesce((SELECT max(evidence.id)::text FROM eval_run_events evidence WHERE evidence.run_id = "eval_runs"."id" AND evidence.organization_id = "eval_runs"."organization_id" AND evidence.project_id = "eval_runs"."project_id"), '0'))`)}`,
        })
        .from(evalRuns)
        .where(and(scopeWhere(scope), eq(evalRuns.id, row.id)))
        .limit(1);
      if (!run) throw new TelemetryNotFoundError("Eval run not found.");
      const projection = await initializeEvalProjection(
        db,
        run,
        pricingVersion,
        false,
      );
      // Reconstructing the same immutable evidence must not invalidate every poll.
      for (const [key, attempt] of Object.entries(projection.attempts))
        attempt.summary.evidenceVersion = createHash("sha256")
          .update(`${run.evidenceVersion}:${key}`)
          .digest("hex");
      readOnlyProjections.set(row.id, projection);
    }
  }
  if (missing.length)
    return readEvalLiveRuns(
      db,
      scope,
      ids,
      includeDefinition,
      reconciliations + 1,
      readOnlyProjections,
    );
  return rows.map((row) => {
    const cases = row.cases ?? [];
    const counts = { passed: 0, failed: 0, error: 0, cancelled: 0 };
    for (const item of cases)
      if (item.status in counts) counts[item.status as keyof typeof counts]++;
    const { revision, dirtyBilling: _, pricingVersion: __, ...publicRun } = row;
    const version = createHash("sha256")
      .update(
        JSON.stringify([
          revision,
          cases,
          row.status,
          row.startedAt,
          row.endedAt,
          row.cancelRequestedAt,
          row.error,
          row.issue,
          row.termination,
          row.errors,
        ]),
      )
      .digest("hex");
    return {
      ...publicRun,
      version,
      cases,
      counts,
      errors: row.errors ?? [],
      resolvedSettings: row.resolvedSettings ?? undefined,
      suiteName: row.suiteName,
      totalAttempts: row.totalAttempts,
      judge: row.judge ?? undefined,
      completedAttempts: Object.values(counts).reduce((a, b) => a + b, 0),
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
      costs: evalProjectionCosts({ cases }, row.status),
    };
  });
}

export async function getEvalLiveRuns(
  db: TelemetryDb,
  scope: Scope,
  ids: string[],
): Promise<EvalLiveRun[]> {
  return (await readEvalLiveRuns(db, scope, ids, true)).map((row) => {
    if (!row.suite || !row.request)
      throw new Error("Eval definition is unavailable.");
    return { ...row, suite: row.suite, request: row.request };
  });
}
export async function getEvalLiveState(
  db: TelemetryDb,
  scope: Scope,
  id: string,
) {
  const [row] = await readEvalLiveRuns(db, scope, [id], false);
  if (!row) throw new TelemetryNotFoundError("Eval run not found.");
  const { suite: _, request: __, ...state } = row;
  return state;
}
export async function getEvalLiveRun(
  db: TelemetryDb,
  scope: Scope,
  id: string,
): Promise<EvalLiveRun> {
  const [run] = await getEvalLiveRuns(db, scope, [id]);
  if (!run) throw new TelemetryNotFoundError("Eval run not found.");
  return run;
}

export async function getEvalLiveSummaries(
  db: TelemetryDb,
  scope: Scope,
  ids: string[],
): Promise<EvalLiveSummary[]> {
  return (await readEvalLiveRuns(db, scope, ids, false)).map(
    ({ suite: _, request: __, ...state }) => state,
  );
}
