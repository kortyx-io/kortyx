import { createHash } from "node:crypto";
import type {
  EvalCosts,
  EvalProgress,
  StudioEvaluationSummary,
} from "@kortyx/agent/evals";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError, TelemetryValidationError } from "../errors";
import { evalRunEvents, evalRuns, evaluationRuns } from "../schema";
import { loadEvalCosts, sumEvalCosts } from "./eval-costs";
import { getEvalRun } from "./evals";
import { ensureProjectEnvironmentAllowed } from "./projects";
import { notifyStudioChange } from "./studio-changes";

type Scope = {
  organizationId: string;
  projectId: string;
  environment?: string | undefined;
};
type Parent = Pick<
  typeof evaluationRuns.$inferSelect,
  | "id"
  | "name"
  | "targetId"
  | "targetName"
  | "environment"
  | "request"
  | "createdAt"
  | "cancelRequestedAt"
>;
type Child = typeof evalRuns.$inferSelect;
const parentScope = (scope: Scope) =>
  and(
    eq(evaluationRuns.organizationId, scope.organizationId),
    eq(evaluationRuns.projectId, scope.projectId),
    scope.environment
      ? eq(evaluationRuns.environment, scope.environment)
      : undefined,
  );
const childScope = (scope: Scope) =>
  and(
    eq(evalRuns.organizationId, scope.organizationId),
    eq(evalRuns.projectId, scope.projectId),
    scope.environment ? eq(evalRuns.environment, scope.environment) : undefined,
  );
const active = (status: string) => status === "queued" || status === "running";
const date = (value: Date | null) => value?.toISOString() ?? null;

/** Canonical JSON keeps idempotency independent of object property order. */
export function evaluationRequestHash(value: unknown): string {
  const canonical = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(canonical)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, part]) => [key, canonical(part)]),
          )
        : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export async function findIdempotentEvaluation(
  db: TelemetryDb,
  scope: Scope,
  key: string,
  hash: string,
) {
  const [existing] = await db
    .select()
    .from(evaluationRuns)
    .where(and(parentScope(scope), eq(evaluationRuns.idempotencyKey, key)))
    .limit(1);
  if (!existing) return undefined;
  if (existing.requestHash !== hash)
    throw new TelemetryValidationError(
      "Idempotency key already belongs to a different evaluation request.",
    );
  await ensureProjectEnvironmentAllowed(db, existing);
  return existing;
}
export async function enqueueEvaluation(
  db: TelemetryDb,
  input: typeof evaluationRuns.$inferInsert,
  children: (typeof evalRuns.$inferInsert)[],
) {
  await ensureProjectEnvironmentAllowed(db, input);
  return db.transaction(async (tx) => {
    const [parent] = await tx
      .insert(evaluationRuns)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (!parent) {
      if (!input.idempotencyKey)
        throw new Error("Evaluation run was not saved.");
      const existing = await findIdempotentEvaluation(
        tx as TelemetryDb,
        input,
        input.idempotencyKey,
        input.requestHash,
      );
      if (!existing)
        throw new TelemetryValidationError(
          "Idempotency key already belongs to another evaluation request.",
        );
      return existing;
    }
    await tx
      .insert(evalRuns)
      .values(children.map((child) => ({ ...child, evaluationId: parent.id })));
    await notifyStudioChange(tx, { ...input, resources: ["evals"] });
    return parent;
  });
}

export function summarizeEvaluation(
  parent: Parent,
  children: Child[],
  events: Map<string, EvalProgress[]>,
  costs: Map<string, { costs: EvalCosts }>,
): StudioEvaluationSummary {
  const counts = { passed: 0, failed: 0, error: 0, cancelled: 0 };
  let totalAttempts = 0;
  let completedAttempts = 0;
  for (const child of children) {
    totalAttempts +=
      (child.request.caseIds?.length ?? child.suite.cases.length) *
      child.request.repetitions;
    if (child.result) {
      for (const key of Object.keys(counts) as (keyof typeof counts)[])
        counts[key] += child.result.counts[key];
      completedAttempts += child.result.cases.filter(
        (item) => item.status !== "ungraded",
      ).length;
    } else {
      const attempts = new Map<
        string,
        Extract<EvalProgress, { type: "case-completed" }>["result"]
      >();
      for (const event of events.get(child.id) ?? [])
        if (event.type === "case-completed")
          attempts.set(
            `${event.result.caseId}:${event.result.repetition}`,
            event.result,
          );
      for (const item of attempts.values())
        if (item.status !== "ungraded") {
          counts[item.status]++;
          completedAttempts++;
        }
    }
  }
  const completedSuites = children.filter(
    (child) => !active(child.status),
  ).length;
  const started = children
    .flatMap((child) => (child.startedAt ? [child.startedAt] : []))
    .sort((a, b) => a.getTime() - b.getTime());
  const ended = children
    .flatMap((child) => (child.endedAt ? [child.endedAt] : []))
    .sort((a, b) => b.getTime() - a.getTime());
  const status = children.some((child) => active(child.status))
    ? started.length
      ? "running"
      : "queued"
    : children.some((child) => child.status === "error")
      ? "error"
      : children.some((child) => child.status === "cancelled")
        ? "cancelled"
        : children.some((child) => child.status === "failed")
          ? "failed"
          : children.length
            ? "passed"
            : "error";
  const parts = children.flatMap((child) =>
    costs.get(child.id)?.costs ? [costs.get(child.id)!.costs] : [],
  );
  return {
    id: parent.id,
    name: parent.name,
    targetId: parent.targetId,
    targetName: parent.targetName,
    environment: parent.environment,
    selection: parent.request.selection,
    metadata: {
      ...parent.request.metadata,
      source: parent.request.metadata?.source ?? "manual",
    },
    judge: children[0]?.request.judge,
    status,
    createdAt: parent.createdAt.toISOString(),
    startedAt: date(started[0] ?? null),
    endedAt:
      completedSuites === children.length ? date(ended[0] ?? null) : null,
    cancelRequestedAt: date(parent.cancelRequestedAt),
    suiteCount: children.length,
    completedSuites,
    totalAttempts,
    completedAttempts,
    counts,
    ...(parts.length
      ? {
          costs: {
            workflow: sumEvalCosts(parts.map((p) => p.workflow)),
            judge: sumEvalCosts(parts.map((p) => p.judge)),
            total: sumEvalCosts(parts.map((p) => p.total)),
          },
        }
      : {}),
  };
}
async function loadChildren(db: TelemetryDb, scope: Scope, ids: string[]) {
  if (!ids.length)
    return {
      children: [] as Child[],
      events: new Map<string, EvalProgress[]>(),
      costs: new Map<string, { costs: EvalCosts }>(),
    };
  const children = await db
    .select()
    .from(evalRuns)
    .where(and(childScope(scope), inArray(evalRuns.evaluationId, ids)))
    .orderBy(evalRuns.createdAt, evalRuns.id);
  const eventMap = new Map<string, EvalProgress[]>();
  // Final results are authoritative; only unfinished suites need progress events.
  const pending = children
    .filter((child) => !child.result)
    .map((child) => child.id);
  if (pending.length) {
    const events = await db
      .select({ runId: evalRunEvents.runId, event: evalRunEvents.event })
      .from(evalRunEvents)
      .where(
        and(
          eq(evalRunEvents.organizationId, scope.organizationId),
          eq(evalRunEvents.projectId, scope.projectId),
          inArray(evalRunEvents.runId, pending),
        ),
      )
      .orderBy(evalRunEvents.id);
    for (const event of events) {
      const list = eventMap.get(event.runId) ?? [];
      list.push(event.event);
      eventMap.set(event.runId, list);
    }
  }
  const costs = await loadEvalCosts(
    db,
    scope,
    children.map((child) => ({
      ...child,
      ...(eventMap.has(child.id)
        ? { events: eventMap.get(child.id)!.map((event) => ({ event })) }
        : {}),
    })),
  );
  return { children, events: eventMap, costs };
}
export async function listEvaluations(db: TelemetryDb, scope: Scope) {
  const parents = await db
    .select()
    .from(evaluationRuns)
    .where(parentScope(scope))
    .orderBy(desc(evaluationRuns.createdAt))
    .limit(100);
  const data = await loadChildren(
    db,
    scope,
    parents.map((parent) => parent.id),
  );
  const grouped = parents.map((parent) =>
    summarizeEvaluation(
      parent,
      data.children.filter((child) => child.evaluationId === parent.id),
      data.events,
      data.costs,
    ),
  );
  // Old suite runs remain visible and retain their original detail links.
  const legacy = await db
    .select()
    .from(evalRuns)
    .where(and(childScope(scope), isNull(evalRuns.evaluationId)))
    .orderBy(desc(evalRuns.createdAt))
    .limit(100);
  const legacyCosts = await loadEvalCosts(db, scope, legacy);
  const old = legacy.map((child) => ({
    ...summarizeEvaluation(
      {
        id: child.id,
        name: child.suite.name ?? child.suiteId,
        targetId: child.targetId,
        targetName: child.targetName,
        environment: child.environment,
        request: {
          selection: "selected",
          suites: [],
          targetId: child.targetId,
        },
        createdAt: child.createdAt,
        cancelRequestedAt: child.cancelRequestedAt,
      },
      [child],
      new Map(),
      legacyCosts,
    ),
    legacy: true,
  }));
  return [...grouped, ...old]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}
export async function getEvaluation(
  db: TelemetryDb,
  scope: Scope,
  id: string,
  includeContent = false,
) {
  const [parent] = await db
    .select()
    .from(evaluationRuns)
    .where(and(parentScope(scope), eq(evaluationRuns.id, id)))
    .limit(1);
  if (!parent) throw new TelemetryNotFoundError("Evaluation run not found.");
  const data = await loadChildren(db, scope, [id]);
  const summary = summarizeEvaluation(
    parent,
    data.children,
    data.events,
    data.costs,
  );
  const suites = includeContent
    ? await Promise.all(
        data.children.map((child) => getEvalRun(db, scope, child.id)),
      )
    : data.children.map((child) => ({
        id: child.id,
        evaluationId: child.evaluationId,
        targetId: child.targetId,
        targetName: child.targetName,
        environment: child.environment,
        suiteId: child.suiteId,
        suiteRevision: child.suiteRevision,
        suiteName: child.suite.name ?? null,
        status: child.status,
        createdAt: child.createdAt,
        startedAt: child.startedAt,
        endedAt: child.endedAt,
        cancelRequestedAt: child.cancelRequestedAt,
        error: child.error,
        totalAttempts:
          (child.request.caseIds?.length ?? child.suite.cases.length) *
          child.request.repetitions,
        completedAttempts: child.result
          ? child.result.cases.filter((item) => item.status !== "ungraded")
              .length
          : [
              ...new Map(
                (data.events.get(child.id) ?? [])
                  .filter((event) => event.type === "case-completed")
                  .map((event) => [
                    `${event.result.caseId}:${event.result.repetition}`,
                    event.result,
                  ]),
              ).values(),
            ].filter((item) => item.status !== "ungraded").length,
        phase: (data.events.get(child.id) ?? [])
          .filter((event) => event.type === "case-progress")
          .at(-1)?.phase,
        counts: child.result?.counts ?? null,
        costs: data.costs.get(child.id)?.costs,
      }));
  return { ...summary, suites };
}
export async function cancelEvaluation(
  db: TelemetryDb,
  scope: Scope,
  id: string,
) {
  await db.transaction(async (tx) => {
    const [parent] = await tx
      .update(evaluationRuns)
      .set({ cancelRequestedAt: new Date() })
      .where(and(parentScope(scope), eq(evaluationRuns.id, id)))
      .returning();
    if (!parent) throw new TelemetryNotFoundError("Evaluation run not found.");
    await tx
      .update(evalRuns)
      .set({
        cancelRequestedAt: new Date(),
        updatedAt: new Date(),
        status: sql`CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END`,
        endedAt: sql`CASE WHEN status = 'queued' THEN now() ELSE ended_at END`,
      })
      .where(
        and(
          childScope(scope),
          eq(evalRuns.evaluationId, id),
          inArray(evalRuns.status, ["queued", "running"]),
        ),
      );
    await notifyStudioChange(tx, {
      ...scope,
      environment: parent.environment,
      resources: ["evals"],
    });
  });
}
