import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkReleasedHistory } from "../src/scripts/check-migrations";
import {
  LEGACY_MIGRATIONS,
  legacyPrefix,
  validateLegacyHistory,
} from "../src/scripts/legacy-migrations";
import {
  readHistory,
  validateAppliedHistory,
} from "../src/scripts/migration-history";

const migrationsDir = path.resolve(import.meta.dirname, "../drizzle");

async function withCopy(run: (folder: string) => Promise<void>) {
  const folder = await mkdtemp(path.join(tmpdir(), "kortyx-history-test-"));
  try {
    await cp(migrationsDir, folder, { recursive: true });
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

describe("Drizzle history guards", () => {
  it("reads native SQL hashes from the frozen legacy journal", async () => {
    const history = await readHistory(migrationsDir);
    expect(
      history.migrations
        .slice(0, 6)
        .map(({ hash, folderMillis }) => ({ hash, when: folderMillis })),
    ).toEqual(LEGACY_MIGRATIONS.map(({ hash, when }) => ({ hash, when })));
    validateAppliedHistory(
      history.migrations.map(({ hash, folderMillis }) => ({
        hash,
        created_at: folderMillis,
      })),
      history,
    );
  });

  it.each([
    "orphan",
    "reorder",
    "backdate",
    "path",
  ] as const)("rejects %s on disk", async (kind) => {
    await withCopy(async (folder) => {
      const journalPath = path.join(folder, "meta/_journal.json");
      const journal = JSON.parse(await readFile(journalPath, "utf8"));
      if (kind === "orphan")
        await writeFile(path.join(folder, "9999_orphan.sql"), "SELECT 1;");
      if (kind === "reorder") journal.entries.reverse();
      if (kind === "backdate")
        journal.entries[2].when = journal.entries[1].when;
      if (kind === "path") journal.entries[0].tag = "../unsafe";
      await writeFile(journalPath, JSON.stringify(journal));
      await expect(readHistory(folder)).rejects.toThrow();
    });
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

  it("compatibility preparation and CI reject edited released SQL", async () => {
    await withCopy(async (folder) => {
      await writeFile(
        path.join(folder, "0000_initial_telemetry.sql"),
        "SELECT 1;",
      );
      const history = await readHistory(folder);
      expect(() => validateLegacyHistory(history)).toThrow(
        "Released migration",
      );
    });
  });

  it("rejects changed checksums, gaps, unknown newer history and changed timestamps", async () => {
    const history = await readHistory(migrationsDir);
    const rows = history.migrations.map(({ hash, folderMillis }) => ({
      hash,
      created_at: String(folderMillis),
    }));
    const first = rows[0];
    if (!first) throw new Error("Missing baseline fixture.");
    expect(() =>
      validateAppliedHistory([{ ...first, hash: "edited" }], history),
    ).toThrow("differs");
    expect(() => validateAppliedHistory(rows.slice(1), history)).toThrow(
      "differs",
    );
    expect(() => validateAppliedHistory([...rows, first], history)).toThrow(
      "differs",
    );
    expect(() =>
      validateAppliedHistory([{ ...first, created_at: "1" }], history),
    ).toThrow("differs");
  });

  it("native generation from the adopted snapshot is a no-op", async () => {
    await withCopy(async (folder) => {
      const before = await readFile(
        path.join(folder, "meta/_journal.json"),
        "utf8",
      );
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
      expect(
        await readFile(path.join(folder, "meta/_journal.json"), "utf8"),
      ).toBe(before);
    });
  }, 30000);

  it("CI protects released future SQL, snapshots and journal entries", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "kortyx-history-git-"));
    const folder = path.join(repoRoot, "packages/telemetry-db/drizzle");
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
    try {
      await mkdir(path.dirname(folder), { recursive: true });
      await cp(migrationsDir, folder, { recursive: true });
      const journalPath = path.join(folder, "meta/_journal.json");
      const journal = JSON.parse(await readFile(journalPath, "utf8"));
      const releasedIndex = journal.entries.length;
      const releasedTag = `${String(releasedIndex).padStart(4, "0")}_released`;
      const nextTag = `${String(releasedIndex + 1).padStart(4, "0")}_new`;
      const releasedWhen = journal.entries.at(-1).when + 1;
      journal.entries.push({
        idx: releasedIndex,
        version: "7",
        when: releasedWhen,
        tag: releasedTag,
        breakpoints: true,
      });
      await writeFile(journalPath, JSON.stringify(journal));
      const futureFile = path.join(folder, `${releasedTag}.sql`);
      await writeFile(futureFile, "SELECT 1;");
      git("init", "--initial-branch=codex/migration-fixture");
      git("add", ".");
      git(
        "-c",
        "user.name=Migration Test",
        "-c",
        "user.email=migration@example.test",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--no-verify",
        "-m",
        "fix: test migration fixture",
      );
      const base = git("rev-parse", "HEAD").trim();
      await checkReleasedHistory(repoRoot, base);
      journal.entries.push({
        idx: releasedIndex + 1,
        version: "7",
        when: releasedWhen + 1,
        tag: nextTag,
        breakpoints: true,
      });
      await writeFile(journalPath, JSON.stringify(journal));
      await writeFile(path.join(folder, `${nextTag}.sql`), "SELECT 2;");
      await checkReleasedHistory(repoRoot, base);
      await writeFile(futureFile, "SELECT 42;");
      await expect(checkReleasedHistory(repoRoot, base)).rejects.toThrow(
        "edited",
      );
      await writeFile(futureFile, "SELECT 1;");
      const snapshot = path.join(folder, "meta/0005_snapshot.json");
      const originalSnapshot = await readFile(snapshot, "utf8");
      await writeFile(snapshot, "{}");
      await expect(checkReleasedHistory(repoRoot, base)).rejects.toThrow(
        "edited",
      );
      await writeFile(snapshot, originalSnapshot);
      journal.entries[releasedIndex].when += 100;
      await writeFile(journalPath, JSON.stringify(journal));
      await expect(checkReleasedHistory(repoRoot, base)).rejects.toThrow(
        "journal entries",
      );
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
