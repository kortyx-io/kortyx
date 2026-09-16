import { createHash } from "node:crypto";
import { PersistenceError } from "@kortyx/core/errors";
import type postgres from "postgres";
import { initialRuntimeMigration } from "./0001-initial-runtime";

export type RuntimeMigration = {
  readonly version: number;
  readonly description: string;
  readonly sql: string;
};

/** Bundle SQL into the SDK; no filesystem reads or extra migration dependency. */
export const runtimeMigrations: readonly RuntimeMigration[] = Object.freeze([
  initialRuntimeMigration,
]);

/** Internal runner. The explicit migration list is used by real-database upgrade tests. */
export async function runRuntimeMigrations(
  database: postgres.Sql,
  migrations: readonly RuntimeMigration[] = runtimeMigrations,
): Promise<void> {
  if (!migrations.length)
    throw new TypeError("Runtime migrations must include version 1.");
  for (const [index, migration] of migrations.entries()) {
    if (migration.version !== index + 1 || !migration.sql.trim())
      throw new TypeError(
        "Runtime migrations must contain nonempty SQL with consecutive versions starting at 1.",
      );
  }

  const checksums = migrations.map((migration) =>
    createHash("sha256").update(migration.sql).digest("hex"),
  );

  for (const migration of migrations) {
    try {
      await database.begin("isolation level read committed", async (sql) => {
        // Recheck history under the lock for every version: concurrent setup calls
        // may interleave between commits, but a version can only be applied once.
        // Bound both advisory and DDL lock waits without relaxing a stricter
        // deployment-configured timeout. Transaction-local settings do not leak
        // into the pool's application queries.
        await sql`SELECT set_config('lock_timeout', CASE WHEN current_setting('lock_timeout')::interval = interval '0' OR current_setting('lock_timeout')::interval > interval '5 seconds' THEN '5s' ELSE current_setting('lock_timeout') END, true)`;
        await sql`SELECT pg_advisory_xact_lock(hashtextextended('kortyx:runtime:schema', 0))`;
        await sql`CREATE TABLE IF NOT EXISTS kortyx_runtime_migrations (version integer PRIMARY KEY, checksum text)`;
        const checksumColumn =
          await sql`SELECT 1 FROM pg_attribute WHERE attrelid = 'kortyx_runtime_migrations'::regclass AND attname = 'checksum' AND NOT attisdropped`;
        const legacyLedger = !checksumColumn.length;
        if (legacyLedger)
          await sql`ALTER TABLE kortyx_runtime_migrations ADD COLUMN checksum text`;
        const applied = await sql<
          { version: number; checksum: string | null }[]
        >`SELECT version, checksum FROM kortyx_runtime_migrations ORDER BY version`;
        if (applied.some((row) => row.version > migrations.length))
          throw new PersistenceError(
            "The runtime schema is newer than this SDK supports.",
          );
        if (
          applied.some((row, index) => row.version !== index + 1) ||
          applied.length < migration.version - 1
        )
          throw new PersistenceError(
            "The runtime migration history is not a consecutive sequence starting at version 1.",
          );
        for (const row of applied) {
          const expected = checksums[row.version - 1]!;
          // The original unreleased v1 bootstrap recorded only its version.
          // Adopt that baseline once; its prior SQL cannot be verified retroactively.
          if (legacyLedger && applied.length === 1 && row.version === 1) {
            await sql`UPDATE kortyx_runtime_migrations SET checksum = ${expected} WHERE version = 1`;
          } else if (row.checksum !== expected) {
            throw new PersistenceError(
              `Runtime migration ${row.version} checksum does not match this SDK. Restore the original migration; add a new version for changes.`,
            );
          }
        }
        if (migration.version <= applied.length) return;

        await sql.unsafe(migration.sql);
        await sql`INSERT INTO kortyx_runtime_migrations (version, checksum) VALUES (${migration.version}, ${checksums[migration.version - 1]!})`;
      });
    } catch (cause) {
      if (cause instanceof PersistenceError) throw cause;
      throw new PersistenceError(
        `Runtime migration ${migration.version} (${migration.description}) failed.`,
        cause,
      );
    }
  }
}
