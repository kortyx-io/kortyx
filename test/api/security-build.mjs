import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const api = fileURLToPath(new URL("../../apps/api/", import.meta.url));
const id = randomUUID();
const profileName = `tsconfig.api-test-${id}.json`;
const profile = join(api, profileName);
const invalid = join(api, `tsconfig.api-test-invalid-${id}.json`);
const paths = JSON.parse(readFileSync(join(api, "tsconfig.json"), "utf8"))
  .compilerOptions.paths;
const compilerOptions = {
  // Public API's rootDir is app-local. Private profiles must include their external TS implementations.
  rootDir: "../..",
  tsBuildInfoFile: `./${profileName.replace(/\.json$/, ".tsbuildinfo")}`,
  paths: {
    ...paths,
    "@api/auth": ["../../test/api/auth-fixture.ts"],
    "@api/authorization": ["../../test/api/authorization-fixture.ts"],
    "@api/tenant-database": ["../../test/api/database-fixture.ts"],
  },
};
writeFileSync(
  profile,
  JSON.stringify({ extends: "./tsconfig.json", compilerOptions }),
  { flag: "wx" },
);
writeFileSync(
  invalid,
  JSON.stringify({
    extends: "./tsconfig.json",
    compilerOptions: {
      ...compilerOptions,
      tsBuildInfoFile: `./${invalid
        .split("/")
        .at(-1)
        .replace(/\.json$/, ".tsbuildinfo")}`,
      paths: {
        ...compilerOptions.paths,
        "@api/auth": ["../../test/api/auth-invalid.ts"],
      },
    },
  }),
  { flag: "wx" },
);
process.on("exit", () => {
  for (const path of [profile, invalid]) {
    rmSync(path, { force: true });
    rmSync(path.replace(/\.json$/, ".tsbuildinfo"), { force: true });
  }
});

const env = {
  ...process.env,
  KORTYX_API_TSCONFIG: profileName,
  KORTYX_API_DEPLOYMENT: "cloud",
  KORTYX_API_KEY_PEPPER: "fixture-must-not-fallback",
  API_HOST: "127.0.0.1",
  NODE_ENV: "production",
  KORTYX_EVAL_TARGETS: "[]",
  KORTYX_EVAL_TARGETS_FILE: "",
  KORTYX_EVAL_JUDGE_MODEL: "",
  KORTYX_EVAL_JUDGE_API_KEY: "",
};
const exited = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
async function run(command, args = [], selected = profileName) {
  const child = spawn("pnpm", [command, ...args], {
    cwd: api,
    env: { ...env, KORTYX_API_TSCONFIG: selected },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const { code } = await exited(child);
  return { code, output };
}
const rejected = await run("type-check", [], invalid);
assert.notEqual(
  rejected.code,
  0,
  "Invalid selected adapter must fail type-checking",
);
assert.match(rejected.output, /auth-invalid\.ts/);
assert.match(rejected.output, /number/);
const valid = await run("type-check");
assert.equal(valid.code, 0, valid.output);
console.log(
  "Selected app-local API profile checks all three adapters and rejects invalid authentication.",
);
if (process.argv.includes("--typecheck-only")) process.exit(0);

// The real entry point uses PostgreSQL LISTEN and readiness. No tables or migrations
// are needed here, and the Cloud bootstrap must never start the unscoped OSS worker.
const database = process.env.KORTYX_TEST_POSTGRES_URL;
assert.ok(
  database,
  "Set KORTYX_TEST_POSTGRES_URL to a disposable loopback test PostgreSQL database.",
);
const parsed = new URL(database);
assert.ok(
  ["127.0.0.1", "localhost"].includes(parsed.hostname) &&
    /^\/kortyx_[a-z_]*test$/.test(parsed.pathname),
  "Only named loopback Kortyx test databases are allowed.",
);
env.DATABASE_URL = database;

const built = await run("build");
assert.equal(built.code, 0, built.output);

async function smoke(mode) {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const invocation =
    mode === "production" ? ["dist/index.js"] : ["scripts/run.mjs", "dev"];
  const child = spawn(process.execPath, invocation, {
    cwd: api,
    env: { ...env, API_PORT: String(port) },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const stopped = exited(child);
  let finished = false;
  void stopped.then(() => {
    finished = true;
  });
  try {
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline && !finished) {
      try {
        ready =
          (await fetch(`${url}/ready`, { signal: AbortSignal.timeout(1000) }))
            .status === 200;
      } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `${mode} entry point failed to become ready: ${output}`);
    const call = (path, token, method = "GET", body) =>
      fetch(`${url}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-organization-id": "attacker",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(5000),
      });
    await Promise.all(
      ["alice", "bob"].map(async (actor) => {
        const response = await call("/v1/studio/context", `fixture-${actor}`);
        assert.equal(response.status, 200, await response.clone().text());
        assert.deepEqual(await response.json(), {
          organization: { name: `fixture-org-${actor}` },
          project: { name: `fixture-project-${actor}` },
          environments: ["fixture-environment"],
          apiKey: null,
          api: {
            status: "ok",
            service: "kortyx-api",
            version: process.env.KORTYX_STUDIO_RELEASE ?? "development",
          },
        });
      }),
    );
    assert.notEqual((await call("/v1/studio/context", "invalid")).status, 200);
    assert.equal(
      (await call("/v1/studio/runs/run/review", "fixture-alice", "DELETE"))
        .status,
      403,
    );
    assert.equal(
      (await call("/v1/studio/evals/runs", "fixture-alice", "POST", {})).status,
      403,
    );
    assert.equal(
      (
        await call("/v1/telemetry/events:batch", "fixture-alice", "POST", {
          events: [],
        })
      ).status,
      403,
    );
    console.log(
      `${mode}: real API entry point uses selected auth, policy and request-local database handles; denied writes and human SDK ingestion pass.`,
    );
  } finally {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }, 5000);
    timer.unref();
    await stopped;
    clearTimeout(timer);
  }
}
await smoke("production");
await smoke("development");
// Keep the worktree's output in the default OSS state, not with a test adapter selected.
const restored = await run("build", [], "tsconfig.json");
assert.equal(restored.code, 0, restored.output);
// An ordinary OSS artifact must refuse Cloud mode before attempting a database connection.
const unconfigured = spawn(process.execPath, ["dist/index.js"], {
  cwd: api,
  env: {
    ...env,
    DATABASE_URL: "postgres://fixture@127.0.0.1:1/kortyx_api_extension_test",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let startupError = "";
unconfigured.stdout.on("data", (data) => {
  startupError += data;
});
unconfigured.stderr.on("data", (data) => {
  startupError += data;
});
const timeout = setTimeout(() => unconfigured.kill("SIGKILL"), 5000);
const refused = await exited(unconfigured);
clearTimeout(timeout);
assert.notEqual(refused.code, 0);
assert.match(startupError, /Cloud API requires an authentication adapter/);
console.log(
  "API extension build/dev smoke passed; restored default OSS output.",
);
