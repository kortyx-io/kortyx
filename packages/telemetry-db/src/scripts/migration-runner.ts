import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

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
  const sql = postgres(databaseUrl, { max: 1 });
  let lockAcquired = false;

  try {
    // A deployment may start more than one migration job. Hold one
    // database-scoped session lock while inspecting and applying the ordered
    // migration set so only one runner can mutate the schema at a time.
    await sql`
      SELECT pg_advisory_lock(hashtextextended(${MIGRATION_LOCK_NAME}, 0))
    `;
    lockAcquired = true;

    await sql`
      CREATE TABLE IF NOT EXISTS "kortyx_schema_migrations" (
        "id" text PRIMARY KEY,
        "applied_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `;

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const [existing] = await sql<{ id: string }[]>`
        SELECT "id"
        FROM "kortyx_schema_migrations"
        WHERE "id" = ${file}
        LIMIT 1
      `;
      if (existing) {
        log(`Skipping migration ${file}.`);
        continue;
      }

      const migrationSql = await readFile(
        path.join(migrationsDir, file),
        "utf8",
      );
      await sql.begin(async (transaction) => {
        await transaction.unsafe(migrationSql);
        await transaction`
          INSERT INTO "kortyx_schema_migrations" ("id")
          VALUES (${file})
        `;
      });
      log(`Applied migration ${file}.`);
    }
  } finally {
    try {
      if (lockAcquired) {
        await sql`
          SELECT pg_advisory_unlock(hashtextextended(${MIGRATION_LOCK_NAME}, 0))
        `;
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
};
