import {
  resolveStudioTimeRange,
  type StudioMetric,
  type StudioRun,
  type StudioWorkflow,
  type StudioWorkflowHealth,
  type StudioWorkflowNode,
  type StudioWorkflowsResponse,
  type StudioWorkflowTransition,
} from "@kortyx/telemetry-contracts";
import { and, desc, eq, gte, lte, type SQL, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import {
  studioRuns,
  type WorkflowRevision,
  workflowRevisions,
} from "../schema";
import type { StudioListQuery } from "./studio-lists";

const unique = <T>(values: T[]) => [...new Set(values)];
const percentage = (count: number, total: number) =>
  total === 0 ? null : Number(((count / total) * 100).toFixed(1));
const average = (values: number[]) =>
  values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
const percentile = (values: number[], fraction: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[
      Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * fraction) - 1),
      )
    ] ?? null
  );
};

const metricsForRuns = (runs: StudioRun[]): StudioMetric => {
  const currencies = unique(
    runs
      .map((run) => run.currency)
      .filter((currency): currency is string => Boolean(currency)),
  );
  const durations = runs
    .map((run) => run.durationMs)
    .filter((value): value is number => value !== null);
  const tokens = runs
    .map((run) => run.tokens)
    .filter((value): value is number => value !== null);
  const costs = runs
    .map((run) => run.cost)
    .filter((value): value is number => value !== null);
  return {
    runCount: runs.length,
    successRate: percentage(
      runs.filter((run) => run.status === "completed").length,
      runs.length,
    ),
    errorRate: percentage(
      runs.filter((run) => run.status === "failed").length,
      runs.length,
    ),
    retryCount: runs.filter((run) => run.hasRetry).length,
    interruptRate: percentage(
      runs.filter((run) => run.status === "interrupted").length,
      runs.length,
    ),
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    averageTokens: average(tokens),
    averageCost: currencies.length <= 1 ? average(costs) : null,
    currency: currencies.length === 1 ? (currencies[0] ?? null) : null,
  };
};

const healthForRuns = (runs: StudioRun[], now: Date): StudioWorkflowHealth => {
  if (runs.length === 0) return "unknown";
  const latest = Math.max(
    ...runs.map((run) => Date.parse(run.endedAt ?? run.startedAt)),
  );
  if (now.getTime() - latest > 7 * 24 * 60 * 60 * 1_000) return "idle";
  const metrics = metricsForRuns(runs);
  if ((metrics.errorRate ?? 0) >= 20) return "failing";
  if ((metrics.errorRate ?? 0) >= 5 || (metrics.interruptRate ?? 0) >= 25) {
    return "degraded";
  }
  return "healthy";
};

const nodeState = (
  nodeId: string,
  runs: StudioRun[],
): StudioWorkflowNode["state"] => {
  if (runs.some((run) => run.status === "failed")) return "failed";
  if (runs.some((run) => run.interruptNodeId === nodeId)) return "interrupted";
  if (runs.some((run) => run.hasRetry)) return "retried";
  return runs.length > 0 ? "healthy" : null;
};

const transitionId = (
  revision: WorkflowRevision,
  transition: WorkflowRevision["workflowTransitions"][number],
) =>
  `${revision.workflowId}:${transition.sourceNodeId ?? ""}:${transition.targetWorkflowId}:${transition.condition ?? ""}`;

export const createStudioWorkflowModelsFromProjections = (input: {
  runs: StudioRun[];
  revisions: WorkflowRevision[];
  range: StudioWorkflowsResponse["cohort"];
  now?: Date;
}): StudioWorkflowsResponse => {
  const now = input.now ?? new Date();
  const revisionsByWorkflow = new Map<string, WorkflowRevision[]>();
  for (const revision of input.revisions) {
    const revisions = revisionsByWorkflow.get(revision.workflowId) ?? [];
    revisions.push(revision);
    revisionsByWorkflow.set(revision.workflowId, revisions);
  }
  for (const run of input.runs) {
    for (const workflowId of run.workflowIds) {
      if (!revisionsByWorkflow.has(workflowId)) {
        revisionsByWorkflow.set(workflowId, []);
      }
    }
  }

  const activeRevisions = new Map<string, WorkflowRevision>();
  for (const [workflowId, revisions] of revisionsByWorkflow) {
    const requestedVersion =
      input.range.workflowId === workflowId ? input.range.version : null;
    const active = requestedVersion
      ? revisions.find(
          (revision) => revision.declaredVersion === requestedVersion,
        )
      : revisions[0];
    if (active) activeRevisions.set(workflowId, active);
  }

  const workflows: StudioWorkflow[] = Array.from(revisionsByWorkflow)
    .map(([workflowId, revisions]) => {
      const active = activeRevisions.get(workflowId);
      const runs = input.runs.filter((run) =>
        run.workflowIds.includes(workflowId),
      );
      return {
        id: workflowId,
        name: workflowId,
        description: active?.description ?? null,
        versions: unique(revisions.map((revision) => revision.declaredVersion)),
        activeVersion: active?.declaredVersion ?? null,
        activeRevisionId: active?.id ?? null,
        health: healthForRuns(runs, now),
        tags: unique(revisions.flatMap((revision) => revision.tags ?? [])),
        lastActivityAt:
          runs
            .map((run) => run.endedAt ?? run.startedAt)
            .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ??
          null,
        metrics: metricsForRuns(runs),
        nodes: (active?.nodes ?? []).map((node) => {
          const nodeRuns = runs.filter((run) => run.path.includes(node.id));
          return {
            id: node.id,
            label: node.label ?? node.id,
            type: node.type ?? null,
            state: nodeState(node.id, nodeRuns),
            provider: node.provider ?? null,
            model: node.model ?? null,
            metrics: metricsForRuns(nodeRuns),
          };
        }),
        internalEdges: (active?.edges ?? []).map((edge) => ({
          id: `${edge.sourceNodeId}->${edge.targetNodeId}`,
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          condition: edge.condition ?? null,
        })),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const declared = new Map<string, StudioWorkflowTransition>();
  for (const revision of activeRevisions.values()) {
    for (const transition of revision.workflowTransitions) {
      const id = transitionId(revision, transition);
      declared.set(id, {
        id,
        sourceWorkflowId: revision.workflowId,
        sourceNodeId: transition.sourceNodeId ?? null,
        targetWorkflowId: transition.targetWorkflowId,
        condition: transition.condition ?? null,
        volume: 0,
        successRate: null,
        medianDurationMs: null,
        errorRate: null,
      });
    }
  }
  const observedIds = unique(input.runs.flatMap((run) => run.transitionIds));
  for (const id of observedIds) {
    const matchingRuns = input.runs.filter((run) =>
      run.transitionIds.includes(id),
    );
    const known = declared.get(id);
    const [sourceWorkflowId = "", sourceNodeId = "", targetWorkflowId = ""] =
      id.split(":");
    declared.set(id, {
      id,
      sourceWorkflowId: known?.sourceWorkflowId ?? sourceWorkflowId,
      sourceNodeId:
        known?.sourceNodeId ?? (sourceNodeId.length > 0 ? sourceNodeId : null),
      targetWorkflowId: known?.targetWorkflowId ?? targetWorkflowId,
      condition: known?.condition ?? null,
      volume: matchingRuns.length,
      successRate: percentage(
        matchingRuns.filter((run) => run.status === "completed").length,
        matchingRuns.length,
      ),
      medianDurationMs: percentile(
        matchingRuns
          .map((run) => run.durationMs)
          .filter((value): value is number => value !== null),
        0.5,
      ),
      errorRate: percentage(
        matchingRuns.filter((run) => run.status === "failed").length,
        matchingRuns.length,
      ),
    });
  }

  return {
    workflows,
    transitions: Array.from(declared.values()).sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    cohort: input.range,
  };
};

export const listStudioWorkflows = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    query: StudioListQuery;
    now?: Date;
  },
): Promise<StudioWorkflowsResponse> => {
  const now = input.now ?? new Date();
  const resolution = resolveStudioTimeRange(input.query, now);
  if ("error" in resolution) throw new Error(resolution.error);
  const workflowId = input.query.workflow?.trim() || null;
  const version = input.query.version?.trim() || null;
  if (version && !workflowId) {
    throw new Error("A workflow is required when filtering by version.");
  }
  const runConditions: Array<SQL | undefined> = [
    eq(studioRuns.organizationId, input.organizationId),
    eq(studioRuns.projectId, input.projectId),
    resolution.value.startedAfter
      ? gte(studioRuns.startedAt, new Date(resolution.value.startedAfter))
      : undefined,
    resolution.value.startedBefore
      ? lte(studioRuns.startedAt, new Date(resolution.value.startedBefore))
      : undefined,
    workflowId && version
      ? sql`${studioRuns.workflowIds} @> ${JSON.stringify([workflowId])}::jsonb`
      : undefined,
    workflowId && version
      ? sql`${studioRuns.data} -> 'workflowRefs' @> ${JSON.stringify([
          { workflowId, declaredVersion: version },
        ])}::jsonb`
      : undefined,
  ];
  const [runRows, revisions] = await Promise.all([
    db
      .select({ data: studioRuns.data })
      .from(studioRuns)
      .where(and(...runConditions)),
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
  ]);
  if (
    workflowId &&
    version &&
    !revisions.some(
      (revision) =>
        revision.workflowId === workflowId &&
        revision.declaredVersion === version,
    )
  ) {
    throw new Error(
      `Workflow "${workflowId}" does not have version "${version}".`,
    );
  }
  return createStudioWorkflowModelsFromProjections({
    runs: runRows.map((row) => row.data),
    revisions,
    range: {
      ...resolution.value,
      workflowId,
      version,
    },
    now,
  });
};
