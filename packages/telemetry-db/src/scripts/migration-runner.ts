import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type postgres from "postgres";
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

export type { MigrateDatabaseOptions } from "./migration-connection";

/** Native-only execution. No legacy detection, baselining or ledger maintenance. */
export async function applyNativeMigrations(
  sql: postgres.Sql,
  history: MigrationHistory,
  migrationsDir: string,
  log: (message: string) => void = console.log,
): Promise<void> {
  validateAppliedHistory(await readAppliedHistory(sql), history);
  await migrate(drizzle(sql), { migrationsFolder: migrationsDir });
  validateAppliedHistory(await readAppliedHistory(sql), history);
  log(
    `Drizzle migration history is current (${history.entries.length} migrations).`,
  );
}

export async function migrateDatabase({
  databaseUrl,
  migrationsDir = path.resolve(process.cwd(), "drizzle"),
  log = console.log,
}: MigrateDatabaseOptions): Promise<void> {
  const history = await readHistory(migrationsDir);
  await withMigrationConnection(databaseUrl, (sql) =>
    applyNativeMigrations(sql, history, migrationsDir, log),
  );
}
