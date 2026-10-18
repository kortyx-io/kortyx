import { randomUUID } from "node:crypto";
import {
  emptyTablePreferences,
  type StudioTableView,
} from "@kortyx/telemetry-contracts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTelemetryDbClient } from "../src/client";
import {
  readTablePreferences,
  TablePreferenceConflict,
  writeTablePreferences,
} from "../src/repositories/table-preferences";
import {
  organizations,
  projects,
  studioTableViews,
  users,
} from "../src/schema";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("table preference persistence", () => {
  it("isolates users/projects, preserves independent views, rejects stale writes, and cascades deletions", async () => {
    if (!url) throw new Error("DATABASE_URL is required.");
    const client = createTelemetryDbClient(url);
    const organizationId = randomUUID(),
      projectId = randomUUID(),
      otherProject = randomUUID(),
      userId = randomUUID(),
      otherUser = randomUUID();
    const scope = {
      organizationId,
      projectId,
      userId,
      ownerKind: "user" as const,
    };
    const scopeKey = "a".repeat(64);
    try {
      await client.db
        .insert(organizations)
        .values({ id: organizationId, name: "preferences-test" });
      await client.db.insert(projects).values([
        { id: projectId, organizationId, name: "one" },
        { id: otherProject, organizationId, name: "two" },
      ]);
      await client.db.insert(users).values([
        { id: userId, email: `${userId}@example.test` },
        { id: otherUser, email: `${otherUser}@example.test` },
      ]);
      expect(await readTablePreferences(client.db, scope, "prompts")).toEqual(
        emptyTablePreferences(),
      );
      const view: StudioTableView = {
        id: randomUUID(),
        name: "Mine",
        filters: { match: "all", rules: [] },
        scope: {},
        layout: { widths: {}, order: [], hidden: [], pinned: {} },
      };
      const first = await writeTablePreferences(client.db, scope, "prompts", {
        scopeKey,
        expectedRevision: 0,
        operation: { kind: "putView", view },
      });
      expect(first.revision).toBe(1);
      expect(first.views).toEqual([view]);
      await expect(
        writeTablePreferences(client.db, scope, "prompts", {
          scopeKey,
          expectedRevision: 0,
          operation: { kind: "deleteView", id: view.id },
        }),
      ).rejects.toBeInstanceOf(TablePreferenceConflict);
      const second = { ...view, id: randomUUID(), name: "Other view" };
      const two = await writeTablePreferences(client.db, scope, "prompts", {
        scopeKey,
        expectedRevision: 1,
        operation: { kind: "putView", view: second },
      });
      expect(two.views).toHaveLength(2);
      expect(
        (
          await readTablePreferences(
            client.db,
            { ...scope, userId: otherUser },
            "prompts",
          )
        ).views,
      ).toEqual([]);
      expect(
        (
          await readTablePreferences(
            client.db,
            { ...scope, projectId: otherProject },
            "prompts",
          )
        ).views,
      ).toEqual([]);
      expect(
        (
          await readTablePreferences(
            client.db,
            { ...scope, ownerKind: "project", userId: null },
            "prompts",
          )
        ).views,
      ).toEqual([]);
      const races = await Promise.allSettled(
        ["A", "B"].map((name) =>
          writeTablePreferences(client.db, scope, "prompts", {
            scopeKey,
            expectedRevision: 2,
            operation: { kind: "putView", view: { ...view, name } },
          }),
        ),
      );
      expect(
        races.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        races.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        (await readTablePreferences(client.db, scope, "prompts")).views,
      ).toHaveLength(2);
      await client.db.delete(users).where(eq(users.id, userId));
      expect(
        await client.db
          .select()
          .from(studioTableViews)
          .where(eq(studioTableViews.id, view.id)),
      ).toEqual([]);
    } finally {
      await client.db
        .delete(organizations)
        .where(eq(organizations.id, organizationId));
      await client.db.delete(users).where(eq(users.id, otherUser));
      await client.db.delete(users).where(eq(users.id, userId));
      await client.close();
    }
  });
});
