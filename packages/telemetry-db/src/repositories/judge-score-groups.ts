import {
  ASSESSMENT_SCORE_GROUP,
  DEFAULT_SCORE_GROUP_REF,
  ScoreGroupAssetSchema,
  type ScoreGroupDefinition,
  ScoreGroupDefinitionSchema,
  ScoreGroupMetadataSchema,
  type ScoreGroupVersion,
  ScoreGroupVersionSchema,
} from "@kortyx/telemetry-contracts";
import { and, desc, eq, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError, TelemetryValidationError } from "../errors";
import {
  judgeScoreGroups as groups,
  judgeScoreGroupVersions as versions,
} from "../schema";

type Scope = { organizationId: string; projectId: string };
const where = (table: typeof groups | typeof versions, scope: Scope) =>
  and(
    eq(table.organizationId, scope.organizationId),
    eq(table.projectId, scope.projectId),
  );
const builtin = ScoreGroupAssetSchema.parse({
  id: DEFAULT_SCORE_GROUP_REF.id,
  revision: 1,
  publishedVersion: 1,
  archived: false,
  builtin: true,
  draft: ASSESSMENT_SCORE_GROUP.definition,
  latest: ASSESSMENT_SCORE_GROUP,
  updatedAt: ASSESSMENT_SCORE_GROUP.createdAt,
});
const versionRow = (row: typeof versions.$inferSelect) =>
  ScoreGroupVersionSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });

export async function getJudgeScoreGroup(
  db: Pick<TelemetryDb, "select">,
  scope: Scope,
  id: string,
) {
  if (id === DEFAULT_SCORE_GROUP_REF.id)
    return { group: builtin, versions: [ASSESSMENT_SCORE_GROUP] };
  const [row] = await db
    .select()
    .from(groups)
    .where(and(where(groups, scope), eq(groups.id, id)))
    .limit(1);
  if (!row) throw new TelemetryNotFoundError("Score group not found.");
  const saved = await db
    .select()
    .from(versions)
    .where(and(where(versions, scope), eq(versions.groupId, id)))
    .orderBy(desc(versions.version))
    .limit(100);
  return {
    group: ScoreGroupAssetSchema.parse({
      ...row,
      builtin: false,
      updatedAt: row.updatedAt.toISOString(),
      latest: saved[0] ? versionRow(saved[0]) : null,
    }),
    versions: saved.map(versionRow),
  };
}
export async function listJudgeScoreGroups(db: TelemetryDb, scope: Scope) {
  const rows = await db
    .select({ group: groups, latest: versions })
    .from(groups)
    .leftJoin(
      versions,
      and(
        eq(versions.groupId, groups.id),
        eq(versions.organizationId, groups.organizationId),
        eq(versions.projectId, groups.projectId),
        eq(versions.version, groups.publishedVersion),
      ),
    )
    .where(where(groups, scope))
    .orderBy(desc(groups.updatedAt))
    .limit(200);
  return [
    builtin,
    ...rows.map(({ group, latest }) =>
      ScoreGroupAssetSchema.parse({
        ...group,
        builtin: false,
        updatedAt: group.updatedAt.toISOString(),
        latest: latest ? versionRow(latest) : null,
      }),
    ),
  ];
}
export async function getJudgeScoreGroupVersion(
  db: Pick<TelemetryDb, "select">,
  scope: Scope,
  ref: { id: string; version: number },
  options: { allowArchived?: boolean } = {},
): Promise<ScoreGroupVersion> {
  if (ref.id === DEFAULT_SCORE_GROUP_REF.id && ref.version === 1)
    return ASSESSMENT_SCORE_GROUP;
  const [row] = await db
    .select({ saved: versions, archived: groups.archived })
    .from(versions)
    .innerJoin(
      groups,
      and(
        eq(versions.groupId, groups.id),
        eq(versions.organizationId, groups.organizationId),
        eq(versions.projectId, groups.projectId),
      ),
    )
    .where(
      and(
        where(versions, scope),
        eq(versions.groupId, ref.id),
        eq(versions.version, ref.version),
      ),
    )
    .limit(1);
  if (!row) throw new TelemetryNotFoundError("Score-group version not found.");
  if (row.archived && !options.allowArchived)
    throw new TelemetryValidationError("Select an active score group.");
  return versionRow(row.saved);
}
export async function saveJudgeScoreGroup(
  db: TelemetryDb,
  scope: Scope,
  input: ScoreGroupDefinition,
  id?: string,
  revision?: number,
) {
  const draft = ScoreGroupDefinitionSchema.parse(input);
  if (id === DEFAULT_SCORE_GROUP_REF.id)
    throw new TelemetryValidationError(
      "Assessment is read-only. Duplicate it to customize.",
    );
  if (!id) {
    const [row] = await db
      .insert(groups)
      .values({ ...scope, draft })
      .returning();
    if (!row) throw new Error("Score group could not be created.");
    return getJudgeScoreGroup(db, scope, row.id);
  }
  const [updated] = await db
    .update(groups)
    .set({ draft, revision: (revision ?? 0) + 1, updatedAt: new Date() })
    .where(
      and(
        where(groups, scope),
        eq(groups.id, id),
        eq(groups.revision, revision ?? 0),
        eq(groups.archived, false),
      ),
    )
    .returning({ id: groups.id });
  if (!updated)
    throw new TelemetryValidationError(
      "Score group changed. Reload before saving.",
    );
  return getJudgeScoreGroup(db, scope, id);
}
/** Asset metadata changes independently of immutable output definitions. */
export async function updateJudgeScoreGroupMetadata(
  db: TelemetryDb,
  scope: Scope,
  id: string,
  revision: number,
  input: { name: string; description: string },
) {
  const metadata = ScoreGroupMetadataSchema.parse(input);
  if (id === DEFAULT_SCORE_GROUP_REF.id)
    throw new TelemetryValidationError(
      "Assessment is read-only. Duplicate it to customize.",
    );
  const [row] = await db
    .update(groups)
    .set({
      draft: sql`${groups.draft} || ${JSON.stringify(metadata)}::jsonb`,
      revision: sql`${groups.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        where(groups, scope),
        eq(groups.id, id),
        eq(groups.revision, revision),
        eq(groups.archived, false),
      ),
    )
    .returning({ id: groups.id });
  if (!row)
    throw new TelemetryValidationError(
      "Score group changed. Reload before renaming.",
    );
  return getJudgeScoreGroup(db, scope, id);
}

export async function publishJudgeScoreGroup(
  db: TelemetryDb,
  scope: Scope,
  id: string,
  revision: number,
) {
  if (id === DEFAULT_SCORE_GROUP_REF.id)
    throw new TelemetryValidationError("Assessment is read-only.");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(groups)
      .where(
        and(
          where(groups, scope),
          eq(groups.id, id),
          eq(groups.revision, revision),
          eq(groups.archived, false),
        ),
      )
      .for("update")
      .limit(1);
    if (!row)
      throw new TelemetryValidationError(
        "Score group changed. Reload before saving.",
      );
    const definition = ScoreGroupDefinitionSchema.parse(row.draft);
    const version = row.publishedVersion + 1;
    await tx
      .insert(versions)
      .values({ ...scope, groupId: id, version, definition });
    await tx
      .update(groups)
      .set({
        publishedVersion: version,
        revision: row.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(groups.id, id));
  });
  return getJudgeScoreGroup(db, scope, id);
}
export async function archiveJudgeScoreGroup(
  db: TelemetryDb,
  scope: Scope,
  id: string,
  revision: number,
) {
  if (id === DEFAULT_SCORE_GROUP_REF.id)
    throw new TelemetryValidationError("Assessment cannot be archived.");
  const [row] = await db
    .update(groups)
    .set({ archived: true, revision: revision + 1, updatedAt: new Date() })
    .where(
      and(
        where(groups, scope),
        eq(groups.id, id),
        eq(groups.revision, revision),
      ),
    )
    .returning({ id: groups.id });
  if (!row)
    throw new TelemetryValidationError(
      "Score group changed. Reload before archiving.",
    );
  return getJudgeScoreGroup(db, scope, id);
}
