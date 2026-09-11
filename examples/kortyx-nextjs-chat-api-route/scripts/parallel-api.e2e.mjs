import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { connect, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(app, "package.json"));
const next = require.resolve("next/dist/bin/next");
const distDir = `.next/parallel-e2e-${process.pid}`;
const tsconfig = `.next/parallel-e2e-${process.pid}.json`;
const children = new Set();

async function freePort() {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const port = server.address().port;
  await new Promise((accept) => server.close(accept));
  return port;
}

function start(command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: app,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const running = { child, logs: "", error: undefined, exited: undefined };
  running.exited = new Promise((accept) => {
    child.once("exit", accept);
    child.once("error", (error) => {
      running.error = error;
      accept();
    });
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      running.logs = (running.logs + chunk).slice(-12000);
    });
  children.add(running);
  return running;
}

async function stop(running) {
  if (!running) return;
  const kill = (signal) => {
    try {
      process.kill(
        process.platform === "win32" ? running.child.pid : -running.child.pid,
        signal,
      );
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  if (running.child.exitCode === null && !running.error) {
    kill("SIGTERM");
    await Promise.race([
      running.exited,
      delay(5000, undefined, { ref: false }),
    ]);
    if (running.child.exitCode === null && running.child.signalCode === null) {
      kill("SIGKILL");
      await running.exited;
    }
  }
  children.delete(running);
}

async function waitUntil(check, processState, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (processState.error || processState.child.exitCode !== null)
      throw new Error(
        `${label} exited: ${processState.error?.message ?? processState.logs}`,
      );
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await delay(200);
  }
  throw new Error(`${label} did not become ready.\n${processState.logs}`);
}

const redisPort = await freePort();
const httpPort = await freePort();
const endpoint = `http://127.0.0.1:${httpPort}/api/parallel`;
let server;
const input = { companyId: "Acme", roleId: "Engineer" };
const checks = [];
const passed = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};

async function post(body, expectedStatus = 200) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    expectedStatus,
    result.error ?? "Unexpected HTTP status",
  );
  return result;
}

function overlap(result) {
  assert.equal(result.status, "completed");
  const { company, role, joinedAt } = result.data;
  assert.equal(company.subjectId, input.companyId);
  assert.equal(role.subjectId, input.roleId);
  assert.ok(
    Math.max(company.startedAt, role.startedAt) <
      Math.min(company.finishedAt, role.finishedAt),
    "Both children must start before either finishes",
  );
  assert.ok(joinedAt >= Math.max(company.finishedAt, role.finishedAt));
}

async function startApp() {
  server = start(
    process.execPath,
    [
      next,
      "dev",
      "--turbopack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(httpPort),
    ],
    {
      ...process.env,
      KORTYX_REDIS_URL: `redis://127.0.0.1:${redisPort}`,
      KORTYX_NEXTJS_DIST_DIR: distDir,
      KORTYX_NEXTJS_TSCONFIG: tsconfig,
      KORTYX_TELEMETRY_API_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  );
  return waitUntil(
    async () => {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok ? response.json() : null;
    },
    server,
    "Next.js",
  );
}

try {
  await mkdir(resolve(app, ".next"), { recursive: true });
  await writeFile(
    resolve(app, tsconfig),
    JSON.stringify({
      extends: "../tsconfig.json",
      include: ["../next-env.d.ts", "../src/**/*.ts", "../src/**/*.tsx"],
      exclude: ["../node_modules", "../dist"],
    }),
  );
  const redis = start("redis-server", [
    "--bind",
    "127.0.0.1",
    "--port",
    String(redisPort),
    "--save",
    "",
    "--appendonly",
    "no",
  ]);
  await waitUntil(
    () =>
      new Promise((accept) => {
        const socket = connect(redisPort, "127.0.0.1");
        socket.once("connect", () => {
          socket.destroy();
          accept(true);
        });
        socket.once("error", () => {
          socket.destroy();
          accept(false);
        });
      }),
    redis,
    "Redis",
  );

  const originalWorker = await startApp();
  const basic = await post({ action: "execute", input });
  overlap(basic);
  passed(
    "HTTP execute: concurrent child starts, ordered results and parent join",
  );

  const waiting = await post({
    action: "execute",
    input: { ...input, requireApproval: true },
  });
  assert.equal(waiting.status, "suspended");
  assert.equal(waiting.interrupt.input.question, "Approve Acme?");
  passed("HTTP execute: child approval suspends the parent");

  await stop(server);
  const restartedWorker = await startApp();
  assert.notEqual(restartedWorker.workerId, originalWorker.workerId);
  const next = await post({
    action: "resume",
    resume: waiting.resume,
    response: { type: "select", ids: ["approve"] },
  });
  assert.equal(next.status, "suspended");
  assert.equal(next.interrupt.input.question, "Approve Engineer?");
  const resumed = await post({
    action: "resume",
    resume: next.resume,
    response: { type: "select", ids: ["decline"] },
  });
  overlap(resumed);
  assert.equal(resumed.data.company.approved, true);
  assert.equal(resumed.data.role.approved, false);
  assert.equal(resumed.data.company.workerId, originalWorker.workerId);
  assert.equal(resumed.data.role.workerId, originalWorker.workerId);
  assert.equal(resumed.data.workerId, restartedWorker.workerId);
  passed(
    "HTTP resume after process restart: Redis restores both children and routes distinct answers",
  );
  passed(
    "Completed research nodes retain their original worker identity across restart",
  );

  await post(
    {
      action: "resume",
      resume: waiting.resume,
      response: { type: "select", ids: ["approve"] },
    },
    400,
  );
  passed("Consumed resume handle is rejected over HTTP");

  const limited = await post({ action: "execute", input, limited: true });
  assert.equal(limited.status, "suspended");
  assert.equal(limited.reason, "limit_reached");
  assert.deepEqual(limited.limit, {
    limit: "maxChildInvocations",
    maximum: 1,
    consumed: 1,
  });
  const continued = await post({
    action: "resume",
    resume: limited.resume,
    response: { type: "select", ids: ["continue"] },
  });
  assert.equal(continued.status, "completed");
  assert.equal(continued.data.company.subjectId, input.companyId);
  assert.equal(continued.data.role.subjectId, input.roleId);
  passed(
    "Shared child allowance pauses and explicit Continue completes the same run",
  );

  const failed = await post({
    action: "execute",
    input: { ...input, failRole: true },
  });
  assert.equal(failed.status, "failed");
  await post({ action: "execute", input: { companyId: "" } }, 400);
  passed("Child failure and invalid input produce the expected HTTP outcomes");

  console.log(
    JSON.stringify(
      {
        passed: checks.length,
        transport: "HTTP",
        example: "kortyx-nextjs-chat-api-route",
        processRestart: true,
        persistence: "Redis",
        liveModelCalls: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  if (server) console.error(server.logs);
  process.exitCode = 1;
} finally {
  for (const running of [...children].reverse()) await stop(running);
  await rm(resolve(app, distDir), { recursive: true, force: true });
  await rm(resolve(app, tsconfig), { force: true });
}
