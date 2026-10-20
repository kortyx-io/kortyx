import { createHash } from "node:crypto";
import type {
  EvalCosts,
  EvalProgress,
  StudioEvaluationSummary,
} from "@kortyx/agent/evals";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError, TelemetryValidationError } from "../errors";
import { evalRuns, evaluationRuns } from "../schema";
import { sumEvalCosts } from "./eval-costs";
import { type EvalLiveSummary, getEvalLiveSummaries } from "./eval-live";
import {
  emptyEvalLiveProjection,
  projectEvalProgress,
} from "./eval-live-projection";
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
  return summarizeLiveEvaluation(
    parent,
    children.map((child) => {
      const projection = emptyEvalLiveProjection();
      for (const event of events.get(child.id) ?? [])
        projectEvalProgress(projection, event);
      for (const result of child.result?.cases ?? [])
        projectEvalProgress(projection, { type: "case-completed", result });
      const cases = Object.values(projection.attempts).map((a) => a.summary);
      const counts = { passed: 0, failed: 0, error: 0, cancelled: 0 };
      for (const item of cases)
        if (item.status in counts) counts[item.status as keyof typeof counts]++;
      return {
        ...child,
        resultRecorded: Boolean(child.result),
        judge: child.request.judge,
        resolvedSettings: child.request.resolvedSettings,
        suiteName: child.suite.name ?? null,
        version: "",
        cases,
        counts,
        totalAttempts:
          (child.request.caseIds?.length ?? child.suite.cases.length) *
          child.request.repetitions,
        completedAttempts: cases
          .filter((c) => c.status !== "ungraded")
          .filter((c) => c.status in counts).length,
        errors: child.result?.errors ?? [],
        costs: costs.get(child.id)?.costs,
        createdAt: child.createdAt.toISOString(),
        startedAt: date(child.startedAt),
        endedAt: date(child.endedAt),
        cancelRequestedAt: date(child.cancelRequestedAt),
      };
    }),
  );
}
function summarizeLiveEvaluation(
  parent: Parent,
  children: EvalLiveSummary[],
): StudioEvaluationSummary {
  const counts = { passed: 0, failed: 0, error: 0, cancelled: 0 };
  const pendingAttempts = { notStarted: 0, executing: 0, awaitingGrading: 0 };
  let totalAttempts = 0,
    completedAttempts = 0;
  for (const child of children) {
    const total = child.totalAttempts ?? 0;
    totalAttempts += total;
    completedAttempts += child.completedAttempts ?? 0;
    for (const key of Object.keys(counts) as (keyof typeof counts)[])
      counts[key] += child.counts?.[key] ?? 0;
    pendingAttempts.notStarted += Math.max(0, total - child.cases.length);
    for (const item of child.cases) {
      if (item.status in counts) continue;
      if (item.status === "ungraded" || item.phase === "grading")
        pendingAttempts.awaitingGrading++;
      else if (item.status === "running") pendingAttempts.executing++;
      else pendingAttempts.notStarted++;
    }
  }
  const completedSuites = children.filter(
    (child) => !active(child.status),
  ).length;
  const started = children
    .flatMap((c) => (c.startedAt ? [c.startedAt] : []))
    .sort();
  const ended = children
    .flatMap((c) => (c.endedAt ? [c.endedAt] : []))
    .sort()
    .reverse();
  const status = children.some((c) => active(c.status))
    ? started.length
      ? "running"
      : "queued"
    : children.some((c) => c.status === "error")
      ? "error"
      : children.some((c) => c.status === "cancelled")
        ? "cancelled"
        : children.some((c) => c.status === "failed")
          ? "failed"
          : children.length
            ? "passed"
            : "error";
  const parts = children.flatMap((c) => (c.costs ? [c.costs] : []));
  const failure = (
    issue: Pick<
      import("@kortyx/agent/evals").EvalIssue,
      "phase" | "code" | "message"
    > & { diagnosticId?: string | undefined },
  ) => ({
    phase: issue.phase,
    code: issue.code,
    message: issue.message,
    ...(issue.diagnosticId ? { diagnosticId: issue.diagnosticId } : {}),
  });
  const failures = children.flatMap((child) => [
    ...child.errors.map((issue) => ({
      suiteRunId: child.id,
      ...failure(issue),
    })),
    ...(child.issue ? [{ suiteRunId: child.id, ...failure(child.issue) }] : []),
    ...(!child.issue && !child.termination && child.error
      ? [
          {
            suiteRunId: child.id,
            phase: "execute" as const,
            code: "EVAL_EXECUTION_UNKNOWN",
            message: child.error,
          },
        ]
      : []),
    ...child.cases.flatMap((item) =>
      item.errors.map((issue) => ({
        suiteRunId: child.id,
        caseId: item.caseId,
        repetition: item.repetition,
        ...failure(issue),
      })),
    ),
  ]);
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
    judge: children[0]?.judge,
    status,
    createdAt: parent.createdAt.toISOString(),
    startedAt: started[0] ?? null,
    endedAt: completedSuites === children.length ? (ended[0] ?? null) : null,
    cancelRequestedAt: date(parent.cancelRequestedAt),
    suiteCount: children.length,
    completedSuites,
    totalAttempts,
    completedAttempts,
    counts,
    pendingAttempts,
    failures,
    interruptedSuites: children.filter(
      (c) =>
        c.termination ||
        (!active(c.status) && !c.resultRecorded && Boolean(c.error)),
    ).length,
    termination: children.find((c) => c.termination)?.termination ?? null,
    resolvedSettings:
      parent.request.resolvedSettings ?? children[0]?.resolvedSettings,
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
  if (!ids.length) return [];
  const rows = await db
    .select({ id: evalRuns.id })
    .from(evalRuns)
    .where(and(childScope(scope), inArray(evalRuns.evaluationId, ids)))
    .orderBy(evalRuns.createdAt, evalRuns.id);
  return getEvalLiveSummaries(
    db,
    scope,
    rows.map((r) => r.id),
  );
}
export async function listEvaluations(
  db: TelemetryDb,
  scope: Scope,
  options: {
    suiteRunIds?: readonly string[];
    scan?: { offset: number; limit: number };
  } = {},
) {
  if (options.suiteRunIds?.length === 0) return [];
  const parents = await db
    .select()
    .from(evaluationRuns)
    .where(
      and(
        parentScope(scope),
        options.suiteRunIds
          ? inArray(
              evaluationRuns.id,
              db
                .select({ id: evalRuns.evaluationId })
                .from(evalRuns)
                .where(
                  and(
                    childScope(scope),
                    inArray(evalRuns.id, [...options.suiteRunIds]),
                  ),
                ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(evaluationRuns.createdAt), desc(evaluationRuns.id))
    .limit(options.scan?.limit ?? 100)
    .offset(options.scan?.offset ?? 0);
  const data = await loadChildren(
    db,
    scope,
    parents.map((parent) => parent.id),
  );
  const grouped = parents.map((parent) =>
    summarizeLiveEvaluation(
      parent,
      data.filter((child) => child.evaluationId === parent.id),
    ),
  );
  // Old suite runs remain visible and retain their original detail links.
  const legacy = await db
    .select({ id: evalRuns.id })
    .from(evalRuns)
    .where(
      and(
        childScope(scope),
        isNull(evalRuns.evaluationId),
        options.suiteRunIds
          ? inArray(evalRuns.id, [...options.suiteRunIds])
          : undefined,
      ),
    )
    .orderBy(desc(evalRuns.createdAt), desc(evalRuns.id))
    .limit(options.scan?.limit ?? 100)
    .offset(options.scan?.offset ?? 0);
  const old = (
    await getEvalLiveSummaries(
      db,
      scope,
      legacy.map((r) => r.id),
    )
  ).map((child) => ({
    ...summarizeLiveEvaluation(
      {
        id: child.id,
        name: child.suiteName ?? child.suiteId,
        targetId: child.targetId,
        targetName: child.targetName,
        environment: child.environment,
        request: {
          selection: "selected",
          suites: [],
          targetId: child.targetId,
        },
        createdAt: new Date(child.createdAt),
        cancelRequestedAt: child.cancelRequestedAt
          ? new Date(child.cancelRequestedAt)
          : null,
      },
      [child],
    ),
    legacy: true,
  }));
  return [...grouped, ...old]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, options.scan ? undefined : 100);
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
  const summary = summarizeLiveEvaluation(parent, data);
  const suites = includeContent
    ? await Promise.all(data.map((child) => getEvalRun(db, scope, child.id)))
    : data.map(
        ({
          cases,
          errors: ____,
          version: _____,
          resultRecorded: ______,
          ...child
        }) => ({
          ...child,
          phase: cases.some(
            (c) => c.status === "running" && c.phase !== "grading",
          )
            ? "execute"
            : cases.some(
                  (c) => c.status === "ungraded" || c.phase === "grading",
                )
              ? "grading"
              : undefined,
        }),
      );
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
