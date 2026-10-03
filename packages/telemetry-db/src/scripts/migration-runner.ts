import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type postgres from "postgres";
import {
  type MigrateDatabaseOptions,
  withMigrationConnection,
} from "./migration-connection";

export type { MigrateDatabaseOptions } from "./migration-connection";

/** Native-only execution. No legacy detection, baselining or ledger maintenance. */
export async function applyNativeMigrations(
  sql: postgres.Sql,
  migrationsDir: string,
  log: (message: string) => void = console.log,
): Promise<void> {
  await migrate(drizzle(sql), { migrationsFolder: migrationsDir });
  log("Drizzle migrations complete.");
}

export async function migrateDatabase({
  databaseUrl,
  migrationsDir = path.resolve(process.cwd(), "drizzle"),
  log = console.log,
}: MigrateDatabaseOptions): Promise<void> {
  await withMigrationConnection(databaseUrl, (sql) =>
    applyNativeMigrations(sql, migrationsDir, log),
  );
}
