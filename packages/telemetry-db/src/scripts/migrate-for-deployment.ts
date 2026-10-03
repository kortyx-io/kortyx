import path from "node:path";
import { prepareLegacyDatabase } from "./legacy-drizzle-preparation";
import {
  type MigrateDatabaseOptions,
  withMigrationConnection,
} from "./migration-connection";
import { readHistory } from "./migration-history";
import { applyNativeMigrations } from "./migration-runner";

/** Deployment orchestration, not a migration engine: optional prepare, then native. */
export async function migrateForDeployment({
  databaseUrl,
  migrationsDir = path.resolve(process.cwd(), "drizzle"),
  log = console.log,
}: MigrateDatabaseOptions): Promise<void> {
  const history = await readHistory(migrationsDir);
  await withMigrationConnection(databaseUrl, async (sql) => {
    await prepareLegacyDatabase(sql, history, log);
    await applyNativeMigrations(sql, history, migrationsDir, log);
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  await migrateForDeployment({ databaseUrl });
}

if (path.basename(process.argv[1] ?? "") === "migrate-for-deployment.ts")
  void main();
