import type { EvalProgress, EvalRunResult } from "@kortyx/agent/evals";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError } from "../errors";
import { evalRunEvents, evalRuns } from "../schema";
import { loadEvalCosts } from "./eval-costs";
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
export const listEvalRuns = async (db: TelemetryDb, scope: Scope) => {
  const runs = await db
    .select({
      result: evalRuns.result,
      id: evalRuns.id,
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
      cancelRequestedAt: evalRuns.cancelRequestedAt,
    })
    .from(evalRuns)
    .where(scopeWhere(scope))
    .orderBy(desc(evalRuns.createdAt))
    .limit(100);
  const costs = await loadEvalCosts(db, scope, runs);
  return runs.map(({ result: _, ...run }) => ({
    ...run,
    costs: costs.get(run.id)?.costs,
  }));
};
export async function getEvalRun(db: TelemetryDb, scope: Scope, id: string) {
  const [run] = await db
    .select()
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
      ),
    )
    .orderBy(asc(evalRunEvents.id))
    .limit(5000);
  const { leaseOwner: _, leaseExpiresAt: __, ...publicRun } = run;
  const costs = await loadEvalCosts(db, scope, [{ ...publicRun, events }]);
  return { ...publicRun, events, ...costs.get(id) };
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
    await notifyStudioChange(tx, { ...scope, resources: ["evals"] });
  });
}
export async function claimEvalRun(
  db: TelemetryDb,
  owner: string,
  targets: readonly (Scope & { id: string })[],
) {
  return db.transaction(async (tx) => {
    // A lost lease means execution status is unknown. Never replay tool calls.
    const expired = await tx.execute(
      sql`UPDATE eval_runs SET status = 'error', ended_at = now(), updated_at = now(), error = 'Executor disconnected; execution may have continued. Run again explicitly after inspection.' WHERE status = 'running' AND lease_expires_at < now() RETURNING organization_id, project_id`,
    );
    for (const row of expired) {
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
    if (!targets.length) return undefined;
    const permitted = sql.join(
      targets.map(
        (target) =>
          sql`(target_id = ${target.id} AND organization_id = ${target.organizationId} AND project_id = ${target.projectId})`,
      ),
      sql` OR `,
    );
    const claimed = await tx.execute(
      sql`UPDATE eval_runs SET status = 'running', started_at = now(), updated_at = now(), lease_owner = ${owner}, lease_expires_at = now() + interval '30 seconds' WHERE id = (SELECT id FROM eval_runs WHERE status = 'queued' AND cancel_requested_at IS NULL AND (${permitted}) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`,
    );
    const id = claimed[0]?.id;
    if (typeof id !== "string") return undefined;
    const [run] = await tx
      .select()
      .from(evalRuns)
      .where(eq(evalRuns.id, id))
      .limit(1);
    if (run) await notifyStudioChange(tx, { ...run, resources: ["evals"] });
    return run;
  });
}
export async function heartbeatEvalRun(
  db: TelemetryDb,
  id: string,
  owner: string,
) {
  const [run] = await db
    .update(evalRuns)
    .set({
      leaseExpiresAt: new Date(Date.now() + 30_000),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(evalRuns.id, id),
        eq(evalRuns.leaseOwner, owner),
        eq(evalRuns.status, "running"),
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
    await notifyStudioChange(tx, { ...run, resources: ["evals"] });
  });
}
export async function finishEvalRun(
  db: TelemetryDb,
  id: string,
  owner: string,
  outcome: { result?: EvalRunResult; error?: string; cancelled?: boolean },
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
        endedAt: new Date(),
        updatedAt: new Date(),
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(evalRuns.id, id),
          eq(evalRuns.leaseOwner, owner),
          eq(evalRuns.status, "running"),
        ),
      )
      .returning();
    if (run) await notifyStudioChange(tx, { ...run, resources: ["evals"] });
  });
}
