import path from "node:path";
import type postgres from "postgres";
import {
  LEGACY_SCHEMA_FINGERPRINTS,
  legacyPrefix,
  validateLegacyHistory,
} from "./legacy-migrations";
import {
  type MigrateDatabaseOptions,
  readAppliedHistory,
  withMigrationConnection,
} from "./migration-connection";
import {
  type MigrationHistory,
  readHistory,
  validateAppliedHistory,
} from "./migration-history";
import { LEGACY_TABLES, legacySchemaFingerprint } from "./migration-schema";

export type PreparationResult = "fresh" | "native" | "prepared";

/**
 * One-time metadata adoption only. Caller holds the migration lock.
 * No product SQL runs and the legacy ledger is NEVER created, updated or dropped.
 */
export async function prepareLegacyDatabase(
  sql: postgres.Sql,
  history: MigrationHistory,
  log: (message: string) => void = console.log,
): Promise<PreparationResult> {
  const applied = await readAppliedHistory(sql);
  validateAppliedHistory(applied, history);
  // Once adopted, only native history is authoritative. Do not inspect old ledgers.
  if (applied.length > 0) return "native";

  const [table] =
    await sql`SELECT to_regclass('public.kortyx_schema_migrations') AS relation`;
  if (!table?.relation) {
    const [owned] = await sql`
      SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY(${LEGACY_TABLES})) AS present
    `;
    if (owned?.present) {
      throw new Error(
        "Existing Studio schema has no recognized migration history. Preparation stopped without writing a baseline; inspect the matching release, do not reset the database.",
      );
    }
    return "fresh";
  }

  const rows = await sql<
    { id: string }[]
  >`SELECT id FROM public.kortyx_schema_migrations`;
  const prefix = legacyPrefix(rows.map(({ id }) => id));
  validateLegacyHistory(history);
  const fingerprint = await legacySchemaFingerprint(sql);
  if (fingerprint !== LEGACY_SCHEMA_FINGERPRINTS[prefix]) {
    throw new Error(
      "Studio schema does not match its legacy ledger. Preparation stopped without writing a baseline or changing product DDL. Back up the database and inspect schema drift; do not delete migration history.",
    );
  }
  if (prefix === 0) return "fresh";

  // Stable Drizzle lacks native init. Write its metadata format once, atomically,
  // after validating both the released artifacts and the actual legacy catalog.
  await sql.begin(async (tx) => {
    await tx`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await tx`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
    )`;
    for (const migration of history.migrations.slice(0, prefix)) {
      await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${migration.hash}, ${migration.folderMillis})`;
    }
  });
  log(
    `Prepared ${prefix} legacy migrations for Drizzle without replaying SQL. The legacy ledger is unchanged.`,
  );
  return "prepared";
}

/** Standalone optional preparation. Stop old migration jobs before a separate handoff. */
export async function prepareDatabaseForDrizzle({
  databaseUrl,
  migrationsDir = path.resolve(process.cwd(), "drizzle"),
  log = console.log,
}: MigrateDatabaseOptions): Promise<PreparationResult> {
  const history = await readHistory(migrationsDir);
  return withMigrationConnection(databaseUrl, (sql) =>
    prepareLegacyDatabase(sql, history, log),
  );
}
