import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "../../..");
const scope = randomUUID();
const name = `kortyx-oss-retirement-${scope}`;
const docker = async (...args) =>
  (await exec("docker", args, { maxBuffer: 1024 * 1024 })).stdout.trim();
const endpoint = await docker(
  "context",
  "inspect",
  "--format",
  "{{.Endpoints.docker.Host}}",
);
if (
  !endpoint.startsWith("unix://") ||
  (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix://"))
)
  throw new Error("Proof requires a local Unix-socket Docker context");
let started = false;
async function cleanup() {
  if (!started) return;
  const label = await docker(
    "inspect",
    "--format",
    '{{index .Config.Labels "kortyx.retirement-proof"}}',
    name,
  );
  if (label !== scope)
    throw new Error("Refusing to stop a different container");
  await docker("stop", "--timeout", "5", name);
}
try {
  await docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--label",
    `kortyx.retirement-proof=${scope}`,
    "--tmpfs",
    "/var/lib/postgresql/data:rw,nosuid,size=512m",
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_PASSWORD=disposable-fixture",
    "--env",
    "POSTGRES_DB=kortyx_retirement_test",
    "postgres:17-alpine",
  );
  started = true;
  let healthy = false;
  for (let count = 0; count < 80; count++) {
    if (
      await docker(
        "exec",
        name,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        "-d",
        "kortyx_retirement_test",
      ).then(
        () => true,
        () => false,
      )
    ) {
      healthy = true;
      break;
    }
    await pause(250);
  }
  if (!healthy) throw new Error("Disposable database did not become ready");
  const binding = await docker("port", name, "5432/tcp");
  if (!/^127\.0\.0\.1:\d+$/.test(binding))
    throw new Error("Unexpected database binding");
  const url = `postgres://postgres:disposable-fixture@${binding}/kortyx_retirement_test`;
  await exec(
    process.execPath,
    [
      resolve(root, "packages/telemetry-db/node_modules/tsx/dist/cli.mjs"),
      "src/scripts/migrate.ts",
    ],
    {
      cwd: resolve(root, "packages/telemetry-db"),
      env: { ...process.env, DATABASE_URL: url },
      maxBuffer: 1024 * 1024,
    },
  );
  const result = await exec(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "test/eval-retirement.integration.test.ts",
      ...process.argv.filter((arg) => arg.startsWith("--testNamePattern=")),
    ],
    {
      cwd: resolve(root, "apps/api"),
      env: { ...process.env, TEST_RETIREMENT_DATABASE_URL: url },
      maxBuffer: 1024 * 1024,
    },
  ).catch((error) => {
    process.stdout.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw new Error("Local retirement proof failed");
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  const executionStore = await exec(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "--config",
      "vitest.postgres.config.ts",
      ...(process.argv.includes("--regressions")
        ? ["--coverage"]
        : ["test/eval-executions.postgres.integration.ts"]),
    ],
    {
      cwd: resolve(root, "packages/runtime"),
      env: { ...process.env, KORTYX_TEST_POSTGRES_URL: url },
      maxBuffer: 1024 * 1024,
    },
  ).catch((error) => {
    process.stdout.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw new Error("Local consumer execution-store proof failed");
  });
  process.stdout.write(executionStore.stdout);
  process.stderr.write(executionStore.stderr);
  if (process.argv.includes("--regressions")) {
    for (const test of [
      "evals.integration.test.ts",
      "evaluations.integration.test.ts",
    ]) {
      await docker(
        "exec",
        name,
        "createdb",
        "--username",
        "postgres",
        "kortyx_evals_test",
      );
      const regressionUrl = url.replace(
        "/kortyx_retirement_test",
        "/kortyx_evals_test",
      );
      const regression = await exec(
        "pnpm",
        ["exec", "vitest", "run", `test/${test}`],
        {
          cwd: resolve(root, "apps/api"),
          env: { ...process.env, TEST_EVAL_DATABASE_URL: regressionUrl },
          maxBuffer: 1024 * 1024,
        },
      ).catch((error) => {
        process.stdout.write(error.stdout ?? "");
        process.stderr.write(error.stderr ?? "");
        throw new Error(`Local ${test} regressions failed`);
      });
      process.stdout.write(regression.stdout);
      process.stderr.write(regression.stderr);
      await docker(
        "exec",
        name,
        "dropdb",
        "--username",
        "postgres",
        "kortyx_evals_test",
      );
    }
    const ha = await exec(
      "pnpm",
      ["exec", "vitest", "run", "test/ha.integration.test.ts"],
      {
        cwd: resolve(root, "apps/api"),
        env: { ...process.env, DATABASE_URL: url },
        maxBuffer: 1024 * 1024,
      },
    );
    process.stdout.write(ha.stdout);
    process.stderr.write(ha.stderr);
    const receipts = await exec(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "test/eval-execution-receipts.integration.test.ts",
      ],
      {
        cwd: resolve(root, "packages/telemetry-db"),
        env: { ...process.env, DATABASE_URL: url },
        maxBuffer: 1024 * 1024,
      },
    );
    process.stdout.write(receipts.stdout);
    process.stderr.write(receipts.stderr);
  }
} finally {
  await cleanup();
}
