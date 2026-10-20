import type { EvalProgress, EvalRunResult } from "@kortyx/agent/evals";
import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError } from "../errors";
import { evalRunEvents, evalRuns } from "../schema";
import { loadEvalCosts } from "./eval-costs";
import {
  getEvalLiveSummaries,
  maintainEvalProjection,
  priceEvalProjection,
} from "./eval-live";
import { projectEvalProgress } from "./eval-live-projection";
import { ensureProjectEnvironmentAllowed } from "./projects";
import { notifyStudioChange } from "./studio-changes";

type Scope = {
  organizationId: string;
  projectId: string;
  environment?: string | undefined;
};
const scopeWhere = (scope: Scope) =>
  and(
    eq(evalRuns.organizationId, scope.organizationId),
    eq(evalRuns.projectId, scope.projectId),
    scope.environment ? eq(evalRuns.environment, scope.environment) : undefined,
  );
export async function enqueueEvalRun(
  db: TelemetryDb,
  input: typeof evalRuns.$inferInsert,
) {
  await ensureProjectEnvironmentAllowed(db, input);
  return db.transaction(async (tx) => {
    const [run] = await tx.insert(evalRuns).values(input).returning();
    if (!run) throw new Error("Eval run was not saved.");
    if (run) await notifyStudioChange(tx, { ...run, resources: ["evals"] });
    return run;
  });
}
export const listEvalRuns = async (
  db: TelemetryDb,
  scope: Scope,
  latestPerSuite = false,
) => {
  const runs = await db
    .select({
      id: evalRuns.id,
      evaluationId: evalRuns.evaluationId,
      targetId: evalRuns.targetId,
      targetName: evalRuns.targetName,
      environment: evalRuns.environment,
      suiteId: evalRuns.suiteId,
      suiteRevision: evalRuns.suiteRevision,
      suiteName: sql<string | null>`${evalRuns.suite} ->> 'name'`,
      counts: sql<
        EvalRunResult["counts"] | null
      >`${evalRuns.result} -> 'counts'`,
      status: evalRuns.status,
      createdAt: evalRuns.createdAt,
      startedAt: evalRuns.startedAt,
      endedAt: evalRuns.endedAt,
      error: evalRuns.error,
      termination: evalRuns.termination,
      issue: evalRuns.issue,
      resolvedSettings: sql<
        import("@kortyx/agent/evals").ResolvedEvalSettings | undefined
      >`${evalRuns.request} -> 'resolvedSettings'`,
      cancelRequestedAt: evalRuns.cancelRequestedAt,
    })
    .from(evalRuns)
    .where(
      and(
        scopeWhere(scope),
        latestPerSuite
          ? sql`${evalRuns.id} in (select distinct on (target_id, suite_id) id from eval_runs where organization_id=${scope.organizationId} and project_id=${scope.projectId} ${scope.environment ? sql`and environment=${scope.environment}` : sql``} order by target_id, suite_id, created_at desc, id desc)`
          : undefined,
      ),
    )
    .orderBy(desc(evalRuns.createdAt))
    .limit(latestPerSuite ? 2147483647 : 100);
  const live = new Map(
    (
      await getEvalLiveSummaries(
        db,
        scope,
        runs.map((r) => r.id),
      )
    ).map((r) => [r.id, r]),
  );
  return runs.map((run) => ({
    ...run,
    resolvedSettings: run.resolvedSettings ?? undefined,
    counts: live.get(run.id)?.counts,
    totalAttempts: live.get(run.id)?.totalAttempts,
    completedAttempts: live.get(run.id)?.completedAttempts,
    costs: live.get(run.id)?.costs,
  }));
};
export async function getEvalRun(
  db: TelemetryDb,
  scope: Scope,
  id: string,
  selection?: { caseId: string; repetition: number },
) {
  const { liveProjection: _liveProjection, ...columns } =
    getTableColumns(evalRuns);
  const [run] = await db
    .select({
      ...columns,
      caseVersion: selection
        ? sql<
            string | null
          >`${evalRuns.liveProjection}->'attempts'->${JSON.stringify([selection.caseId, selection.repetition])}->'summary'->>'evidenceVersion'`
        : sql<null>`NULL`,
      ...(selection
        ? {
            result: sql<EvalRunResult | null>`CASE WHEN ${evalRuns.result} IS NULL THEN NULL ELSE jsonb_set(${evalRuns.result}, '{cases}', coalesce((SELECT jsonb_agg(item) FROM jsonb_array_elements(${evalRuns.result}->'cases') item WHERE item->>'caseId'=${selection.caseId} AND (item->>'repetition')::integer=${selection.repetition}), '[]'::jsonb)) END`,
          }
        : {}),
    })
    .from(evalRuns)
    .where(and(scopeWhere(scope), eq(evalRuns.id, id)))
    .limit(1);
  if (!run) throw new TelemetryNotFoundError("Eval run not found.");
  const events = await db
    .select({ id: evalRunEvents.id, event: evalRunEvents.event })
    .from(evalRunEvents)
    .where(
      and(
        eq(evalRunEvents.organizationId, scope.organizationId),
        eq(evalRunEvents.projectId, scope.projectId),
        eq(evalRunEvents.runId, id),
        selection
          ? sql`(${evalRunEvents.event}->>'caseId'=${selection.caseId} AND (${evalRunEvents.event}->>'repetition')::integer=${selection.repetition} OR ${evalRunEvents.event}->'result'->>'caseId'=${selection.caseId} AND (${evalRunEvents.event}->'result'->>'repetition')::integer=${selection.repetition})`
          : undefined,
      ),
    )
    .orderBy(asc(evalRunEvents.id))
    .limit(5000);
  const { leaseOwner: _, leaseExpiresAt: __, caseVersion, ...publicRun } = run;
  const costs = await loadEvalCosts(db, scope, [{ ...publicRun, events }]);
  return {
    ...publicRun,
    resolvedSettings: run.request.resolvedSettings,
    events,
    ...costs.get(id),
    ...(selection
      ? {
          caseVersion: caseVersion ?? undefined,
        }
      : {}),
  };
}
export async function requestEvalCancellation(
  db: TelemetryDb,
  scope: Scope,
  id: string,
) {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: evalRuns.id })
      .from(evalRuns)
      .where(and(scopeWhere(scope), eq(evalRuns.id, id)))
      .limit(1);
    if (!existing) throw new TelemetryNotFoundError("Eval run not found.");
    await tx
      .update(evalRuns)
      .set({ cancelRequestedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          scopeWhere(scope),
          eq(evalRuns.id, id),
          sql`${evalRuns.status} in ('queued', 'running')`,
        ),
      );
    await tx
      .update(evalRuns)
      .set({ status: "cancelled", endedAt: new Date() })
      .where(
        and(
          scopeWhere(scope),
          eq(evalRuns.id, id),
          eq(evalRuns.status, "queued"),
        ),
      );
    await notifyStudioChange(tx, {
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      ...(scope.environment ? { environment: scope.environment } : {}),
      resources: ["evals"],
    });
  });
}
async function claimRuns(
  db: TelemetryDb,
  owner: string,
  targets: readonly (Scope & { id: string })[],
  grouped: boolean,
  options: { maxConcurrentEvaluations?: number } = {},
) {
  const limit = options.maxConcurrentEvaluations;
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))
    throw new TypeError("maxConcurrentEvaluations must be a positive integer.");
  return db.transaction(async (tx) => {
    // Serialize the short claim transaction, including sibling selection. A
    // second worker must never take a sibling with its own concurrency budget.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('kortyx:eval-claim'))`,
    );
    // Transaction-start time can precede a lock wait. Use the current database
    // clock for expiry fences and newly granted leases after those waits.
    // A lost lease means execution status is unknown. Never replay tool calls.
    const expired = await tx.execute(
      sql`UPDATE eval_runs SET status = 'error', ended_at = clock_timestamp(), updated_at = clock_timestamp(), error = 'Executor disconnected; execution may have continued. Run again explicitly after inspection.' WHERE status = 'running' AND lease_expires_at < clock_timestamp() RETURNING organization_id, project_id, evaluation_id`,
    );
    for (const row of expired) {
      if (typeof row.evaluation_id === "string")
        await tx.execute(
          sql`UPDATE eval_runs SET status = 'error', ended_at = clock_timestamp(), updated_at = clock_timestamp(), error = 'Evaluation executor disconnected; inspect before running again.' WHERE evaluation_id = ${row.evaluation_id} AND status = 'queued'`,
        );
      if (
        typeof row.organization_id === "string" &&
        typeof row.project_id === "string"
      )
        await notifyStudioChange(tx, {
          organizationId: row.organization_id,
          projectId: row.project_id,
          resources: ["evals"],
        });
    }
    // A process limit alone multiplies capacity during rolling replacement.
    // Under the same claim lock, count groups (or legacy standalone runs)
    // across the database, including owners that are still draining.
    if (limit !== undefined) {
      const [active] = await tx.execute(
        sql`SELECT count(DISTINCT coalesce('evaluation:' || evaluation_id::text, 'run:' || id::text))::integer AS count FROM eval_runs WHERE status = 'running'`,
      );
      const count = Number(active?.count);
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error("Evaluation capacity could not be confirmed.");
      if (count >= limit) return [];
    }
    if (!targets.length) return [];
    const permitted = sql.join(
      targets.map(
        (target) =>
          sql`(target_id = ${target.id} AND organization_id = ${target.organizationId} AND project_id = ${target.projectId})`,
      ),
      sql` OR `,
    );
    const claimed = await tx.execute(
      sql`UPDATE eval_runs SET status = 'running', started_at = clock_timestamp(), updated_at = clock_timestamp(), lease_owner = ${owner}, lease_expires_at = clock_timestamp() + interval '30 seconds' WHERE id = (SELECT id FROM eval_runs WHERE status = 'queued' AND cancel_requested_at IS NULL AND (${permitted}) AND (evaluation_id IS NULL OR NOT EXISTS (SELECT 1 FROM eval_runs sibling WHERE sibling.evaluation_id = eval_runs.evaluation_id AND sibling.status = 'running')) ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`,
    );
    const id = claimed[0]?.id;
    if (typeof id !== "string") return [];
    const [run] = await tx
      .select()
      .from(evalRuns)
      .where(eq(evalRuns.id, id))
      .limit(1);
    if (!run) return [];
    const siblings =
      grouped && run.evaluationId
        ? await tx
            .update(evalRuns)
            .set({
              status: "running",
              startedAt: sql`clock_timestamp()`,
              updatedAt: sql`clock_timestamp()`,
              leaseOwner: owner,
              leaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
            })
            .where(
              and(
                eq(evalRuns.evaluationId, run.evaluationId),
                eq(evalRuns.organizationId, run.organizationId),
                eq(evalRuns.projectId, run.projectId),
                eq(evalRuns.targetId, run.targetId),
                eq(evalRuns.environment, run.environment),
                eq(evalRuns.status, "queued"),
                sql`${evalRuns.cancelRequestedAt} IS NULL`,
              ),
            )
            .returning()
        : [];
    await notifyStudioChange(tx, { ...run, resources: ["evals"] });
    return [run, ...siblings];
  });
}
/** Claim the entire evaluation under one owner and one attempt budget. */
export const claimEvalRuns = (
  db: TelemetryDb,
  owner: string,
  targets: readonly (Scope & { id: string })[],
  options: { maxConcurrentEvaluations?: number } = {},
) => claimRuns(db, owner, targets, true, options);
/** Legacy single-suite claim, mutually exclusive with grouped workers. */
export const claimEvalRun = async (
  db: TelemetryDb,
  owner: string,
  targets: readonly (Scope & { id: string })[],
) => (await claimRuns(db, owner, targets, false))[0];
export async function heartbeatEvalRun(
  db: TelemetryDb,
  id: string,
  owner: string,
) {
  const [run] = await db
    .update(evalRuns)
    .set({
      leaseExpiresAt: sql`clock_timestamp() + interval '30 seconds'`,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(evalRuns.id, id),
        eq(evalRuns.leaseOwner, owner),
        eq(evalRuns.status, "running"),
        sql`${evalRuns.leaseExpiresAt} > clock_timestamp()`,
      ),
    )
    .returning({ cancelRequestedAt: evalRuns.cancelRequestedAt });
  return run;
}
export async function appendEvalProgress(
  db: TelemetryDb,
  id: string,
  owner: string,
  event: EvalProgress,
) {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(evalRuns)
      .where(
        and(
          eq(evalRuns.id, id),
          eq(evalRuns.leaseOwner, owner),
          eq(evalRuns.status, "running"),
          sql`${evalRuns.leaseExpiresAt} > clock_timestamp()`,
        ),
      )
      .for("update")
      .limit(1);
    if (!run) throw new Error("Eval executor lost its lease.");
    await tx.insert(evalRunEvents).values({
      runId: id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      event,
    });
    await maintainEvalProjection(
      tx as TelemetryDb,
      run,
      async (projectionDb, projection) => {
        const key = projectEvalProgress(projection, event);
        if (
          key &&
          event.type !== "case-progress" &&
          event.type !== "case-dispatch"
        )
          await priceEvalProjection(projectionDb, run, projection, [key]);
      },
    );
    await notifyStudioChange(tx, { ...run, resources: ["evals"] });
  });
}
export async function finishEvalRun(
  db: TelemetryDb,
  id: string,
  owner: string,
  outcome: {
    result?: EvalRunResult;
    error?: string;
    cancelled?: boolean;
    termination?: import("@kortyx/agent/evals").EvalTermination;
    issue?: import("@kortyx/agent/evals").EvalIssue;
  },
) {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .update(evalRuns)
      .set({
        status: sql`CASE WHEN ${evalRuns.cancelRequestedAt} IS NOT NULL THEN 'cancelled' ELSE ${outcome.result?.status ?? (outcome.cancelled ? "cancelled" : "error")} END`,
        result: outcome.result
          ? sql`CASE WHEN ${evalRuns.cancelRequestedAt} IS NOT NULL THEN NULL ELSE ${JSON.stringify(outcome.result)}::jsonb END`
          : null,
        error: outcome.error ?? null,
        termination: outcome.termination ?? null,
        issue: outcome.issue ?? null,
        endedAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(evalRuns.id, id),
          eq(evalRuns.leaseOwner, owner),
          eq(evalRuns.status, "running"),
          sql`${evalRuns.leaseExpiresAt} > clock_timestamp()`,
        ),
      )
      .returning();
    if (!run)
      throw new Error("Eval completion lost its lease or was not persisted.");
    await maintainEvalProjection(
      tx as TelemetryDb,
      run,
      async (projectionDb, projection) => {
        if (run.liveProjection) {
          for (const result of run.result?.cases ?? [])
            projectEvalProgress(projection, { type: "case-completed", result });
          await priceEvalProjection(projectionDb, run, projection);
        }
      },
    );
    await notifyStudioChange(tx, { ...run, resources: ["evals"] });
  });
}

/** Read the original admission fence under the current worker lease. Null means
 * legacy progress exists and its attempt must not be dispatched a second time. */
export async function getEvalExecutionGeneration(
  db: TelemetryDb,
  id: string,
  owner: string,
  executionId: string,
  caseId?: string,
  repetition?: number,
): Promise<string | null | undefined> {
  const rows = await db
    .select({
      type: sql<string>`${evalRunEvents.event}->>'type'`,
      generation: sql<string | null>`${evalRunEvents.event}->>'generation'`,
      executionId: sql<string | null>`${evalRunEvents.event}->>'executionId'`,
    })
    .from(evalRunEvents)
    .innerJoin(
      evalRuns,
      and(
        eq(evalRuns.id, evalRunEvents.runId),
        eq(evalRuns.organizationId, evalRunEvents.organizationId),
        eq(evalRuns.projectId, evalRunEvents.projectId),
      ),
    )
    .where(
      and(
        eq(evalRuns.id, id),
        eq(evalRuns.leaseOwner, owner),
        eq(evalRuns.status, "running"),
        caseId
          ? sql`(${evalRunEvents.event}->>'caseId'=${caseId} AND (${evalRunEvents.event}->>'repetition')::integer=${repetition} OR ${evalRunEvents.event}->'result'->>'caseId'=${caseId} AND (${evalRunEvents.event}->'result'->>'repetition')::integer=${repetition})`
          : undefined,
      ),
    )
    .orderBy(asc(evalRunEvents.id));
  const receipt = rows.find(
    (row) =>
      row.type === "case-dispatch" &&
      row.executionId === executionId &&
      row.generation,
  );
  if (receipt) return receipt.generation ?? null;
  return rows.length ? null : undefined;
}

/** Recover only the leased attempt's already persisted conversation evidence. */
export async function getEvalAttemptEvidence(
  db: TelemetryDb,
  id: string,
  owner: string,
  caseId: string,
  repetition: number,
): Promise<Partial<import("@kortyx/agent/evals").EvalCaseResult> | undefined> {
  const rows = await db
    .select({ event: evalRunEvents.event })
    .from(evalRunEvents)
    .innerJoin(
      evalRuns,
      and(
        eq(evalRuns.id, evalRunEvents.runId),
        eq(evalRuns.organizationId, evalRunEvents.organizationId),
        eq(evalRuns.projectId, evalRunEvents.projectId),
      ),
    )
    .where(
      and(
        eq(evalRuns.id, id),
        eq(evalRuns.leaseOwner, owner),
        eq(evalRuns.status, "running"),
        sql`(${evalRunEvents.event}->>'caseId'=${caseId} AND (${evalRunEvents.event}->>'repetition')::integer=${repetition} OR ${evalRunEvents.event}->'result'->>'caseId'=${caseId} AND (${evalRunEvents.event}->'result'->>'repetition')::integer=${repetition})`,
      ),
    )
    .orderBy(asc(evalRunEvents.id))
    .limit(10_000);
  let evidence:
    | Partial<import("@kortyx/agent/evals").EvalCaseResult>
    | undefined;
  for (const { event } of rows) {
    if (event.type === "case-started")
      evidence = {
        ...evidence,
        caseId,
        repetition,
        sessionId: event.sessionId,
        ...(event.attemptId ? { attemptId: event.attemptId } : {}),
        steps:
          evidence?.sessionId === event.sessionId ? (evidence.steps ?? []) : [],
      };
    if (event.type === "step-completed") {
      evidence ??= { caseId, repetition, steps: [] };
      const steps = evidence.steps ?? [];
      const index = steps.findIndex((step) => step.index === event.step.index);
      if (index < 0) steps.push(event.step);
      else steps[index] = event.step;
      evidence.steps = steps;
    }
    if (event.type === "case-completed") evidence = event.result;
  }
  return evidence;
}
