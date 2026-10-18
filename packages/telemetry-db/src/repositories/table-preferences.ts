import {
  emptyTablePreferences,
  type StudioTablePreferences,
  StudioTablePreferencesSchema,
  type StudioTablePreferenceWrite,
} from "@kortyx/telemetry-contracts";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryValidationError } from "../errors";
import {
  studioTablePreferences as preferences,
  studioTableViews as views,
} from "../schema";
export type TablePreferenceOwner = {
  organizationId: string;
  projectId: string;
  ownerKind: "project" | "user";
  userId: string | null;
};
const scopeWhere = (owner: TablePreferenceOwner, tableId: string) =>
  and(
    eq(preferences.organizationId, owner.organizationId),
    eq(preferences.projectId, owner.projectId),
    eq(preferences.ownerKind, owner.ownerKind),
    eq(preferences.tableId, tableId),
    owner.userId
      ? eq(preferences.userId, owner.userId)
      : isNull(preferences.userId),
  );
export class TablePreferenceConflict extends Error {}
export async function readTablePreferences(
  db: TelemetryDb,
  owner: TablePreferenceOwner,
  tableId: string,
): Promise<StudioTablePreferences> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(preferences)
      .where(scopeWhere(owner, tableId))
      .for("share");
    if (!row) return emptyTablePreferences();
    const records = await tx
      .select()
      .from(views)
      .where(eq(views.preferenceId, row.id))
      .orderBy(views.createdAt, views.id);
    return StudioTablePreferencesSchema.parse({
      schemaVersion: 1,
      revision: row.revision,
      defaults: row.defaults,
      views: records.map((v) => v.definition),
    });
  });
}
export async function writeTablePreferences(
  db: TelemetryDb,
  owner: TablePreferenceOwner,
  tableId: string,
  input: StudioTablePreferenceWrite,
): Promise<StudioTablePreferences> {
  return db.transaction(async (tx) => {
    await tx
      .insert(preferences)
      .values({ ...owner, tableId })
      .onConflictDoNothing();
    // Compare-and-swap locks the parent for every mutation, including child changes.
    const [row] = await tx
      .update(preferences)
      .set({
        revision: sql`${preferences.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          scopeWhere(owner, tableId),
          eq(preferences.revision, input.expectedRevision),
        ),
      )
      .returning();
    if (!row)
      throw new TablePreferenceConflict("Preferences changed elsewhere.");
    const op = input.operation;
    if (op.kind === "defaults") {
      await tx
        .update(preferences)
        .set({ defaults: { ...row.defaults, ...op.patch } })
        .where(eq(preferences.id, row.id));
    } else if (op.kind === "deleteView") {
      await tx
        .delete(views)
        .where(and(eq(views.preferenceId, row.id), eq(views.id, op.id)));
    } else {
      const existing = await tx
        .select({ id: views.id })
        .from(views)
        .where(eq(views.preferenceId, row.id));
      if (existing.length >= 30 && !existing.some((v) => v.id === op.view.id))
        throw new TelemetryValidationError("At most 30 views per table.");
      await tx
        .insert(views)
        .values({ preferenceId: row.id, id: op.view.id, definition: op.view })
        .onConflictDoUpdate({
          target: [views.preferenceId, views.id],
          set: { definition: op.view, updatedAt: new Date() },
        });
    }
    return readTablePreferences(tx as unknown as TelemetryDb, owner, tableId);
  });
}
