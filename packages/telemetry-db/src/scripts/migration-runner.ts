import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  LEGACY_MIGRATIONS,
  LEGACY_SCHEMA_FINGERPRINTS,
} from "./legacy-migrations";
import {
  legacyPrefix,
  readHistory,
  validateAppliedHistory,
} from "./migration-history";
import { legacySchemaFingerprint } from "./migration-schema";

const MIGRATION_LOCK_NAME = "kortyx_schema_migrations";

export type MigrateDatabaseOptions = {
  databaseUrl: string;
  migrationsDir?: string;
  log?: (message: string) => void;
};

export const migrateDatabase = async ({
  databaseUrl,
  migrationsDir = path.resolve(process.cwd(), "drizzle"),
  log = console.log,
}: MigrateDatabaseOptions): Promise<void> => {
  const history = await readHistory(migrationsDir);
  // One dedicated connection holds the SAME session lock used by released jobs.
  const sql = postgres(databaseUrl, { max: 1 });
  let lockAcquired = false;
  const readApplied = () => sql<{ hash: string; created_at: string }[]>`
    SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id
  `;

  try {
    await sql`SELECT pg_advisory_lock(hashtextextended(${MIGRATION_LOCK_NAME}, 0))`;
    lockAcquired = true;
    await sql`SET search_path TO public, pg_catalog`;
    const [tables] = await sql`
      SELECT to_regclass('public.kortyx_schema_migrations') AS legacy,
        to_regclass('drizzle.__drizzle_migrations') AS native
    `;
    const legacyIds = tables?.legacy
      ? (
          await sql<
            { id: string }[]
          >`SELECT id FROM public.kortyx_schema_migrations`
        ).map(({ id }) => id)
      : [];
    const prefix = legacyPrefix(legacyIds);
    const applied = tables?.native ? await readApplied() : [];
    validateAppliedHistory(applied, history);

    if (applied.length === 0) {
      const fingerprint = await legacySchemaFingerprint(sql);
      if (fingerprint !== LEGACY_SCHEMA_FINGERPRINTS[prefix]) {
        throw new Error(
          "Studio schema does not match its legacy ledger. No baseline or product DDL was applied. Back up the database and inspect schema drift; do not delete migration history.",
        );
      }
      if (prefix > 0) {
        // Stable Drizzle has no native init/baseline command. Adopt verified legacy
        // entries atomically using Drizzle's metadata format; never replay DDL.
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
          `Adopted ${prefix} verified legacy migrations without replaying SQL.`,
        );
      }
    } else if (prefix > applied.length) {
      throw new Error(
        "Legacy history is ahead of Drizzle history. Refusing an inconsistent baseline.",
      );
    }

    // The native migrator owns all product DDL and its transaction/journal writes.
    await migrate(drizzle(sql), { migrationsFolder: migrationsDir });
    validateAppliedHistory(await readApplied(), history);

    // Retain and complete the old ledger for released tooling. This is recoverable
    // bookkeeping: if interrupted after native commit, the next run finishes it.
    await sql.begin(async (tx) => {
      await tx`CREATE TABLE IF NOT EXISTS public.kortyx_schema_migrations (
        id text PRIMARY KEY, applied_at timestamp with time zone DEFAULT now() NOT NULL
      )`;
      for (const { tag } of LEGACY_MIGRATIONS) {
        await tx`INSERT INTO public.kortyx_schema_migrations (id)
          VALUES (${`${tag}.sql`}) ON CONFLICT (id) DO NOTHING`;
      }
    });
    log(
      `Drizzle migration history is current (${history.entries.length} migrations).`,
    );
  } finally {
    try {
      if (lockAcquired) {
        await sql`SELECT pg_advisory_unlock(hashtextextended(${MIGRATION_LOCK_NAME}, 0))`;
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
};
