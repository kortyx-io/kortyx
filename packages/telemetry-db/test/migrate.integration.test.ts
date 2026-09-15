import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { migrateDatabase } from "../src/scripts/migration-runner";

const databaseUrl = process.env.DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

integration("database migration high availability", () => {
  it("serializes concurrent migration runners", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const migrationId = `9999_ha_${suffix}.sql`;
    const tableName = `kortyx_ha_${suffix}`;
    const migrationsDir = await mkdtemp(
      path.join(tmpdir(), "kortyx-migration-ha-"),
    );
    const cleanup = postgres(databaseUrl as string, { max: 1 });

    try {
      await writeFile(
        path.join(migrationsDir, migrationId),
        [
          "SELECT pg_sleep(0.2);",
          `CREATE TABLE "${tableName}" ("id" integer PRIMARY KEY);`,
        ].join("\n"),
      );

      await Promise.all([
        migrateDatabase({
          databaseUrl: databaseUrl as string,
          migrationsDir,
          log: () => undefined,
        }),
        migrateDatabase({
          databaseUrl: databaseUrl as string,
          migrationsDir,
          log: () => undefined,
        }),
      ]);

      const [{ count }] = await cleanup<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM "kortyx_schema_migrations"
        WHERE "id" = ${migrationId}
      `;
      expect(count).toBe(1);
    } finally {
      await cleanup.unsafe(`DROP TABLE IF EXISTS "${tableName}"`);
      await cleanup`
        DELETE FROM "kortyx_schema_migrations"
        WHERE "id" = ${migrationId}
      `;
      await cleanup.end({ timeout: 5 });
      await rm(migrationsDir, { recursive: true, force: true });
    }
  });
});
