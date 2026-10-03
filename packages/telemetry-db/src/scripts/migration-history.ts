import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { type MigrationMeta, readMigrationFiles } from "drizzle-orm/migrator";
import { LEGACY_MIGRATIONS } from "./legacy-migrations";

export type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};
export type MigrationHistory = {
  entries: JournalEntry[];
  migrations: MigrationMeta[];
};

/** Drizzle executes SQL; this guard detects history edits its latest-timestamp check cannot. */
export async function readHistory(
  migrationsDir: string,
): Promise<MigrationHistory> {
  const journal = JSON.parse(
    await readFile(path.join(migrationsDir, "meta/_journal.json"), "utf8"),
  );
  if (
    journal.version !== "7" ||
    journal.dialect !== "postgresql" ||
    !Array.isArray(journal.entries)
  ) {
    throw new Error("Unsupported Drizzle migration journal.");
  }
  const entries: JournalEntry[] = journal.entries;
  const tags = new Set<string>();
  let previousWhen = 0;
  for (const [idx, entry] of entries.entries()) {
    if (
      entry.idx !== idx ||
      entry.version !== "7" ||
      !Number.isSafeInteger(entry.when) ||
      entry.when <= previousWhen ||
      typeof entry.tag !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(entry.tag) ||
      tags.has(entry.tag) ||
      typeof entry.breakpoints !== "boolean"
    ) {
      throw new Error(`Invalid or reordered Drizzle journal entry ${idx}.`);
    }
    tags.add(entry.tag);
    previousWhen = entry.when;
  }
  const files = (await readdir(migrationsDir)).filter((file) =>
    file.endsWith(".sql"),
  );
  if (
    files.length !== entries.length ||
    files.some((file) => !tags.has(file.slice(0, -4)))
  ) {
    throw new Error(
      "SQL files and Drizzle journal do not match. Generate migrations with db:generate.",
    );
  }
  const migrations = readMigrationFiles({ migrationsFolder: migrationsDir });
  for (const [idx, legacy] of LEGACY_MIGRATIONS.entries()) {
    if (
      entries[idx]?.tag !== legacy.tag ||
      entries[idx]?.when !== legacy.when ||
      migrations[idx]?.hash !== legacy.hash
    ) {
      throw new Error(
        `Released migration ${legacy.tag}.sql was changed or removed. Append a new migration instead.`,
      );
    }
  }
  return { entries, migrations };
}

export function legacyPrefix(ids: string[]): number {
  const known = new Set<string>(
    LEGACY_MIGRATIONS.map(({ tag }) => `${tag}.sql`),
  );
  const applied = new Set(ids);
  if (ids.length !== applied.size || ids.some((id) => !known.has(id))) {
    throw new Error(
      "Unknown legacy migration history. Restore the matching release; do not reset the database.",
    );
  }
  for (const [idx, migration] of LEGACY_MIGRATIONS.entries()) {
    if (applied.has(`${migration.tag}.sql`) !== idx < applied.size) {
      throw new Error(
        "Legacy migration history has a gap. Refusing to guess a baseline.",
      );
    }
  }
  return applied.size;
}

export function validateAppliedHistory(
  applied: { hash: string; created_at: string | number }[],
  { migrations }: MigrationHistory,
): void {
  for (const [idx, row] of applied.entries()) {
    const migration = migrations[idx];
    if (
      !migration ||
      row.hash !== migration.hash ||
      Number(row.created_at) !== migration.folderMillis
    ) {
      throw new Error(
        `Applied Drizzle migration ${idx} differs from this release. History must be append-only; use the matching release or restore a backup.`,
      );
    }
  }
}
