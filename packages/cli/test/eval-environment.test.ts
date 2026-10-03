import * as fs from "node:fs/promises";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { loadEvalEnvironment } from "../src/evals/environment";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    lstat: vi.fn(actual.lstat),
    readFile: vi.fn(actual.readFile),
  };
});

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

it("reports metadata and read failures without exposing credential contents", async () => {
  const { app, write } = await fixture();
  const file = await write(
    "apps/agent/private.env",
    "PASSWORD=synthetic-secret\n",
  );
  vi.mocked(fs.lstat).mockRejectedValueOnce({ code: "EACCES" });
  await expect(loadEvalEnvironment(app, undefined, {})).rejects.toThrow(
    /Cannot read eval configuration/,
  );
  vi.mocked(fs.lstat).mockRejectedValueOnce({ code: "EACCES" });
  await expect(loadEvalEnvironment(app, [file], {})).rejects.toThrow(
    /unavailable/,
  );
  vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("synthetic-secret"));
  await expect(loadEvalEnvironment(app, [file], {})).rejects.toThrow(
    /^Cannot read eval configuration:/,
  );
});

it("loads workspace defaults before app overrides without requiring a profile", async () => {
  const { app, write } = await fixture();
  await write(".env", "AUTH_DOMAIN=workspace\nMODEL=base\n");
  await write(".env.local", "MODEL=root-local\n");
  await write("apps/agent/.env", "MODEL=app\n");
  expect(await loadEvalEnvironment(app, undefined, {})).toEqual({
    AUTH_DOMAIN: "workspace",
    MODEL: "app",
  });
});

it("does not load defaults above an unbounded project", async () => {
  const { app, root } = await fixture();
  await rm(join(root, ".git"), { recursive: true });
  expect(await loadEvalEnvironment(app, undefined, {})).toEqual({});
});

it("rejects a private file owned by another account", async () => {
  const { app, write } = await fixture();
  await write(".env.evals.json", JSON.stringify({ envFiles: ["private.env"] }));
  const uid = process.getuid?.() ?? 0;
  vi.spyOn(process, "getuid").mockReturnValue(uid + 1);
  await expect(loadEvalEnvironment(app, undefined, {})).rejects.toThrow(
    /owner-only regular file/,
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kortyx-eval-env-"));
  directories.push(root);
  await mkdir(join(root, ".git"));
  const app = join(root, "apps", "agent");
  await mkdir(app, { recursive: true });
  const write = async (name: string, content: string, mode = 0o600) => {
    const file = join(root, name);
    await writeFile(file, content, { mode });
    return file;
  };
  return { root, app, write };
}

it("loads a workspace profile from a nested app, overlays in order, and preserves shell values and literal passwords", async () => {
  const { root, app, write } = await fixture();
  await write(
    "dev.env",
    "AUTH_DOMAIN=development\nDB_HOST=shared\nMODEL=base\n",
  );
  await write(
    "eval.env",
    "DB_HOST=localhost\nMODEL=eval\nPASSWORD='literal$credential'\nMULTILINE=\"first\nsecond\"\n",
  );
  await write(
    ".env.evals.json",
    JSON.stringify({ envFiles: ["dev.env", "eval.env"] }),
  );
  const shell = { MODEL: "shell", EMPTY: "" };
  expect(await loadEvalEnvironment(app, undefined, shell)).toEqual({
    AUTH_DOMAIN: "development",
    DB_HOST: "localhost",
    MODEL: "shell",
    PASSWORD: "literal$credential",
    MULTILINE: "first\nsecond",
    EMPTY: "",
  });
  expect(shell).toEqual({ MODEL: "shell", EMPTY: "" });
  expect(await loadEvalEnvironment(root, [], {})).toHaveProperty(
    "MODEL",
    "eval",
  );
});

it("explicit files replace automatic configuration, resolve from the invocation directory and work for ordinary dotenv permissions", async () => {
  const { app, write } = await fixture();
  await write(".env.evals.json", "invalid profile must be bypassed");
  await write("apps/agent/first.env", "MODEL=first\nOTHER=kept\n", 0o644);
  await write("apps/agent/second.env", "MODEL=second\n", 0o644);
  expect(
    await loadEvalEnvironment(app, ["first.env", "second.env"], {}),
  ).toEqual({ MODEL: "second", OTHER: "kept" });
});

it("loads ordinary .env and .env.local without a profile and tolerates absent defaults", async () => {
  const { app, write } = await fixture();
  expect(await loadEvalEnvironment(app, undefined, {})).toEqual({});
  await write("apps/agent/.env", "VALUE=base\nOTHER=base\n", 0o644);
  await write("apps/agent/.env.local", "VALUE=local\n", 0o644);
  expect(await loadEvalEnvironment(app, undefined, {})).toEqual({
    VALUE: "local",
    OTHER: "base",
  });
});

it("uses the nearest profile and stops discovery at a git worktree or pnpm workspace boundary", async () => {
  const { app, write } = await fixture();
  await write(".env.evals.json", JSON.stringify({ envFiles: ["missing.env"] }));
  await write("apps/agent/local.env", "VALUE=app\n");
  await write(
    "apps/agent/.env.evals.json",
    JSON.stringify({ envFiles: ["local.env"] }),
  );
  expect(await loadEvalEnvironment(app, undefined, {})).toEqual({
    VALUE: "app",
  });
  await rm(join(app, ".env.evals.json"));
  await write("apps/agent/.git", "gitdir: /synthetic/worktree\n");
  expect(await loadEvalEnvironment(app, undefined, {})).toEqual({});
  await rm(join(app, ".git"));
  await write("apps/agent/pnpm-workspace.yaml", "packages: []\n");
  expect(await loadEvalEnvironment(app, undefined, {})).toEqual({});
});

it("fails for an explicitly missing file without applying a partial environment", async () => {
  const { app, write } = await fixture();
  await write("apps/agent/first.env", "VALUE=should-not-leak\n");
  const shell = { VALUE: "original" };
  await expect(
    loadEvalEnvironment(app, ["first.env", "missing.env"], shell),
  ).rejects.toThrow(/unavailable/);
  expect(shell).toEqual({ VALUE: "original" });
});

it.each([
  "not-json-secret",
  "null",
  "[]",
  "{}",
  '{"envFiles":[]}',
  '{"envFiles":[1]}',
  '{"envFiles":[""]}',
  '{"envFiles":["file"],"unexpected":"secret"}',
])("rejects malformed profiles without exposing their contents: %s", async (profile) => {
  const { app, write } = await fixture();
  await write(".env.evals.json", profile);
  await expect(loadEvalEnvironment(app, undefined, {})).rejects.toThrow(
    /Invalid eval environment profile/,
  );
  await expect(loadEvalEnvironment(app, undefined, {})).rejects.not.toThrow(
    /secret/,
  );
});

it("rejects symlinks/directories and insecure permissions for remembered private files", async () => {
  const { root, app, write } = await fixture();
  const file = await write("credentials.env", "PASSWORD=synthetic\n", 0o644);
  const profile = await write(
    ".env.evals.json",
    JSON.stringify({ envFiles: ["credentials.env"] }),
  );
  await expect(loadEvalEnvironment(app, undefined, {})).rejects.toThrow(
    /owner-only regular file/,
  );
  await chmod(file, 0o600);
  await chmod(profile, 0o644);
  await expect(loadEvalEnvironment(app, undefined, {})).rejects.toThrow(
    /owner-only regular file/,
  );
  await chmod(profile, 0o600);
  await symlink(file, join(root, "linked.env"));
  await write(".env.evals.json", JSON.stringify({ envFiles: ["linked.env"] }));
  await expect(loadEvalEnvironment(app, undefined, {})).rejects.toThrow(
    /regular file/,
  );
  await expect(loadEvalEnvironment(app, ["."], {})).rejects.toThrow(
    /regular file/,
  );
});
