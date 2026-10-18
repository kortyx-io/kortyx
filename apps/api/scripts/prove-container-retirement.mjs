import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";

// Local-only proof. Requires an already-built candidate and isolated npm install.
process.env.KORTYX_USAGE_TELEMETRY_DISABLED = "1";
const root = resolve(import.meta.dirname, "../../..");
const cache = resolve(root, "node_modules/.cache/kortyx-retirement-release");
const metadata = JSON.parse(
  await readFile(resolve(cache, "registry-metadata.json")),
);
assert.equal(metadata.release.version, "0.22.0");
const require = createRequire(
  resolve(root, "packages/telemetry-db/package.json"),
);
const {
  createTelemetryDbClient,
  ensureLocalDevelopmentProject,
  createTelemetryApiKey,
  claimEvalRuns,
} = require("./dist/index.js");
const { getEvalSuiteRevision } = createRequire(
  resolve(root, "packages/agent/package.json"),
)("./dist/index.js");
const exec = promisify(execFile);
const docker = async (...args) =>
  (await exec("docker", args, { maxBuffer: 8 * 1024 * 1024 })).stdout.trim();
const endpoint = await docker(
  "context",
  "inspect",
  "--format",
  "{{.Endpoints.docker.Host}}",
);
assert.ok(
  endpoint.startsWith("unix://") &&
    (!process.env.DOCKER_HOST || process.env.DOCKER_HOST.startsWith("unix://")),
  "Only a local Docker context is allowed",
);
const candidateRef = process.argv[2];
assert.ok(candidateRef, "Pass the locally built candidate image reference");
const candidate = JSON.parse(await docker("image", "inspect", candidateRef))[0];
const platform = `${candidate.Os}/${candidate.Architecture}`;
const released = JSON.parse(
  await docker("image", "inspect", metadata.release.api),
)[0];
assert.ok(released.RepoDigests.includes(metadata.release.api));
if (released.Architecture !== candidate.Architecture)
  await docker("pull", "--platform", platform, metadata.release.api);
assert.deepEqual(candidate.Config.Entrypoint, ["kortyx-api-entrypoint"]);
assert.deepEqual(candidate.Config.Cmd, ["node", "apps/api/dist/index.js"]);
const scope = randomUUID();
const network = `kortyx-retirement-${scope}`;
const containers = [];
const projects = [];
let networkCreated = false;
let client;
const serviceKey = "disposable-container-retirement-service-key";
const pepper = "disposable-container-retirement-pepper";
let apiKey;
let project;
const observations = [];
const publicReport = {
  date: new Date().toISOString(),
  released: metadata,
  candidate: {
    image: candidate.Id,
    architecture: candidate.Architecture,
    entrypoint: candidate.Config.Entrypoint,
    command: candidate.Config.Cmd,
  },
  observations,
};
const label = `kortyx.container-retirement-proof=${scope}`;
const inspect = async (name) => JSON.parse(await docker("inspect", name))[0];
async function owned(name) {
  assert.equal(
    (await inspect(name)).Config.Labels["kortyx.container-retirement-proof"],
    scope,
  );
}
async function waitFor(read, expected, message, timeout = 15_000) {
  const until = Date.now() + timeout;
  let value;
  let failure;
  while (Date.now() < until) {
    try {
      value = await read();
    } catch (error) {
      value = undefined;
      failure = error;
    }
    if (typeof expected === "function" ? expected(value) : value === expected)
      return value;
    await pause(100);
  }
  throw new Error(`${message}: last value ${JSON.stringify(value)}`, {
    cause: failure,
  });
}
async function publishedPort(name, internal) {
  const binding = await docker("port", name, `${internal}/tcp`);
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  return `http://${binding}`;
}
async function run(name, image, args = [], env = {}, port) {
  const full = `kortyx-${name}-${scope}`;
  containers.push(full);
  await docker(
    "run",
    "--detach",
    "--name",
    full,
    "--label",
    label,
    "--network",
    network,
    ...(image === "postgres:17-alpine" ? [] : ["--platform", platform]),
    ...(image === "postgres:17-alpine"
      ? ["--tmpfs", "/var/lib/postgresql/data:rw,nosuid,size=512m"]
      : []),
    ...(port ? ["--publish", `127.0.0.1::${port}`] : []),
    ...Object.entries(env).flatMap(([key, value]) => [
      "--env",
      `${key}=${value}`,
    ]),
    image,
    ...args,
  );
  return {
    name: full,
    base: port ? await publishedPort(full, port) : undefined,
  };
}
async function signal(instance, value) {
  await owned(instance.name);
  await docker("kill", `--signal=${value}`, instance.name);
}
async function stop(instance, seconds = 5) {
  await owned(instance.name);
  if ((await inspect(instance.name)).State.Running)
    await docker("stop", "--time", String(seconds), instance.name);
  return (await inspect(instance.name)).State.ExitCode;
}
async function logs(instance) {
  return docker("logs", "--tail", "100", instance.name);
}
async function identity(instance) {
  const code = String.raw`const fs=require('node:fs'); const s=fs.readFileSync('/proc/1/status','utf8'); console.log(JSON.stringify({name:s.match(/^Name:\s+(.*)$/m)[1],uid:Number(s.match(/^Uid:\s+(\d+)/m)[1]),command:fs.readFileSync('/proc/1/cmdline','utf8').split('\0').filter(Boolean),node:process.version,architecture:process.arch}));`;
  const result = JSON.parse(
    await docker("exec", instance.name, "node", "-e", code),
  );
  assert.equal(result.uid, 1000);
  if (result.command[0] !== "node") {
    assert.equal(result.command[0], "/run/rosetta/rosetta");
    assert.match(result.command[1], /\/node$/);
    assert.equal(result.architecture, "x64");
    result.emulated = "Rosetta";
  }
  return result;
}
async function control(consumer, operation = "state", body) {
  const response = await fetch(`${consumer.base}/_fixture/${operation}`, {
    signal: AbortSignal.timeout(3000),
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function consumer(mode) {
  const name = `kortyx-consumer-${mode}-${scope}`;
  containers.push(name);
  await docker(
    "run",
    "--detach",
    "--name",
    name,
    "--label",
    label,
    "--network",
    network,
    "--publish",
    "127.0.0.1::6401",
    "--env",
    `FIXTURE_SDK=${mode}`,
    "--env",
    "KORTYX_USAGE_TELEMETRY_DISABLED=1",
    "--mount",
    `type=bind,source=${resolve(root, "apps/api/test/fixtures/retirement-consumer.mjs")},target=/fixture/consumer.mjs,readonly`,
    "--mount",
    `type=bind,source=${cache},target=/published,readonly`,
    "--platform",
    platform,
    candidate.Id,
    "node",
    "/fixture/consumer.mjs",
  );
  const instance = { name, base: await publishedPort(name, 6401) };
  const state = await waitFor(
    () => control(instance),
    (value) => value?.pid === 1,
    "Consumer startup",
  );
  assert.equal(state.uid, 1000);
  assert.equal(state.drainingSupported, mode !== "published");
  observations.push({
    check: `${mode} consumer`,
    ...state,
    identity: await identity(instance),
  });
  return instance;
}
let database;
const targetFor = (consumer) => ({
  ...project,
  id: randomUUID(),
  name: "Disposable container proof",
  environment: "development",
  url: `http://${consumer.name}:6401/evals`,
  serviceKey,
  allowInsecureHttp: true,
});
const environment = (target, embedded = false) => ({
  DATABASE_URL: database,
  NODE_ENV: "production",
  API_HOST: "0.0.0.0",
  API_PORT: "6400",
  KORTYX_API_KEY_PEPPER: pepper,
  KORTYX_API_DEPLOYMENT: "self-hosted",
  KORTYX_API_EVAL_WORKER_ENABLED: String(embedded),
  KORTYX_EVAL_MAX_CONCURRENT_EVALUATIONS: "1",
  KORTYX_EVAL_TARGETS: JSON.stringify([target]),
  KORTYX_USAGE_TELEMETRY_DISABLED: "1",
});
async function launchApi(name, target, image = candidate.Id, embedded = false) {
  const instance = await run(
    name,
    image,
    [],
    environment(target, embedded),
    6400,
  );
  await waitFor(
    () =>
      fetch(`${instance.base}/ready`, {
        signal: AbortSignal.timeout(3000),
      }).then((r) => r.status),
    200,
    `${name} readiness`,
  );
  observations.push({
    check: `${name} process identity`,
    ...(await identity(instance)),
  });
  return instance;
}
async function api(instance, path, body) {
  return fetch(`${instance.base}${path}`, {
    signal: AbortSignal.timeout(10_000),
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function submit(instance, target, selected, suiteId = "held") {
  const discovery = await fetch(`${selected.base}/evals`, {
    headers: { authorization: `Bearer ${serviceKey}` },
  });
  assert.equal(discovery.status, 200);
  const manifest = await discovery.json();
  const suite = manifest.suites.find((value) => value.id === suiteId);
  const response = await api(instance, "/v1/studio/evals/evaluations", {
    targetId: target.id,
    selection: "selected",
    judge: "app",
    concurrency: 1,
    runTimeoutMs: 90_000,
    idempotencyKey: randomUUID(),
    suites: [{ suiteId, suiteRevision: getEvalSuiteRevision(suite) }],
  });
  assert.equal(response.status, 202, await response.clone().text());
  return (await response.json()).id;
}
async function status(id) {
  return (
    await client.sql`SELECT status FROM eval_runs WHERE evaluation_id=${id}::uuid`
  )[0]?.status;
}
async function composeWorker(target, grace) {
  const projectName = `kortyx-retirement-${grace}-${scope}`;
  const name = `kortyx-worker-${grace}-${scope}`;
  const file = resolve(cache, `${projectName}.json`);
  await writeFile(
    file,
    JSON.stringify({
      services: {
        subject: {
          image: candidate.Id,
          platform,
          container_name: name,
          labels: { "kortyx.container-retirement-proof": scope },
          command: ["node", "apps/api/dist/eval-worker.js"],
          environment: environment(target),
          stop_grace_period: `${grace}s`,
          networks: ["proof"],
        },
      },
      networks: { proof: { external: true, name: network } },
    }),
  );
  const args = ["compose", "--project-name", projectName, "-f", file];
  projects.push(args);
  containers.push(name);
  await docker(...args, "up", "--detach");
  await waitFor(
    async () =>
      (await logs({ name })).includes("standalone evaluation worker started"),
    true,
    "Compose worker startup",
  );
  assert.equal((await inspect(name)).Config.StopTimeout, grace);
  return { name, args };
}
try {
  await mkdir(cache, { recursive: true });
  await docker("network", "create", "--label", label, network);
  networkCreated = true;
  const pg = await run(
    "postgres",
    "postgres:17-alpine",
    [],
    {
      POSTGRES_PASSWORD: "disposable-fixture",
      POSTGRES_DB: "kortyx_retirement_test",
    },
    5432,
  );
  database = `postgres://postgres:disposable-fixture@${pg.name}:5432/kortyx_retirement_test`;
  await waitFor(
    () =>
      docker(
        "exec",
        pg.name,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
      ),
    (value) => value?.includes("accepting connections"),
    "PostgreSQL readiness",
  );
  const binding = new URL(pg.base).host;
  const localUrl = `postgres://postgres:disposable-fixture@${binding}/kortyx_retirement_test`;
  await exec(
    process.execPath,
    [
      resolve(root, "packages/telemetry-db/node_modules/tsx/dist/cli.mjs"),
      "src/scripts/migrate.ts",
    ],
    {
      cwd: resolve(root, "packages/telemetry-db"),
      env: { ...process.env, DATABASE_URL: localUrl },
    },
  );
  client = createTelemetryDbClient(localUrl);
  project = await ensureLocalDevelopmentProject(client.db);
  apiKey = (
    await createTelemetryApiKey(client.db, {
      ...project,
      name: "Disposable container proof",
      mode: "test",
      scopes: ["studio:read", "studio:write", "eval:run"],
      pepper,
    })
  ).apiKey;
  const current = await consumer("candidate");
  const published = await consumer("published");

  // Exact released API and genuine published SDK; no legacy/new owner overlap.
  for (const selected of [published, current]) {
    const target = targetFor(selected);
    const web = await launchApi(
      `released-${selected === published ? "published" : "candidate"}`,
      target,
      metadata.release.api,
      true,
    );
    const id = await submit(web, target, selected);
    await waitFor(() => status(id), "passed", "Released API evaluation");
    assert.deepEqual((await control(selected)).calls, ["held-0", "held-1"]);
    assert.equal(await stop(web), 0);
    observations.push({
      check: "released API compatibility",
      consumer:
        selected === published
          ? "published 0.32.0/0.39.0/0.25.0"
          : "local candidate",
      status: "passed",
    });
    await control(selected, "reset", {});
  }
  console.log(
    "PASS: released API 0.22.0 with published and candidate consumers",
  );

  // Old images have neither preparation nor the new non-aborting TERM behavior.
  for (const oldSignal of ["SIGTERM", "SIGUSR2"]) {
    await control(published, "hold", { message: "held-0" });
    const target = targetFor(published);
    const old = await launchApi(
      `released-${oldSignal.toLowerCase()}`,
      target,
      metadata.release.api,
      true,
    );
    const id = await submit(old, target, published);
    await waitFor(
      () => control(published).then((s) => s.calls.length),
      1,
      "Released active attempt",
    );
    await signal(old, oldSignal);
    if (oldSignal === "SIGUSR2") {
      // Linux PID 1 can ignore an unhandled signal instead of terminating.
      assert.equal((await inspect(old.name)).State.Running, true);
      const queued = await submit(old, target, published, "queued");
      await waitFor(
        () => status(queued),
        "passed",
        "Unsupported signal does not fence old claims",
      );
      assert.ok(!(await logs(old)).includes("state: draining"));
      await signal(old, "SIGTERM");
    }
    await waitFor(
      async () => (await logs(old)).includes("Received SIGTERM"),
      true,
      "Released TERM acknowledgement",
    );
    assert.notEqual(await status(id), "passed");
    await control(published, "release", {});
    await waitFor(
      () => inspect(old.name).then((s) => s.State.Running),
      false,
      "Released signal exit",
    );
    const exit = (await inspect(old.name)).State.ExitCode;
    assert.equal(exit, 0);
    assert.notEqual(await status(id), "passed");
    await waitFor(
      () => control(published).then((s) => s.cleaned.length),
      oldSignal === "SIGTERM" ? 1 : 3,
      "Released consumer cleanup",
    );
    await client.sql`UPDATE eval_runs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE evaluation_id=${id}::uuid AND status='running'`;
    await claimEvalRuns(client.db, randomUUID(), [target], {
      maxConcurrentEvaluations: 1,
    });
    assert.equal(await status(id), "error");
    assert.deepEqual(
      (await control(published)).calls,
      oldSignal === "SIGTERM" ? ["held-0"] : ["held-0", "queued-0", "queued-1"],
    );
    observations.push({
      check: `released 0.22.0 ${oldSignal} during execution`,
      exitCode: exit,
      status: "not graceful eval retirement; error, no replay",
    });
    await control(published, "reset", {});
  }
  console.log(
    "PASS: released SIGTERM does not finish the suite; SIGUSR2 does not fence claims",
  );

  // Candidate embedded API: preparation retains auth/HTTP and queued work.
  const target = targetFor(published);
  const embedded = await launchApi(
    "candidate-embedded",
    target,
    candidate.Id,
    true,
  );
  await control(published, "hold", { message: "held-0" });
  const first = await submit(embedded, target, published);
  await waitFor(
    () => control(published).then((s) => s.calls.length),
    1,
    "Held attempt",
  );
  await signal(embedded, "SIGUSR2");
  await signal(embedded, "SIGUSR2");
  await waitFor(
    async () => (await logs(embedded)).includes("state: draining"),
    true,
    "Preparation signal delivery",
  );
  const queued = await submit(embedded, target, published, "queued");
  assert.equal((await fetch(`${embedded.base}/ready`)).status, 200);
  assert.equal(
    (await fetch(`${embedded.base}/v1/studio/evals/evaluations/${first}`))
      .status,
    401,
  );
  assert.equal(
    (await api(embedded, `/v1/studio/evals/evaluations/${first}`)).status,
    200,
  );
  await control(published, "release", {});
  await waitFor(
    () => status(first),
    "passed",
    "Drained evaluation persistence",
  );
  await waitFor(
    async () => (await logs(embedded)).includes("state: drained"),
    true,
    "Drained confirmation",
  );
  assert.equal(await status(queued), "queued");
  assert.equal(await stop(embedded), 0);
  const replacement = await run(
    "replacement",
    candidate.Id,
    ["node", "apps/api/dist/eval-worker.js"],
    environment(target),
  );
  await waitFor(
    () => status(queued),
    "passed",
    "Queued work after replacement",
  );
  assert.equal(await stop(replacement), 0);
  assert.deepEqual((await control(published)).calls, [
    "held-0",
    "held-1",
    "queued-0",
    "queued-1",
  ]);
  observations.push({
    check:
      "candidate SIGUSR2/TERM and standalone replacement with published consumer",
    status: "passed",
  });
  console.log(
    "PASS: Docker PID 1 receives SIGUSR2/TERM; queue survives replacement",
  );

  // Use actual Compose stop_grace_period, including the supplied default 30s.
  for (const grace of process.argv.includes("--skip-grace") ? [] : [45, 30]) {
    await control(current, "reset", {});
    const target = targetFor(current);
    const web = await launchApi(`web-${grace}`, target);
    await control(current, "hold", { message: "held-0" });
    const id = await submit(web, target, current);
    const worker = await composeWorker(target, grace);
    const ownerIdentity = await identity(worker);
    await waitFor(
      () => control(current).then((s) => s.calls.length),
      1,
      "Active Compose attempt",
    );
    const started = Date.now();
    const stopped = docker(...worker.args, "stop", "subject");
    await waitFor(
      async () => (await logs(worker)).includes("state: draining"),
      true,
      "Compose SIGTERM delivery",
    );
    if (grace === 45) {
      await pause(31_000);
      assert.equal((await inspect(worker.name)).State.Running, true);
      assert.equal(await status(id), "running");
      assert.equal(
        (await api(web, `/v1/studio/evals/evaluations/${id}`)).status,
        200,
      );
      await control(current, "release", {});
      await stopped;
      const state = (await inspect(worker.name)).State;
      assert.equal(state.ExitCode, 0);
      assert.equal(state.OOMKilled, false);
      assert.equal(await status(id), "passed");
      assert.deepEqual((await control(current)).cleaned, ["held-0", "held-1"]);
      assert.ok((await logs(worker)).includes("state: drained"));
      observations.push({
        check: "Compose 45s grace",
        elapsedMs: Date.now() - started,
        identity: ownerIdentity,
        exitCode: state.ExitCode,
        status: "passed beyond 30s",
      });
      console.log(
        "PASS: Compose 45s grace preserves active execution beyond 30s and exits 0",
      );
    } else {
      await stopped;
      const state = (await inspect(worker.name)).State;
      assert.equal(state.ExitCode, 137);
      assert.equal(state.OOMKilled, false);
      assert.ok(!(await logs(worker)).includes("state: drained"));
      assert.ok(Date.now() - started >= 29_000);
      await control(current, "release", {});
      await waitFor(
        () => control(current).then((s) => s.cleaned.length),
        1,
        "Killed owner's consumer cleanup",
      );
      await client.sql`UPDATE eval_runs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE evaluation_id=${id}::uuid AND status='running'`;
      await claimEvalRuns(client.db, randomUUID(), [target], {
        maxConcurrentEvaluations: 1,
      });
      assert.equal(await status(id), "error");
      assert.deepEqual((await control(current)).calls, ["held-0"]);
      observations.push({
        check: "Compose default 30s grace",
        elapsedMs: Date.now() - started,
        exitCode: state.ExitCode,
        status:
          "forced kill; uncertain execution reconciled as error; no replay",
      });
      console.log(
        "PASS: default Compose 30s grace demonstrates forced kill, Error and no replay",
      );
    }
    assert.equal(await stop(web), 0);
  }
  await control(current, "reset", {});
  const abortTarget = targetFor(current);
  const web = await launchApi("abort-web", abortTarget);
  await control(current, "hold", { message: "held-0" });
  await submit(web, abortTarget, current);
  const abortOwner = await run(
    "abort-worker",
    candidate.Id,
    ["node", "apps/api/dist/eval-worker.js"],
    environment(abortTarget),
  );
  await waitFor(
    () => control(current).then((s) => s.calls.length),
    1,
    "Abort attempt",
  );
  await signal(abortOwner, "SIGINT");
  await waitFor(
    () => inspect(abortOwner.name).then((s) => s.State.Running),
    false,
    "SIGINT exit",
  );
  assert.ok((await logs(abortOwner)).includes("state: aborted"));
  assert.ok(!(await logs(abortOwner)).includes("state: drained"));
  await control(current, "release", {});
  await stop(web);
  observations.push({
    check: "Docker SIGINT",
    status: "explicit abort; no drained confirmation",
  });
  const sourceFiles = [
    "apps/api/src/lifecycle.ts",
    "apps/api/src/eval-worker.ts",
    "apps/api/src/evals/worker.ts",
    "apps/api/src/shutdown.ts",
    "apps/api/docker/entrypoint.sh",
    "packages/agent/src/evals/route-executions.ts",
    "packages/runtime/src/framework/eval-executions.ts",
    "packages/telemetry-db/src/repositories/evals.ts",
  ];
  const sourceCheck = await run("source-check", candidate.Id, [
    "node",
    "-e",
    `const fs=require('node:fs'),crypto=require('node:crypto');const files=${JSON.stringify(sourceFiles)};console.log(JSON.stringify(Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))));`,
  ]);
  await waitFor(
    () => inspect(sourceCheck.name).then((s) => s.State.Running),
    false,
    "Source hash process",
  );
  const hashes = JSON.parse(await logs(sourceCheck));
  for (const file of sourceFiles)
    assert.equal(
      hashes[file],
      createHash("sha256")
        .update(await readFile(resolve(root, file)))
        .digest("hex"),
    );
  publicReport.candidate.sourceHashes = hashes;
  publicReport.npmLockSha256 = createHash("sha256")
    .update(await readFile(resolve(cache, "package-lock.json")))
    .digest("hex");
  const receipt = `container-verification-${candidate.Architecture}${process.argv.includes("--skip-grace") ? "-no-grace" : ""}.json`;
  await writeFile(
    resolve(cache, receipt),
    `${JSON.stringify(publicReport, null, 2)}\n`,
  );
  console.log("PASS: exact-release and container proof complete");
} finally {
  await client?.close();
  for (const name of containers.reverse()) {
    const existing = await inspect(name).catch(() => undefined);
    if (!existing) continue;
    await owned(name);
    await docker("rm", "--force", "--volumes", name);
  }
  for (const args of projects) await docker(...args, "down");
  if (networkCreated) {
    const details = JSON.parse(await docker("network", "inspect", network))[0];
    assert.equal(details.Labels["kortyx.container-retirement-proof"], scope);
    await docker("network", "rm", network);
  }
}
