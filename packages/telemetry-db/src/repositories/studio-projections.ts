import type {
  StudioInterrupt,
  StudioRun,
  StudioSession,
} from "@kortyx/telemetry-contracts";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import {
  modelRateCards,
  studioInterrupts,
  studioRuns,
  studioSessions,
  telemetryEvents,
  workflowRevisions,
} from "../schema";
import { createStudioReadModelsFromRecords } from "./studio-read-models";

const unique = <T>(items: T[]): T[] => [...new Set(items)];

const compactSearchText = (values: Array<string | null | undefined>): string =>
  unique(
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  ).join(" ");

const latestReceivedAt = (dates: Date[], fallback = new Date()): Date =>
  dates.length === 0
    ? fallback
    : dates.reduce((latest, date) =>
        date.getTime() > latest.getTime() ? date : latest,
      );

const runProjectionValues = (
  organizationId: string,
  projectId: string,
  run: StudioRun,
  updatedAt: Date,
) => ({
  organizationId,
  projectId,
  runId: run.id,
  sessionId: run.sessionId,
  status: run.status,
  startedAt: new Date(run.startedAt),
  endedAt: run.endedAt ? new Date(run.endedAt) : null,
  durationMs: run.durationMs,
  tokens: run.tokens,
  cost: run.cost,
  environment: run.environment,
  provider: run.provider,
  model: run.model,
  userId: run.userId,
  tenantId: run.tenantId,
  hasTool: run.hasTool,
  workflowIds: run.workflowIds,
  workflowVersions: unique(
    run.workflowRefs
      .map((reference) => reference.declaredVersion)
      .filter((version): version is string => version !== null),
  ),
  transitionIds: run.transitionIds,
  path: run.path,
  models: run.models,
  searchText: compactSearchText([
    run.id,
    run.sessionId,
    ...run.workflowIds,
    ...run.workflowRefs.flatMap((reference) => [
      reference.workflowId,
      reference.declaredVersion,
    ]),
    ...run.transitionIds,
    ...run.path,
    run.userId,
    run.tenantId,
    run.provider,
    run.model,
    ...run.models,
    run.result,
  ]),
  data: run,
  updatedAt,
});

const sessionProjectionValues = (
  organizationId: string,
  projectId: string,
  session: StudioSession,
  updatedAt: Date,
) => ({
  organizationId,
  projectId,
  sessionId: session.id,
  status: session.status,
  lastActivityAt: new Date(session.lastActivityAt),
  durationMs: session.durationMs,
  tokens: session.tokens,
  cost: session.cost,
  runCount: session.runs,
  environment: session.environment,
  userId: session.userId,
  tenantId: session.tenantId,
  activeWorkflowId: session.activeWorkflowId,
  activeVersion: session.activeVersion,
  pendingInterruptId: session.pendingInterruptId,
  hasError: session.latestError !== null,
  hasInterrupt: session.pendingInterruptId !== null || session.interrupted > 0,
  hasCheckpoint: session.checkpoints > 0,
  hasFork: session.hasFork,
  workflowIds: session.workflowIds,
  providers: session.providers,
  models: session.models,
  tags: session.tags,
  searchText: compactSearchText([
    session.id,
    session.userId,
    session.tenantId,
    ...session.workflowIds,
    session.activeVersion,
    ...session.providers,
    ...session.models,
    ...session.tags,
    session.latestResult,
    session.latestError,
    session.pendingInterruptId,
  ]),
  data: session,
  updatedAt,
});

const interruptProjectionValues = (
  organizationId: string,
  projectId: string,
  interrupt: StudioInterrupt,
  updatedAt: Date,
) => ({
  organizationId,
  projectId,
  interruptId: interrupt.id,
  runId: interrupt.runId,
  sessionId: interrupt.sessionId,
  status: interrupt.status,
  type: interrupt.type,
  createdAt: new Date(interrupt.createdAt),
  resolvedAt: interrupt.resolvedAt ? new Date(interrupt.resolvedAt) : null,
  expiresAt: interrupt.expiresAt ? new Date(interrupt.expiresAt) : null,
  workflowId: interrupt.workflowId,
  nodeId: interrupt.nodeId,
  environment: interrupt.environment,
  userId: interrupt.userId,
  tenantId: interrupt.tenantId,
  resolvedBy: interrupt.resolvedBy,
  resumeOutcome: interrupt.resumeOutcome,
  hasError: interrupt.resumeError !== null,
  searchText: compactSearchText([
    interrupt.id,
    interrupt.resumeToken,
    interrupt.runId,
    interrupt.sessionId,
    interrupt.workflowId,
    interrupt.nodeId,
    interrupt.userId,
    interrupt.tenantId,
    interrupt.resolvedBy,
    interrupt.question,
    interrupt.response,
    interrupt.resumeError,
  ]),
  data: interrupt,
  updatedAt,
});

type ProjectionRefreshResult = {
  runs: number;
  sessions: number;
  interrupts: number;
};

export const refreshStudioProjectionScopes = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    runIds: string[];
  },
): Promise<ProjectionRefreshResult> => {
  const runIds = unique(input.runIds.filter(Boolean));
  if (runIds.length === 0) {
    return { runs: 0, sessions: 0, interrupts: 0 };
  }

  const affectedRunScopes = await db
    .select({
      runId: telemetryEvents.runId,
      sessionId: telemetryEvents.sessionId,
    })
    .from(telemetryEvents)
    .where(
      and(
        eq(telemetryEvents.organizationId, input.organizationId),
        eq(telemetryEvents.projectId, input.projectId),
        inArray(telemetryEvents.runId, runIds),
      ),
    );
  const sessionIds = unique(
    affectedRunScopes
      .map((scope) => scope.sessionId)
      .filter((sessionId): sessionId is string => sessionId !== null),
  );
  const runsWithSessions = new Set(
    affectedRunScopes
      .filter((scope) => scope.sessionId !== null)
      .map((scope) => scope.runId),
  );
  const standaloneRunIds = runIds.filter(
    (runId) => !runsWithSessions.has(runId),
  );

  const scopePredicate =
    sessionIds.length > 0 && standaloneRunIds.length > 0
      ? or(
          inArray(telemetryEvents.sessionId, sessionIds),
          inArray(telemetryEvents.runId, standaloneRunIds),
        )
      : sessionIds.length > 0
        ? inArray(telemetryEvents.sessionId, sessionIds)
        : inArray(telemetryEvents.runId, standaloneRunIds);

  const [events, revisions, rates] = await Promise.all([
    db
      .select()
      .from(telemetryEvents)
      .where(
        and(
          eq(telemetryEvents.organizationId, input.organizationId),
          eq(telemetryEvents.projectId, input.projectId),
          scopePredicate,
        ),
      )
      .orderBy(asc(telemetryEvents.occurredAt)),
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

  const models = createStudioReadModelsFromRecords({
    events,
    revisions,
    rates,
  });
  const receivedByRun = new Map<string, Date[]>();
  const receivedBySession = new Map<string, Date[]>();
  const receivedByInterrupt = new Map<string, Date[]>();
  for (const event of events) {
    receivedByRun.set(event.runId, [
      ...(receivedByRun.get(event.runId) ?? []),
      event.receivedAt,
    ]);
    if (event.sessionId) {
      receivedBySession.set(event.sessionId, [
        ...(receivedBySession.get(event.sessionId) ?? []),
        event.receivedAt,
      ]);
    }
    const interruptId =
      typeof event.payload.interruptId === "string"
        ? event.payload.interruptId
        : null;
    if (interruptId) {
      receivedByInterrupt.set(interruptId, [
        ...(receivedByInterrupt.get(interruptId) ?? []),
        event.receivedAt,
      ]);
    }
  }

  const runValues = models.runs.map((run) =>
    runProjectionValues(
      input.organizationId,
      input.projectId,
      run,
      latestReceivedAt(receivedByRun.get(run.id) ?? []),
    ),
  );
  if (runValues.length > 0) {
    await db
      .insert(studioRuns)
      .values(runValues)
      .onConflictDoUpdate({
        target: [
          studioRuns.organizationId,
          studioRuns.projectId,
          studioRuns.runId,
        ],
        set: {
          sessionId: sql`excluded.session_id`,
          status: sql`excluded.status`,
          startedAt: sql`excluded.started_at`,
          endedAt: sql`excluded.ended_at`,
          durationMs: sql`excluded.duration_ms`,
          tokens: sql`excluded.tokens`,
          cost: sql`excluded.cost`,
          environment: sql`excluded.environment`,
          provider: sql`excluded.provider`,
          model: sql`excluded.model`,
          userId: sql`excluded.user_id`,
          tenantId: sql`excluded.tenant_id`,
          hasTool: sql`excluded.has_tool`,
          workflowIds: sql`excluded.workflow_ids`,
          workflowVersions: sql`excluded.workflow_versions`,
          transitionIds: sql`excluded.transition_ids`,
          path: sql`excluded.path`,
          models: sql`excluded.models`,
          searchText: sql`excluded.search_text`,
          data: sql`excluded.data`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
  const sessionValues = models.sessions.map((session) =>
    sessionProjectionValues(
      input.organizationId,
      input.projectId,
      session,
      latestReceivedAt(receivedBySession.get(session.id) ?? []),
    ),
  );
  if (sessionValues.length > 0) {
    await db
      .insert(studioSessions)
      .values(sessionValues)
      .onConflictDoUpdate({
        target: [
          studioSessions.organizationId,
          studioSessions.projectId,
          studioSessions.sessionId,
        ],
        set: {
          status: sql`excluded.status`,
          lastActivityAt: sql`excluded.last_activity_at`,
          durationMs: sql`excluded.duration_ms`,
          tokens: sql`excluded.tokens`,
          cost: sql`excluded.cost`,
          runCount: sql`excluded.run_count`,
          environment: sql`excluded.environment`,
          userId: sql`excluded.user_id`,
          tenantId: sql`excluded.tenant_id`,
          activeWorkflowId: sql`excluded.active_workflow_id`,
          activeVersion: sql`excluded.active_version`,
          pendingInterruptId: sql`excluded.pending_interrupt_id`,
          hasError: sql`excluded.has_error`,
          hasInterrupt: sql`excluded.has_interrupt`,
          hasCheckpoint: sql`excluded.has_checkpoint`,
          hasFork: sql`excluded.has_fork`,
          workflowIds: sql`excluded.workflow_ids`,
          providers: sql`excluded.providers`,
          models: sql`excluded.models`,
          tags: sql`excluded.tags`,
          searchText: sql`excluded.search_text`,
          data: sql`excluded.data`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
  const interruptValues = models.interrupts.map((interrupt) =>
    interruptProjectionValues(
      input.organizationId,
      input.projectId,
      interrupt,
      latestReceivedAt(receivedByInterrupt.get(interrupt.id) ?? []),
    ),
  );
  if (interruptValues.length > 0) {
    await db
      .insert(studioInterrupts)
      .values(interruptValues)
      .onConflictDoUpdate({
        target: [
          studioInterrupts.organizationId,
          studioInterrupts.projectId,
          studioInterrupts.interruptId,
        ],
        set: {
          runId: sql`excluded.run_id`,
          sessionId: sql`excluded.session_id`,
          status: sql`excluded.status`,
          type: sql`excluded.type`,
          createdAt: sql`excluded.created_at`,
          resolvedAt: sql`excluded.resolved_at`,
          expiresAt: sql`excluded.expires_at`,
          workflowId: sql`excluded.workflow_id`,
          nodeId: sql`excluded.node_id`,
          environment: sql`excluded.environment`,
          userId: sql`excluded.user_id`,
          tenantId: sql`excluded.tenant_id`,
          resolvedBy: sql`excluded.resolved_by`,
          resumeOutcome: sql`excluded.resume_outcome`,
          hasError: sql`excluded.has_error`,
          searchText: sql`excluded.search_text`,
          data: sql`excluded.data`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  return {
    runs: models.runs.length,
    sessions: models.sessions.length,
    interrupts: models.interrupts.length,
  };
};

export type StudioProjectionBackfillResult = ProjectionRefreshResult & {
  projects: number;
};

export const backfillStudioProjections = async (
  db: TelemetryDb,
  options: {
    batchSize?: number;
    organizationId?: string;
    projectId?: string;
  } = {},
): Promise<StudioProjectionBackfillResult> => {
  if (Boolean(options.organizationId) !== Boolean(options.projectId)) {
    throw new Error(
      "organizationId and projectId must be provided together for a scoped backfill.",
    );
  }
  const requestedBatchSize = Math.floor(options.batchSize ?? 100);
  const batchSize = Math.min(500, Math.max(1, requestedBatchSize));
  const scopes = await db
    .selectDistinct({
      organizationId: telemetryEvents.organizationId,
      projectId: telemetryEvents.projectId,
    })
    .from(telemetryEvents)
    .where(
      options.organizationId && options.projectId
        ? and(
            eq(telemetryEvents.organizationId, options.organizationId),
            eq(telemetryEvents.projectId, options.projectId),
          )
        : undefined,
    )
    .orderBy(telemetryEvents.organizationId, telemetryEvents.projectId);
  const totals: StudioProjectionBackfillResult = {
    projects: 0,
    runs: 0,
    sessions: 0,
    interrupts: 0,
  };

  for (const scope of scopes) {
    let afterRunId: string | undefined;
    let projectRuns = 0;
    let projectSessions = 0;
    let projectInterrupts = 0;
    for (;;) {
      const runRows = await db
        .selectDistinct({ runId: telemetryEvents.runId })
        .from(telemetryEvents)
        .where(
          and(
            eq(telemetryEvents.organizationId, scope.organizationId),
            eq(telemetryEvents.projectId, scope.projectId),
            afterRunId ? gt(telemetryEvents.runId, afterRunId) : undefined,
          ),
        )
        .orderBy(asc(telemetryEvents.runId))
        .limit(batchSize);
      if (runRows.length === 0) break;

      const result = await refreshStudioProjectionScopes(db, {
        ...scope,
        runIds: runRows.map((row) => row.runId),
      });
      projectRuns += result.runs;
      projectSessions += result.sessions;
      projectInterrupts += result.interrupts;
      afterRunId = runRows.at(-1)?.runId;
    }
    totals.projects += 1;
    totals.runs += projectRuns;
    totals.sessions += projectSessions;
    totals.interrupts += projectInterrupts;
  }
  return totals;
};
