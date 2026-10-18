import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";
import {
  LEGACY_MIGRATIONS,
  legacyPrefix,
  validateLegacyHistory,
} from "../src/scripts/legacy-migrations";

const migrationsDir = path.resolve(import.meta.dirname, "../drizzle");

async function withCopy(run: (folder: string) => Promise<void>) {
  const folder = await mkdtemp(path.join(tmpdir(), "kortyx-native-test-"));
  try {
    await cp(migrationsDir, folder, { recursive: true });
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

describe("native migrations and one-time compatibility", () => {
  it("maps the frozen legacy files to native Drizzle metadata", () => {
    const migrations = readMigrationFiles({ migrationsFolder: migrationsDir });
    expect(
      migrations.slice(0, 6).map(({ hash, folderMillis }) => ({
        hash,
        when: folderMillis,
      })),
    ).toEqual(LEGACY_MIGRATIONS.map(({ hash, when }) => ({ hash, when })));
    validateLegacyHistory(migrations);
  });

  it("accepts only a known contiguous legacy prefix", () => {
    expect(
      legacyPrefix(
        LEGACY_MIGRATIONS.slice(0, 4)
          .map(({ tag }) => `${tag}.sql`)
          .reverse(),
      ),
    ).toBe(4);
    expect(() => legacyPrefix(["0001_workflow_transitions.sql"])).toThrow(
      "gap",
    );
    expect(() => legacyPrefix(["unknown.sql"])).toThrow("Unknown");
    expect(() =>
      legacyPrefix([
        "0000_initial_telemetry.sql",
        "0000_initial_telemetry.sql",
      ]),
    ).toThrow("Unknown");
  });

  it("legacy preparation rejects edited cutover SQL", async () => {
    await withCopy(async (folder) => {
      await writeFile(
        path.join(folder, "0000_initial_telemetry.sql"),
        "SELECT 1;",
      );
      expect(() =>
        validateLegacyHistory(readMigrationFiles({ migrationsFolder: folder })),
      ).toThrow("Released migration");
    });
  });

  it("native generation from the adopted snapshot is a no-op", async () => {
    await withCopy(async (folder) => {
      const journalPath = path.join(folder, "meta/_journal.json");
      const before = await readFile(journalPath, "utf8");
      const output = execFileSync(
        "pnpm",
        [
          "exec",
          "drizzle-kit",
          "generate",
          "--dialect=postgresql",
          "--schema=./src/schema.ts",
          `--out=${path.relative(path.dirname(migrationsDir), folder)}`,
        ],
        { cwd: path.dirname(migrationsDir), encoding: "utf8" },
      );
      expect(output).toContain("No schema changes");
      expect(await readFile(journalPath, "utf8")).toBe(before);
    });
  }, 30000);
});
