import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { validateLegacyHistory } from "./legacy-migrations";
import { readHistory } from "./migration-history";

const migrationPath = "packages/telemetry-db/drizzle";

/** CI must protect history before a fresh test database could mask an edit. */
export async function checkReleasedHistory(repoRoot: string, baseRef: string) {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  const base = git(
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${baseRef}^{commit}`,
  ).trim();
  const files = git("ls-tree", "-r", "--name-only", base, "--", migrationPath)
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const file of files) {
    if (!file.endsWith(".sql") && !file.endsWith(".json")) continue;
    const old = git("show", `${base}:${file}`);
    let current: string;
    try {
      current = await readFile(path.join(repoRoot, file), "utf8");
    } catch {
      throw new Error(`Released migration artifact ${file} was removed.`);
    }
    if (file.endsWith("/_journal.json")) {
      const before = JSON.parse(old);
      const after = JSON.parse(current);
      if (
        before.version !== after.version ||
        before.dialect !== after.dialect ||
        !isDeepStrictEqual(
          before.entries,
          after.entries.slice(0, before.entries.length),
        )
      ) {
        throw new Error(
          "Released Drizzle journal entries were changed. Append migrations instead.",
        );
      }
    } else if (old !== current) {
      throw new Error(
        `Released migration artifact ${file} was edited. Append migrations instead.`,
      );
    }
  }
}

async function main() {
  const folder = path.resolve(process.cwd(), "drizzle");
  validateLegacyHistory(await readHistory(folder));
  const base = process.env.TURBO_SCM_BASE;
  if (base)
    await checkReleasedHistory(path.resolve(process.cwd(), "../.."), base);
  console.log(
    "Migration history is valid and released artifacts are unchanged.",
  );
}

// Keep the checker importable by regression tests without invoking the CLI.
if (path.basename(process.argv[1] ?? "") === "check-migrations.ts") {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
