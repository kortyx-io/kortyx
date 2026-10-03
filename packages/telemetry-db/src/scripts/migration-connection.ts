import postgres from "postgres";

export type MigrateDatabaseOptions = {
  databaseUrl: string;
  migrationsDir?: string;
  log?: (message: string) => void;
};

/** A dedicated session keeps preparation and native migration serialized together. */
export async function withMigrationConnection<Result>(
  databaseUrl: string,
  run: (sql: postgres.Sql) => Promise<Result>,
): Promise<Result> {
  const sql = postgres(databaseUrl, { max: 1 });
  let locked = false;
  try {
    // Preserve the released runner's database-scoped lock identity.
    await sql`SELECT pg_advisory_lock(hashtextextended('kortyx_schema_migrations', 0))`;
    locked = true;
    // Keep pg_catalog implicit (searched first), like the released runner's
    // default public schema. Explicit public,pg_catalog changes UUID resolution
    // because pgcrypto also exposes public.gen_random_uuid().
    await sql`SET search_path TO public`;
    return await run(sql);
  } finally {
    try {
      if (locked)
        await sql`SELECT pg_advisory_unlock(hashtextextended('kortyx_schema_migrations', 0))`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}
