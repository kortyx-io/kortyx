import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { setTimeout as pause } from "node:timers/promises";
import {
  createEvalRouteHandler,
  createEvals,
  type EvalSuite,
  getEvalSuiteRevision,
} from "@kortyx/agent";
import {
  createPostgresEvalExecutionStore,
  type EvalExecutionStore,
} from "@kortyx/runtime";
import { StudioTablePreferenceResponseSchema } from "@kortyx/telemetry-contracts";
import {
  appendEvalProgress,
  claimEvalRuns,
  createTelemetryApiKey,
  createTelemetryDbClient,
  ensureLocalDevelopmentProject,
  finishEvalRun,
  heartbeatEvalRun,
} from "@kortyx/telemetry-db";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const url = process.env.TEST_RETIREMENT_DATABASE_URL;
describe.skipIf(!url)(
  "OSS retirement using built processes, PostgreSQL and the real SDK",
  () => {
    const parsed = url ? new URL(url) : undefined;
    if (
      parsed &&
      (parsed.hostname !== "127.0.0.1" ||
        parsed.pathname !== "/kortyx_retirement_test")
    )
      throw new Error("Use only the disposable loopback retirement database");
    const db = url ? createTelemetryDbClient(url) : undefined;
    const children: {
      child: ChildProcess;
      exited: Promise<number | string>;
      logs: () => string;
    }[] = [];
    const serviceKey = "disposable-retirement-fixture-key-32-characters";
    const pepper = "disposable-retirement-fixture-pepper";
    const calls: string[] = [];
    const gates = new Map<
      string,
      { promise: Promise<void>; release(): void }
    >();
    let target: {
      id: string;
      name: string;
      organizationId: string;
      projectId: string;
      environment: string;
      url: string;
      serviceKey: string;
      allowInsecureHttp: boolean;
    };
    let key: string;
    let server: ReturnType<typeof createServer>;
    let consumer: ReturnType<typeof createEvalRouteHandler>;
    let makeConsumer: (
      store?: EvalExecutionStore,
      baseline?: boolean,
    ) => ReturnType<typeof createEvalRouteHandler>;
    const consumers: ReturnType<typeof createEvalRouteHandler>[] = [];
    const executionStores: ReturnType<
      typeof createPostgresEvalExecutionStore
    >[] = [];
    const acceptedRequests: {
      id: string;
      body: string;
      headers: Record<string, string>;
    }[] = [];
    const baselinePath = resolve(
      "../../packages/agent/node_modules/.cache/kortyx-retirement-baseline/dist/index.js",
    );
    let active = 0;
    let peak = 0;
    let dropPostResponse = false;
    let consumerRetirement: Promise<void> | undefined;
    const suites: EvalSuite[] = ["held", "queued", "cancelled"].map((id) => ({
      id,
      cases: [0, 1].map((index) => ({
        id: `${id}-${index}`,
        steps: [
          { message: `${id}-${index}`, expect: { type: "answer" as const } },
        ],
      })),
    }));
    function hold(message: string) {
      let release!: () => void;
      const promise = new Promise<void>((done) => {
        release = done;
      });
      const gate = { promise, release };
      gates.set(message, gate);
      return gate;
    }
    const port = async () => {
      const listener = createServer();
      await new Promise<void>((done) => listener.listen(0, "127.0.0.1", done));
      const address = listener.address();
      if (!address || typeof address === "string")
        throw new Error("Missing port");
      await new Promise<void>((done) => listener.close(() => done()));
      return address.port;
    };
    async function launch(
      kind: "api" | "worker",
      embedded = false,
      extra: NodeJS.ProcessEnv = {},
    ) {
      const listenPort = await port();
      // Never inherit provider credentials, Cloud profiles or external target files.
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: "production",
        DATABASE_URL: url!,
        API_HOST: "127.0.0.1",
        API_PORT: String(listenPort),
        ...(kind === "api" ? { KORTYX_API_KEY_PEPPER: pepper } : {}),
        KORTYX_API_DEPLOYMENT: "self-hosted",
        KORTYX_API_EVAL_WORKER_ENABLED: String(embedded),
        KORTYX_EVAL_MAX_CONCURRENT_EVALUATIONS: "1",
        KORTYX_EVAL_TARGETS: JSON.stringify([target]),
        KORTYX_USAGE_TELEMETRY_DISABLED: "1",
        ...extra,
      };
      const child = spawn(
        process.execPath,
        [resolve(`dist/${kind === "api" ? "index" : "eval-worker"}.js`)],
        { env, stdio: ["ignore", "pipe", "pipe"] },
      );
      let logs = "";
      child.stdout?.on("data", (chunk) => {
        logs = `${logs}${chunk}`.slice(-16_384);
      });
      child.stderr?.on("data", (chunk) => {
        logs = `${logs}${chunk}`.slice(-16_384);
      });
      const exited = new Promise<number | string>((done, fail) => {
        child.on("error", fail);
        child.on("exit", (code, signal) => done(code ?? signal ?? "unknown"));
      });
      const instance = {
        child,
        exited,
        logs: () => logs,
        base: `http://127.0.0.1:${listenPort}`,
      };
      children.push(instance);
      return instance;
    }
    async function ready(instance: Awaited<ReturnType<typeof launch>>) {
      await expect
        .poll(
          async () => {
            if (instance.child.exitCode !== null)
              throw new Error(`Fixture process exited: ${instance.logs()}`);
            return fetch(`${instance.base}/ready`).then(
              (r) => r.status,
              () => 0,
            );
          },
          { timeout: 10_000 },
        )
        .toBe(200);
    }
    async function apiRequest(base: string, path: string, body?: unknown) {
      return fetch(`${base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function submit(
      base: string,
      suiteId: string,
      runTimeoutMs = 10_000,
    ) {
      const suite = suites.find((entry) => entry.id === suiteId)!;
      const response = await apiRequest(base, "/v1/studio/evals/evaluations", {
        targetId: target.id,
        selection: "selected",
        judge: "app",
        concurrency: 1,
        runTimeoutMs,
        idempotencyKey: randomUUID(),
        suites: [{ suiteId, suiteRevision: getEvalSuiteRevision(suite) }],
      });
      expect(response.status, await response.clone().text()).toBe(202);
      return ((await response.json()) as { id: string }).id;
    }
    async function rows(id: string) {
      return db!
        .sql`SELECT id,status,lease_owner,lease_expires_at,started_at,ended_at,result FROM eval_runs WHERE evaluation_id=${id}::uuid ORDER BY id`;
    }
    async function status(id: string) {
      return (await rows(id))[0]?.status;
    }
    beforeAll(async () => {
      const scope = await ensureLocalDevelopmentProject(db!.db);
      key = (
        await createTelemetryApiKey(db!.db, {
          ...scope,
          name: "Disposable retirement test",
          mode: "test",
          scopes: [
            "studio:read",
            "studio:write",
            "eval:run",
            "telemetry:write",
            "prompt:serve",
          ],
          pepper,
        })
      ).apiKey;
      const evals = createEvals({
        agent: {} as never,
        suites,
        execute: async ({ command, signal }) => {
          const message =
            command.type === "message" ? command.message : "resume";
          calls.push(message);
          active++;
          peak = Math.max(peak, active);
          try {
            const gate = gates.get(message);
            if (gate) {
              await Promise.race([
                gate.promise,
                new Promise<void>((done) => {
                  if (signal.aborted) done();
                  else
                    signal.addEventListener("abort", () => done(), {
                      once: true,
                    });
                }),
              ]);
            }
            return {
              observation: { type: "answer", text: "ok", structured: [] },
            };
          } finally {
            active--;
          }
        },
        judge: {
          id: "local",
          version: "1",
          location: "app",
          grade: () => ({
            passed: true,
            reason: "Deterministic fixture",
            evidence: [],
          }),
        },
      });
      makeConsumer = (store, baseline = false) => {
        const create = baseline
          ? (
              createRequire(import.meta.url)(baselinePath) as {
                createEvalRouteHandler: typeof createEvalRouteHandler;
              }
            ).createEvalRouteHandler
          : createEvalRouteHandler;
        const handler = create({
          evals,
          serviceKey,
          maxActiveRuns: 4,
          ...(store ? { executionStore: store } : {}),
        });
        consumers.push(handler);
        return handler;
      };
      server = createServer(async (request, response) => {
        try {
          let body = "";
          for await (const chunk of request) body += chunk;
          if (request.method === "POST")
            acceptedRequests.push({
              id: String(request.headers["idempotency-key"] ?? ""),
              body,
              headers: Object.fromEntries(
                Object.entries(request.headers)
                  .filter(([, value]) => typeof value === "string")
                  .map(([name, value]) => [name, String(value)]),
              ),
            });
          const result = await consumer(
            new Request(new URL(request.url ?? "/evals", "http://127.0.0.1"), {
              method: request.method ?? "GET",
              headers: Object.fromEntries(
                Object.entries(request.headers)
                  .filter(([, value]) => value !== undefined)
                  .map(([name, value]) => [
                    name,
                    Array.isArray(value) ? value.join(",") : String(value),
                  ]),
              ),
              ...(body ? { body } : {}),
            }),
          );
          if (dropPostResponse && request.method === "POST" && result.ok) {
            dropPostResponse = false;
            consumerRetirement = consumer.drain();
            void consumerRetirement.catch(() => {});
            // Admission committed, but the worker receives no acknowledgement.
            await result.body?.cancel();
            response.destroy();
            return;
          }
          response.writeHead(result.status, Object.fromEntries(result.headers));
          if (result.body) Readable.fromWeb(result.body).pipe(response);
          else response.end();
        } catch {
          response.writeHead(500);
          response.end();
        }
      });
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No consumer listener");
      target = {
        ...scope,
        id: randomUUID(),
        name: "Local retirement fixture",
        environment: "development",
        url: `http://127.0.0.1:${address.port}/evals`,
        serviceKey,
        allowInsecureHttp: true,
      };
    });
    beforeEach(() => {
      calls.length = 0;
      peak = 0;
      acceptedRequests.length = 0;
      dropPostResponse = false;
      consumerRetirement = undefined;
      consumer = makeConsumer();
    });
    afterEach(async () => {
      for (const gate of gates.values()) gate.release();
      gates.clear();
      for (const instance of children.splice(0)) {
        if (
          instance.child.exitCode === null &&
          instance.child.signalCode === null
        )
          instance.child.kill("SIGINT");
        await Promise.race([instance.exited, pause(2000)]);
        if (
          instance.child.exitCode === null &&
          instance.child.signalCode === null
        ) {
          instance.child.kill("SIGKILL");
          await instance.exited;
        }
      }
      await Promise.all(consumers.splice(0).map((handler) => handler.close()));
      await Promise.all(
        executionStores.splice(0).map((store) => store.close()),
      );
      // Isolate later cases even if an assertion left a disposable lease active.
      await db!
        .sql`UPDATE eval_runs SET status='error', lease_expires_at=NULL, error='Disposable fixture cleanup' WHERE target_id=${target.id} AND status IN ('running','queued')`;
    });
    afterAll(async () => {
      server?.closeAllConnections();
      if (server) await new Promise<void>((done) => server.close(() => done()));
      await db?.close();
    });

    it("keeps singleton HTTP available during preparation, persists queued work and cancellation, then replaces without overlap", async () => {
      const gate = hold("held-0");
      const old = await launch("api", true);
      await ready(old);
      const a = await submit(old.base, "held");
      await expect.poll(() => calls.includes("held-0")).toBe(true);
      old.child.kill("SIGUSR2");
      await expect
        .poll(() => old.logs().includes("state: draining"))
        .toBe(true);
      old.child.kill("SIGUSR2");
      // Enough execution time for two real HTTP observations on a loaded host.
      // Explicitly exceed this budget while still queued below.
      const executionBudget = 2000;
      const b = await submit(old.base, "queued", executionBudget);
      const queuedSince = Date.now();
      const stream = await apiRequest(
        old.base,
        "/v1/studio/changes?resources=evals",
      );
      expect(stream.status).toBe(200);
      const reader = stream.body!.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain(
        "event: ready",
      );
      expect(
        (
          await apiRequest(old.base, "/v1/prompts/resolve", {
            schemaVersion: 1,
            environment: "development",
            ids: [],
          })
        ).status,
      ).toBe(200);
      // New preference writes remain usable while only evaluation claims retire.
      const preferencesPath = "/v1/studio/table-preferences/evaluations";
      const preferences = StudioTablePreferenceResponseSchema.parse(
        await (await apiRequest(old.base, preferencesPath)).json(),
      );
      if (!preferences.scope)
        throw new Error("Missing project preference scope");
      const query = { sort: "startedAt", dir: "desc", pageSize: 25 };
      const saved = await apiRequest(old.base, preferencesPath, {
        scopeKey: preferences.scope.cacheKey,
        expectedRevision: preferences.preferences.revision,
        operation: { kind: "defaults", patch: { query } },
      });
      expect(saved.status).toBe(200);
      const persisted = StudioTablePreferenceResponseSchema.parse(
        await (await apiRequest(old.base, preferencesPath)).json(),
      );
      expect(persisted.preferences.revision).toBe(
        preferences.preferences.revision + 1,
      );
      expect(persisted.preferences.defaults.query).toEqual(query);
      const eventId = randomUUID();
      const events = {
        events: [
          {
            schemaVersion: 1,
            eventId,
            occurredAt: new Date().toISOString(),
            environment: "development",
            service: { name: "retirement-fixture" },
            correlation: { runId: randomUUID(), workflowId: "fixture" },
            type: "span.started",
            payload: {},
          },
        ],
      };
      const ingested = await apiRequest(
        old.base,
        "/v1/telemetry/events:batch",
        events,
      );
      expect(ingested.status).toBe(200);
      expect(await ingested.json()).toMatchObject({
        inserted: 1,
        duplicates: 0,
      });
      expect(
        await db!
          .sql`SELECT event_id FROM telemetry_events WHERE event_id=${eventId}`,
      ).toHaveLength(1);
      const retried = await apiRequest(
        old.base,
        "/v1/telemetry/events:batch",
        events,
      );
      expect(await retried.json()).toMatchObject({
        inserted: 0,
        duplicates: 1,
      });
      const c = await submit(old.base, "cancelled");
      expect(new TextDecoder().decode((await reader.read()).value)).toContain(
        "event: change",
      );
      await reader.cancel();
      expect(
        (
          await apiRequest(
            old.base,
            `/v1/studio/evals/evaluations/${c}/cancel`,
            {},
          )
        ).status,
      ).toBe(200);
      const before = (await rows(a))[0]!;
      await expect
        .poll(
          async () =>
            (await rows(a))[0]!.lease_expires_at > before.lease_expires_at,
          { timeout: 5000 },
        )
        .toBe(true);
      expect(await status(b)).toBe("queued");
      await expect
        .poll(() => Date.now() - queuedSince)
        .toBeGreaterThan(executionBudget);
      expect(await status(c)).toBe("cancelled");
      expect((await fetch(`${old.base}/ready`)).status).toBe(200);
      expect(
        (await apiRequest(old.base, `/v1/studio/evals/evaluations/${a}`))
          .status,
      ).toBe(200);
      expect(
        (await fetch(`${old.base}/v1/studio/evals/evaluations/${a}`)).status,
      ).toBe(401);
      gate.release();
      await expect.poll(() => status(a)).toBe("passed");
      await expect.poll(() => old.logs().includes("state: drained")).toBe(true);
      old.child.kill("SIGTERM");
      expect(await old.exited).toBe(0);
      const web = await launch("api");
      await ready(web);
      expect(await status(b)).toBe("queued");
      const replacement = await launch("worker");
      await ready(replacement);
      await expect.poll(() => status(b)).toBe("passed");
      expect(calls).toEqual(["held-0", "held-1", "queued-0", "queued-1"]);
      expect(
        (await apiRequest(web.base, `/v1/studio/evals/evaluations/${b}`))
          .status,
      ).toBe(200);
      expect(
        (await fetch(`${replacement.base}/v1/studio/evals/evaluations`)).status,
      ).toBe(404);
    }, 25_000);

    it("bounds simultaneous execution during overlap and retains a draining owner's lease through repeated SIGTERM", async () => {
      const web = await launch("api");
      await ready(web);
      const gate = hold("held-0");
      const a = await submit(web.base, "held");
      const b = await submit(web.base, "queued");
      const old = await launch("worker");
      await ready(old);
      await expect.poll(() => calls.includes("held-0")).toBe(true);
      const replacement = await launch("worker");
      await ready(replacement);
      const before = (await rows(a))[0]!;
      old.child.kill("SIGTERM");
      old.child.kill("SIGTERM");
      await expect
        .poll(() => old.logs().includes("state: draining"))
        .toBe(true);
      await expect
        .poll(
          async () =>
            (await rows(a))[0]!.lease_expires_at > before.lease_expires_at,
          { timeout: 5000 },
        )
        .toBe(true);
      expect((await rows(a))[0]!.lease_owner).toBe(before.lease_owner);
      expect(await status(b)).toBe("queued");
      expect(old.child.exitCode).toBeNull();
      gate.release();
      expect(await old.exited).toBe(0);
      await expect.poll(() => status(b)).toBe("passed");
      expect(await status(a)).toBe("passed");
      expect(peak).toBe(1);
      expect(calls).toEqual(["held-0", "held-1", "queued-0", "queued-1"]);
    }, 25_000);

    it("does not retire a serving owner when a candidate fails startup", async () => {
      const web = await launch("api");
      await ready(web);
      const gate = hold("held-0");
      const a = await submit(web.base, "held");
      const old = await launch("worker");
      await ready(old);
      await expect.poll(() => calls.includes("held-0")).toBe(true);
      const candidate = await launch("worker", false, {
        KORTYX_EVAL_TARGETS: "[]",
      });
      expect(await candidate.exited).toBe(1);
      expect((await fetch(`${old.base}/ready`)).status).toBe(200);
      expect(old.logs()).not.toContain("state: draining");
      const b = await submit(web.base, "queued");
      gate.release();
      await expect.poll(() => status(a)).toBe("passed");
      await expect.poll(() => status(b)).toBe("passed");
      expect(calls).toHaveLength(4);
    }, 20_000);

    it("honors active cancellation while admission is drained and HTTP remains available", async () => {
      hold("held-0");
      const web = await launch("api");
      await ready(web);
      const old = await launch("worker");
      await ready(old);
      const a = await submit(web.base, "held");
      await expect.poll(() => calls.includes("held-0")).toBe(true);
      old.child.kill("SIGUSR2");
      await expect
        .poll(async () => (await fetch(`${old.base}/live`)).json())
        .toMatchObject({ state: "draining" });
      expect((await fetch(`${old.base}/ready`)).status).toBe(503);
      expect(
        (
          await apiRequest(
            web.base,
            `/v1/studio/evals/evaluations/${a}/cancel`,
            {},
          )
        ).status,
      ).toBe(200);
      await expect.poll(() => status(a), { timeout: 5000 }).toBe("cancelled");
      await expect
        .poll(async () => (await fetch(`${old.base}/live`)).json())
        .toMatchObject({ state: "drained" });
      expect(calls).toEqual(["held-0"]);
      old.child.kill("SIGTERM");
      expect(await old.exited).toBe(0);
    }, 20_000);

    it("reports a crashed owner as uncertain without replaying its side effects", async () => {
      const gate = hold("held-0");
      const web = await launch("api");
      await ready(web);
      const a = await submit(web.base, "held");
      const old = await launch("worker");
      await ready(old);
      await expect.poll(() => calls.includes("held-0")).toBe(true);
      old.child.kill("SIGKILL");
      expect(await old.exited).toBe("SIGKILL");
      await db!
        .sql`UPDATE eval_runs SET lease_expires_at=now()-interval '1 second' WHERE evaluation_id=${a}::uuid AND status='running'`;
      const b = await submit(web.base, "queued");
      const replacement = await launch("worker");
      await ready(replacement);
      await expect.poll(() => status(a)).toBe("error");
      await expect.poll(() => status(b)).toBe("passed");
      expect(calls.filter((message) => message === "held-0")).toHaveLength(1);
      expect(calls).not.toContain("held-1");
      gate.release();
    }, 20_000);

    it.each([
      "heartbeat",
      "progress",
      "finish",
    ] as const)("fences %s when a row-lock wait outlasts the lease", async (operation) => {
      const web = await launch("api");
      await ready(web);
      const evaluation = await submit(web.base, "queued");
      const owner = randomUUID();
      const [run] = await claimEvalRuns(db!.db, owner, [target], {
        maxConcurrentEvaluations: 1,
      });
      expect(run!.evaluationId).toBe(evaluation);
      const acquired = hold("sql-acquired");
      const release = hold("sql-release");
      const blocker = db!.sql.begin(async (tx) => {
        await tx`UPDATE eval_runs SET lease_expires_at=clock_timestamp()+interval '500 milliseconds' WHERE id=${run!.id}::uuid`;
        acquired.release();
        await release.promise;
      });
      await acquired.promise;
      const pending = (
        operation === "heartbeat"
          ? heartbeatEvalRun(db!.db, run!.id, owner)
          : operation === "progress"
            ? appendEvalProgress(db!.db, run!.id, owner, {
                type: "case-started",
                caseId: "queued-0",
                repetition: 1,
                sessionId: "local-lock-fixture",
              })
            : finishEvalRun(db!.db, run!.id, owner, { cancelled: true })
      ).then(
        (value) => ({ value, error: undefined }),
        (error: unknown) => ({ value: undefined, error }),
      );
      try {
        await expect
          .poll(async () => {
            const [waiting] = await db!
              .sql`SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;
            return Number(waiting!.count);
          })
          .toBeGreaterThan(0);
        await pause(650);
      } finally {
        release.release();
        await blocker;
      }
      const result = await pending;
      if (operation === "heartbeat") expect(result.value).toBeUndefined();
      else expect(result.error).toBeInstanceOf(Error);
      expect(await status(evaluation)).toBe("running");
      await claimEvalRuns(db!.db, randomUUID(), [target], {
        maxConcurrentEvaluations: 1,
      });
      expect(await status(evaluation)).toBe("error");
    }, 15_000);

    it("serializes racing claims and counts sibling suites as one group across owners", async () => {
      const web = await launch("api");
      await ready(web);
      const a = await submit(web.base, "held");
      const b = await submit(web.base, "queued");
      await db!
        .sql`INSERT INTO eval_runs(organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,request,status,requested_by,evaluation_id)
        SELECT organization_id,project_id,environment,target_id,target_name,'sibling',suite_revision,suite,request,'queued',requested_by,evaluation_id FROM eval_runs WHERE evaluation_id=${a}::uuid LIMIT 1`;
      const owners = Array.from({ length: 8 }, () => randomUUID());
      const claims = await Promise.all(
        owners.map((owner) =>
          claimEvalRuns(db!.db, owner, [target], {
            maxConcurrentEvaluations: 1,
          }),
        ),
      );
      expect(claims.filter((runs) => runs.length)).toHaveLength(1);
      expect(claims.flat()).toHaveLength(2);
      expect(await status(b)).toBe("queued");
      const owner = (await rows(a))[0]!.lease_owner as string;
      const first = (await rows(a))[0]!;
      await finishEvalRun(db!.db, first.id as string, owner, {
        cancelled: true,
      });
      expect(
        await claimEvalRuns(db!.db, randomUUID(), [target], {
          maxConcurrentEvaluations: 1,
        }),
      ).toHaveLength(0);
      for (const row of await rows(a))
        if (row.status === "running")
          await finishEvalRun(db!.db, row.id as string, owner, {
            cancelled: true,
          });
      const nextOwner = randomUUID();
      const next = await claimEvalRuns(db!.db, nextOwner, [target], {
        maxConcurrentEvaluations: 1,
      });
      expect(next).toHaveLength(1);
      // Lease authority uses database time, not a worker host's wall clock.
      const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() - 3_600_000);
      try {
        await heartbeatEvalRun(db!.db, next[0]!.id, nextOwner);
      } finally {
        now.mockRestore();
      }
      const [renewal] = await db!
        .sql`SELECT lease_expires_at > now()+interval '20 seconds' AS future FROM eval_runs WHERE id=${next[0]!.id}::uuid`;
      expect(renewal!.future).toBe(true);
      await db!
        .sql`UPDATE eval_runs SET lease_expires_at=now()-interval '1 second' WHERE id=${next[0]!.id}::uuid`;
      expect(
        await heartbeatEvalRun(db!.db, next[0]!.id, nextOwner),
      ).toBeUndefined();
      await expect(
        finishEvalRun(db!.db, next[0]!.id, nextOwner, { cancelled: true }),
      ).rejects.toThrow("not persisted");
      await claimEvalRuns(db!.db, randomUUID(), [target], {
        maxConcurrentEvaluations: 1,
      });
      expect(await status(b)).toBe("error");
    }, 15_000);

    it("recovers a lost POST acknowledgement after the consumer begins draining", async () => {
      const gate = hold("held-0");
      const web = await launch("api");
      await ready(web);
      const response = await apiRequest(
        web.base,
        "/v1/studio/evals/evaluations",
        {
          targetId: target.id,
          selection: "selected",
          judge: "app",
          concurrency: 1,
          runTimeoutMs: 10_000,
          idempotencyKey: randomUUID(),
          suites: [
            {
              suiteId: "held",
              suiteRevision: getEvalSuiteRevision(suites[0]!),
              caseIds: ["held-0"],
            },
          ],
        },
      );
      expect(response.status).toBe(202);
      const evaluation = ((await response.json()) as { id: string }).id;
      dropPostResponse = true;
      const worker = await launch("worker");
      await ready(worker);
      await expect.poll(() => calls).toEqual(["held-0"]);
      await expect.poll(() => acceptedRequests.length).toBeGreaterThan(1);
      expect(new Set(acceptedRequests.map((request) => request.id)).size).toBe(
        1,
      );
      expect(consumerRetirement).toBeDefined();
      gate.release();
      await consumerRetirement;
      await expect
        .poll(() => status(evaluation), { timeout: 5000 })
        .toBe("passed");
      expect(calls).toEqual(["held-0"]);
    }, 15_000);

    it("finishes the Studio owner before retiring a singleton consumer and replacing both", async () => {
      const gate = hold("held-0");
      const web = await launch("api");
      await ready(web);
      const a = await submit(web.base, "held");
      const b = await submit(web.base, "queued");
      const old = await launch("worker");
      await ready(old);
      await expect.poll(() => calls.includes("held-0")).toBe(true);
      old.child.kill("SIGUSR2");
      await expect
        .poll(() => old.logs().includes("state: draining"))
        .toBe(true);
      gate.release();
      await expect.poll(() => status(a), { timeout: 5000 }).toBe("passed");
      await expect.poll(() => old.logs().includes("state: drained")).toBe(true);
      const previousConsumer = consumer;
      await previousConsumer.drain();
      expect(await status(b)).toBe("queued");
      await previousConsumer.close();
      consumer = makeConsumer();
      old.child.kill("SIGTERM");
      expect(await old.exited).toBe(0);
      const replacement = await launch("worker");
      await ready(replacement);
      await expect.poll(() => status(b), { timeout: 5000 }).toBe("passed");
      expect(calls).toEqual(["held-0", "held-1", "queued-0", "queued-1"]);
      expect(
        (await apiRequest(web.base, `/v1/studio/evals/evaluations/${a}`))
          .status,
      ).toBe(200);
    }, 20_000);

    it("overlaps compatible consumer replicas with shared PostgreSQL and reobserves the old result without reexecution", async () => {
      const namespace = `consumer-retirement-${randomUUID()}`;
      const firstStore = createPostgresEvalExecutionStore({
        connectionString: url!,
        namespace,
      });
      const nextStore = createPostgresEvalExecutionStore({
        connectionString: url!,
        namespace,
      });
      executionStores.push(firstStore, nextStore);
      await Promise.all([firstStore.setup(), nextStore.setup()]);
      await consumer.close();
      consumer = makeConsumer(firstStore);
      const oldConsumer = consumer;
      const gate = hold("held-0");
      const web = await launch("api");
      await ready(web);
      const a = await submit(web.base, "held");
      const old = await launch("worker");
      await ready(old);
      await expect.poll(() => calls.includes("held-0")).toBe(true);
      const originalRequest = acceptedRequests.find((request) => request.id)!;
      const next = makeConsumer(nextStore);
      expect(await firstStore.generation()).toBe(await nextStore.generation());
      consumer = next; // Health-verified routing switch; old observer stays alive.
      old.child.kill("SIGUSR2");
      const retired = oldConsumer.drain();
      gate.release();
      await retired;
      // Execution drain confirms terminal writes, not that every HTTP observer
      // has consumed them. Keep the old reader's pool alive until Studio commits.
      await expect.poll(() => status(a), { timeout: 5000 }).toBe("passed");
      await oldConsumer.close();
      await firstStore.close();
      executionStores.splice(executionStores.indexOf(firstStore), 1);
      const replay = await fetch(
        `${target.url}?executionId=${originalRequest.id}`,
        {
          headers: {
            authorization: `Bearer ${serviceKey}`,
            "x-kortyx-eval-generation": await nextStore.generation(),
          },
        },
      );
      expect(replay.status).toBe(200);
      expect(await replay.text()).toContain('"result"');
      const duplicate = await fetch(target.url, {
        method: "POST",
        headers: originalRequest.headers,
        body: originalRequest.body,
      });
      expect(duplicate.status).toBe(200);
      expect(await duplicate.text()).toContain('"result"');
      expect(calls).toEqual(["held-0", "held-1"]);
      const b = await submit(web.base, "queued");
      await expect.poll(() => old.logs().includes("state: drained")).toBe(true);
      old.child.kill("SIGTERM");
      expect(await old.exited).toBe(0);
      const replacement = await launch("worker");
      await ready(replacement);
      await expect.poll(() => status(b)).toBe("passed");
      expect(calls).toHaveLength(4);
    }, 25_000);

    it.skipIf(!existsSync(baselinePath))(
      "runs current Studio against the frozen pre-drain consumer build",
      async () => {
        await consumer.close();
        consumer = makeConsumer(undefined, true);
        expect("drain" in consumer).toBe(false);
        const web = await launch("api");
        await ready(web);
        const a = await submit(web.base, "queued");
        const old = await launch("worker");
        await ready(old);
        await expect.poll(() => status(a)).toBe("passed");
        old.child.kill("SIGTERM");
        expect(await old.exited).toBe(0);
        expect(calls).toEqual(["queued-0", "queued-1"]);
      },
      15_000,
    );

    it("rejects changed generation and suite contracts before executing a case", async () => {
      const discovery = await fetch(target.url, {
        headers: { authorization: `Bearer ${serviceKey}` },
      });
      const suite = suites[0]!;
      const headers = {
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        "x-kortyx-eval-protocol": "jobs-v1",
        "x-kortyx-eval-generation": discovery.headers.get(
          "x-kortyx-eval-generation",
        )!,
        "x-kortyx-eval-submitted-at": new Date().toISOString(),
        "idempotency-key": randomUUID(),
      };
      const body = {
        suiteId: suite.id,
        suiteRevision: getEvalSuiteRevision(suite),
        repetitions: 1,
        concurrency: 1,
      };
      const generation = await fetch(target.url, {
        method: "POST",
        headers: { ...headers, "x-kortyx-eval-generation": randomUUID() },
        body: JSON.stringify(body),
      });
      expect(generation.status).toBe(409);
      expect(await generation.json()).toMatchObject({
        code: "EVAL_EXECUTION_STORE_CHANGED",
      });
      const revision = await fetch(target.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...body, suiteRevision: "0".repeat(64) }),
      });
      expect(revision.status).toBe(409);
      expect(calls).toHaveLength(0);
    });

    it("does not claim whole-suite protection if a singleton consumer drains before Studio submits later cases", async () => {
      const gate = hold("held-0");
      const web = await launch("api");
      await ready(web);
      const a = await submit(web.base, "held", 1500);
      const old = await launch("worker");
      await ready(old);
      await expect.poll(() => calls.includes("held-0")).toBe(true);
      old.child.kill("SIGUSR2");
      const retired = consumer.drain();
      gate.release();
      await retired;
      await expect.poll(() => status(a), { timeout: 6000 }).toBe("error");
      expect(calls).toEqual(["held-0"]);
    }, 15_000);

    it("fails retirement after lease loss instead of acknowledging an unpersisted completion", async () => {
      hold("held-0");
      const web = await launch("api");
      await ready(web);
      const a = await submit(web.base, "held");
      const old = await launch("worker");
      await ready(old);
      await expect.poll(() => calls.includes("held-0")).toBe(true);
      old.child.kill("SIGUSR2");
      await expect
        .poll(() => old.logs().includes("state: draining"))
        .toBe(true);
      await db!
        .sql`UPDATE eval_runs SET lease_expires_at=now()-interval '1 second' WHERE evaluation_id=${a}::uuid AND status='running'`;
      await expect
        .poll(() => old.logs().includes("state: failed"), { timeout: 5000 })
        .toBe(true);
      expect(old.logs()).not.toContain("state: drained");
      expect(old.child.exitCode).toBeNull();
      expect((await fetch(`${old.base}/live`)).status).toBe(200);
      expect((await fetch(`${old.base}/ready`)).status).toBe(503);
      const replacement = await launch("worker");
      await ready(replacement);
      await expect.poll(() => status(a)).toBe("error");
      expect(calls.filter((message) => message === "held-0")).toHaveLength(1);
    }, 20_000);
  },
);
