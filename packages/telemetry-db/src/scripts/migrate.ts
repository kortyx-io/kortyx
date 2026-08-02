import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

const migrationsDir = path.resolve(process.cwd(), "drizzle");

const main = async (): Promise<void> => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
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
        console.log(`Skipping migration ${file}.`);
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
      console.log(`Applied migration ${file}.`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
};

void main();
