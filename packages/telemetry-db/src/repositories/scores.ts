import {
  type StudioRun,
  type StudioScore,
  StudioScoreSchema,
} from "@kortyx/telemetry-contracts";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError } from "../errors";
import { studioRuns, telemetryScores } from "../schema";
import { ensureProjectEnvironmentAllowed } from "./projects";
import { notifyStudioChange } from "./studio-changes";

type Scope = { organizationId: string; projectId: string };
type ScoreRecord = typeof telemetryScores.$inferSelect;
const toScore = (record: ScoreRecord): StudioScore =>
  StudioScoreSchema.parse({
    id: record.id,
    target: { type: "run", runId: record.runId },
    environment: record.environment,
    name: record.name,
    dataType: record.dataType,
    value: record.value,
    source: record.source,
    actorId: record.actorId,
    reasons: record.reasons,
    comment: record.comment,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });

export const listRunScores = async (
  db: TelemetryDb,
  input: Scope & { runIds: string[] },
): Promise<StudioScore[]> => {
  if (!input.runIds.length) return [];
  const rows = await db
    .select()
    .from(telemetryScores)
    .where(
      and(
        eq(telemetryScores.organizationId, input.organizationId),
        eq(telemetryScores.projectId, input.projectId),
        inArray(telemetryScores.runId, input.runIds),
      ),
    )
    .orderBy(desc(telemetryScores.updatedAt), desc(telemetryScores.id));
  return rows.map(toScore);
};

export const withRunFeedback = async (
  db: TelemetryDb,
  scope: Scope,
  runs: StudioRun[],
): Promise<StudioRun[]> => {
  if (!runs.length) return runs;
  const summaries = await db
    .select({
      runId: telemetryScores.runId,
      positive:
        sql<number>`count(*) filter (where ${telemetryScores.value} = '1'::jsonb)`.mapWith(
          Number,
        ),
      negative:
        sql<number>`count(*) filter (where ${telemetryScores.value} = '0'::jsonb)`.mapWith(
          Number,
        ),
    })
    .from(telemetryScores)
    .where(
      and(
        eq(telemetryScores.organizationId, scope.organizationId),
        eq(telemetryScores.projectId, scope.projectId),
        inArray(
          telemetryScores.runId,
          runs.map((run) => run.id),
        ),
        eq(telemetryScores.source, "end-user"),
        eq(telemetryScores.name, "user-feedback"),
        eq(telemetryScores.dataType, "BOOLEAN"),
      ),
    )
    .groupBy(telemetryScores.runId);
  const byRun = new Map(
    summaries.map((row) => [
      row.runId,
      { positive: row.positive, negative: row.negative },
    ]),
  );
  return runs.map((run) => ({
    ...run,
    feedback: byRun.get(run.id) ?? { positive: 0, negative: 0 },
  }));
};

const requireRun = async (
  db: TelemetryDb,
  input: Scope & { runId: string },
) => {
  const [run] = await db
    .select({ environment: studioRuns.environment, data: studioRuns.data })
    .from(studioRuns)
    .where(
      and(
        eq(studioRuns.organizationId, input.organizationId),
        eq(studioRuns.projectId, input.projectId),
        eq(studioRuns.runId, input.runId),
      ),
    )
    .limit(1);
  if (!run)
    throw new TelemetryNotFoundError(
      "Run not found. Retry after its telemetry has been ingested.",
    );
  if (run.data.parentRunId)
    throw new TelemetryNotFoundError(
      "Feedback and reviews target root executions. Use the parent run ID.",
    );
  await ensureProjectEnvironmentAllowed(db, {
    ...input,
    environment: run.environment,
  });
  return run;
};

export type UpsertRunScoreInput = Scope &
  Pick<
    StudioScore,
    "name" | "dataType" | "value" | "source" | "actorId" | "reasons" | "comment"
  > & { runId: string };
export const upsertRunScore = async (
  db: TelemetryDb,
  input: UpsertRunScoreInput,
): Promise<StudioScore> => {
  return db.transaction(async (tx) => {
    const run = await requireRun(tx, input);
    const [score] = await tx
      .insert(telemetryScores)
      .values({
        ...input,
        value: input.value,
        environment: run.environment,
        reasons: [...new Set(input.reasons)],
      })
      .onConflictDoUpdate({
        target: [
          telemetryScores.organizationId,
          telemetryScores.projectId,
          telemetryScores.runId,
          telemetryScores.source,
          telemetryScores.actorId,
          telemetryScores.name,
        ],
        set: {
          value: input.value,
          dataType: input.dataType,
          reasons: [...new Set(input.reasons)],
          comment: input.comment,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!score) throw new Error("Score was not persisted.");
    await notifyStudioChange(tx, { ...input, resources: ["runs", "sessions"] });
    return toScore(score);
  });
};

export const clearRunScore = async (
  db: TelemetryDb,
  input: Scope & {
    runId: string;
    source: StudioScore["source"];
    actorId: string;
    name: string;
  },
): Promise<void> => {
  await db.transaction(async (tx) => {
    await requireRun(tx, input);
    await tx
      .delete(telemetryScores)
      .where(
        and(
          eq(telemetryScores.organizationId, input.organizationId),
          eq(telemetryScores.projectId, input.projectId),
          eq(telemetryScores.runId, input.runId),
          eq(telemetryScores.source, input.source),
          eq(telemetryScores.actorId, input.actorId),
          eq(telemetryScores.name, input.name),
        ),
      );
    await notifyStudioChange(tx, { ...input, resources: ["runs", "sessions"] });
  });
};
