import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import {
  createEvalRouteHandler,
  createEvals,
  type EvalGradeInput,
  type EvalSuite,
  getEvalSuiteRevision,
} from "@kortyx/agent";
import {
  appendEvalProgress,
  claimEvalRun,
  createTelemetryApiKey,
  createTelemetryDbClient,
  enqueueEvalRun,
  ensureLocalDevelopmentProject,
  finishEvalRun,
  getEvalRun,
  listEvalRuns,
  requestEvalCancellation,
} from "@kortyx/telemetry-db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiApp } from "../src/app";
import type { EvalTarget } from "../src/evals/targets";
import { createEvalWorker } from "../src/evals/worker";

const url = process.env.TEST_EVAL_DATABASE_URL;
const suite: EvalSuite = {
  id: "jobs",
  cases: [
    {
      id: "pick",
      steps: [
        {
          message: "Role?",
          expect: {
            type: "interrupt",
            schemaId: "job-picker",
            schemaVersion: "1",
          },
        },
        {
          resume: { type: "value", value: { jobId: "paris" } },
          expect: { type: "answer", criteria: ["Correct city"] },
        },
      ],
    },
  ],
};
const request = {
  suiteId: suite.id,
  suiteRevision: getEvalSuiteRevision(suite),
  repetitions: 1,
  concurrency: 1,
};
describe.skipIf(!url)(
  "persistent eval execution against a disposable database",
  () => {
    const client = createTelemetryDbClient(url!);
    let scope: { organizationId: string; projectId: string };
    beforeAll(async () => {
      const parsed = new URL(url!);
      if (
        !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
        parsed.pathname !== "/kortyx_evals_test"
      )
        throw new Error("Use the dedicated loopback eval test database");
      await promisify(execFile)(
        process.execPath,
        [
          resolve("../../packages/telemetry-db/node_modules/tsx/dist/cli.mjs"),
          "src/scripts/migrate.ts",
        ],
        {
          cwd: resolve("../../packages/telemetry-db"),
          env: { ...process.env, DATABASE_URL: url! },
        },
      );
      scope = await ensureLocalDevelopmentProject(client.db);
      await client.sql`DELETE FROM eval_runs`;
    });
    afterAll(async () => {
      await client.close();
    });
    const enqueue = async (targetId: string) =>
      enqueueEvalRun(client.db, {
        ...scope,
        environment: "development",
        targetId,
        targetName: "Local test",
        suiteId: suite.id,
        suiteRevision: request.suiteRevision,
        suite,
        request,
        requestedBy: "test-key",
      });
    it("persists judge billing, scopes workflow costs by environment and session, and rolls up live progress", async () => {
      const targetId = randomUUID();
      const billingSuite: EvalSuite = {
        id: "billing",
        cases: [
          {
            id: "product",
            steps: [
              {
                message: "Product price?",
                expect: { type: "answer", criteria: ["Accurate price"] },
              },
            ],
          },
        ],
      };
      const revision = getEvalSuiteRevision(billingSuite);
      const queued = await enqueueEvalRun(client.db, {
        ...scope,
        environment: "development",
        targetId,
        targetName: "Billing test",
        suiteId: billingSuite.id,
        suiteRevision: revision,
        suite: billingSuite,
        request: {
          ...request,
          suiteId: billingSuite.id,
          suiteRevision: revision,
        },
        requestedBy: "test",
      });
      await claimEvalRun(client.db, "billing-owner", [
        { ...scope, id: targetId },
      ]);
      const result = await createEvals({
        agent: { streamChat: vi.fn() },
        suites: [billingSuite],
        execute: () => ({
          observation: { type: "answer", text: "$10", structured: [] },
        }),
        judge: {
          id: "billing-test",
          version: "1",
          grade: ({ onUsage }) => {
            onUsage?.({
              provider: "openrouter",
              model: "test",
              occurredAt: new Date().toISOString(),
              pricing: {
                source: "provider",
                currency: "USD",
                actualCostMicros: 300,
              },
            });
            return { passed: true, reason: "Accurate", evidence: ["$10"] };
          },
        },
      }).run({
        suiteId: "billing",
        onProgress: (event) =>
          appendEvalProgress(client.db, queued.id, "billing-owner", event),
      });
      const sessionId = result.cases[0]?.sessionId;
      const active = await getEvalRun(client.db, scope, queued.id);
      expect(active.costs?.total).toMatchObject({
        amount: 0.0003,
        status: "partial",
      });
      for (const [environment, session, amount] of [
        ["development", sessionId, 1200],
        ["production", sessionId, 900000],
        ["development", "other-session", 900000],
      ] as const) {
        await client.sql`insert into telemetry_events (organization_id,project_id,event_id,schema_version,type,occurred_at,environment,service_name,run_id,session_id,workflow_id,payload) values (${scope.organizationId},${scope.projectId},${randomUUID()},1,'generation.completed',now(),${environment},'billing-test',${randomUUID()},${session ?? "missing"},'catalog',${JSON.stringify({ pricing: { source: "provider", currency: "USD", actualCostMicros: amount } })}::jsonb)`;
      }
      await finishEvalRun(client.db, queued.id, "billing-owner", { result });
      const saved = await getEvalRun(client.db, scope, queued.id);
      expect(saved.costs?.total).toMatchObject({
        amount: 0.0015,
        status: "complete",
        calls: 2,
      });
      expect(saved.caseCosts?.["product:1"]?.workflow.amount).toBe(0.0012);
      expect(
        (await listEvalRuns(client.db, scope)).find((r) => r.id === queued.id)
          ?.costs?.total.amount,
      ).toBe(0.0015);
    });
    it("notifies eval changes only after their transaction commits", async () => {
      const changes: string[] = [];
      const listener = await client.sql.listen(
        "kortyx_studio_changes",
        (payload) => changes.push(payload),
      );
      try {
        await expect(
          client.db.transaction(async (tx) => {
            await enqueueEvalRun(tx, {
              ...scope,
              environment: "development",
              targetId: randomUUID(),
              targetName: "Rolled back",
              suiteId: suite.id,
              suiteRevision: request.suiteRevision,
              suite,
              request,
              requestedBy: "test",
            });
            throw new Error("Rollback");
          }),
        ).rejects.toThrow("Rollback");
        await enqueue(randomUUID());
        await vi.waitFor(() => expect(changes).toHaveLength(1));
        expect(JSON.parse(changes[0] ?? "{}")).toMatchObject({
          ...scope,
          resources: ["evals"],
        });
      } finally {
        await listener.unlisten();
      }
    });
    it("claims a queued run once across replicas and isolates reads and cancellation by project", async () => {
      const targetId = randomUUID();
      const run = await enqueue(targetId);
      const targets = [{ ...scope, id: targetId }];
      const claimed = await Promise.all([
        claimEvalRun(client.db, "first", targets),
        claimEvalRun(client.db, "second", targets),
      ]);
      expect(claimed.filter(Boolean)).toHaveLength(1);
      await expect(
        getEvalRun(client.db, { ...scope, projectId: randomUUID() }, run.id),
      ).rejects.toThrow("not found");
      await expect(
        requestEvalCancellation(
          client.db,
          { ...scope, organizationId: randomUUID() },
          run.id,
        ),
      ).rejects.toThrow("not found");
      const winner = claimed.find(Boolean)!;
      await appendEvalProgress(client.db, run.id, winner.leaseOwner!, {
        type: "case-started",
        caseId: "pick",
        repetition: 1,
        sessionId: "test",
      });
      expect((await getEvalRun(client.db, scope, run.id)).events).toHaveLength(
        1,
      );
      await finishEvalRun(client.db, run.id, winner.leaseOwner!, {
        cancelled: true,
      });
      expect((await getEvalRun(client.db, scope, run.id)).status).toBe(
        "cancelled",
      );
    });
    it("cancels a queued run and records an expired executor as unknown instead of replaying it", async () => {
      const targetId = randomUUID();
      const targets = [{ ...scope, id: targetId }];
      const cancelled = await enqueue(targetId);
      await requestEvalCancellation(client.db, scope, cancelled.id);
      expect(await claimEvalRun(client.db, "owner", targets)).toBeUndefined();
      const lost = await enqueue(targetId);
      await claimEvalRun(client.db, "owner", targets);
      await client.sql`UPDATE eval_runs SET lease_expires_at = now() - interval '1 second' WHERE id=${lost.id}`;
      expect(
        await claimEvalRun(client.db, "replacement", targets),
      ).toBeUndefined();
      const saved = await getEvalRun(client.db, scope, lost.id);
      expect(saved.status).toBe("error");
      expect(saved.error).toContain("may have continued");
    });
    it("starts through the authenticated CLI, executes interrupt/resume over HTTP, and reads persisted grades across worker restart", async () => {
      const key = "local-eval-test-service-key-with-32-characters";
      const evals = createEvals({
        agent: { streamChat: vi.fn() },
        suites: [suite],
        execute: ({ command }) => ({
          ...(command.type === "message"
            ? { continuation: { requestId: "request" } }
            : {}),
          observation:
            command.type === "message"
              ? {
                  type: "interrupt",
                  text: "Choose",
                  structured: [],
                  interrupt: {
                    requestId: "request",
                    kind: "custom",
                    schemaId: "job-picker",
                    schemaVersion: "1",
                    options: [],
                    request: { cities: ["Paris", "Barcelona"] },
                  },
                }
              : {
                  type: "answer",
                  text: "Paris job description",
                  structured: [],
                },
        }),
        judge: {
          id: "test",
          version: "1",
          grade: () => ({
            passed: true,
            reason: "The selected city is Paris",
            evidence: ["Paris job description"],
          }),
        },
      });
      const handler = createEvalRouteHandler({ evals, serviceKey: key });
      const server = createServer(async (req, res) => {
        let body = "";
        for await (const part of req) body += part;
        const response = await handler(
          new Request("http://localhost/evals", {
            method: req.method ?? "GET",
            headers: {
              authorization: req.headers.authorization ?? "",
              "content-type": "application/json",
            },
            ...(req.method === "POST" ? { body } : {}),
          }),
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) Readable.fromWeb(response.body).pipe(res);
        else res.end();
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No test listener");
      const target = {
        ...scope,
        id: randomUUID(),
        name: "Local test",
        environment: "development",
        serviceKey: key,
        url: `http://127.0.0.1:${address.port}/evals`,
        allowInsecureHttp: true,
      };
      const pepper = "cli-integration-test-pepper";
      const { apiKey } = await createTelemetryApiKey(client.db, {
        ...scope,
        name: "Eval CLI test",
        scopes: ["studio:read", "eval:run"],
        pepper,
      });
      const api = createApiApp({
        db: client.db,
        apiKeyPepper: pepper,
        evalTargets: [target],
      });
      const apiServer = serve({
        fetch: api.fetch,
        hostname: "127.0.0.1",
        port: 0,
      });
      await once(apiServer, "listening");
      const apiAddress = apiServer.address();
      if (!apiAddress || typeof apiAddress === "string")
        throw new Error("No API test listener");
      const runCli = async (...args: string[]) => {
        const output = await promisify(execFile)(
          process.execPath,
          [
            resolve("node_modules/tsx/dist/cli.mjs"),
            resolve("../../packages/cli/src/index.ts"),
            "studio",
            "evals",
            ...args,
            "--api-url",
            `http://127.0.0.1:${apiAddress.port}`,
            "--api-key-env",
            "KORTYX_INTEGRATION_EVAL_KEY",
            "--config-home",
            `/tmp/kortyx-eval-cli-${target.id}`,
            "--home",
            `/tmp/kortyx-eval-cli-${target.id}`,
            "--json",
          ],
          {
            env: {
              ...process.env,
              KORTYX_CONNECTION: "",
              KORTYX_INTEGRATION_EVAL_KEY: apiKey,
            },
            timeout: 10_000,
          },
        );
        return JSON.parse(output.stdout);
      };
      let run: { id: string };
      const worker = createEvalWorker(client.db, [target]);
      try {
        const doctor = await runCli(
          "doctor",
          "--target",
          target.id,
          "--suite",
          suite.id,
          "--judge",
          "app",
        );
        expect(doctor.status).toBe("passed");
        expect(
          doctor.checks.every(
            (check: { status: string }) => check.status === "passed",
          ),
        ).toBe(true);
        expect(await listEvalRuns(client.db, scope)).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ targetId: target.id }),
          ]),
        );
        const discovery = await runCli("suites", "list");
        expect(discovery.canRun).toBe(true);
        expect(discovery.targets[0].suites[0].id).toBe(suite.id);
        run = await runCli(
          "runs",
          "start",
          suite.id,
          "--target",
          target.id,
          "--judge",
          "app",
        );
        expect((await getEvalRun(client.db, scope, run.id)).status).toBe(
          "queued",
        );
        worker.start();
        await vi.waitFor(
          async () =>
            expect((await getEvalRun(client.db, scope, run.id)).status).toBe(
              "passed",
            ),
          { timeout: 10_000 },
        );
        const cliDetail = await runCli("runs", "get", run.id);
        expect(cliDetail.run.status).toBe("passed");
        expect(cliDetail.run.caseResults[0].steps[1].criteria[0].passed).toBe(
          true,
        );
        expect(JSON.stringify(cliDetail)).not.toContain(
          "Paris job description",
        );
        await worker.stop();
        const queued = await runCli(
          "runs",
          "start",
          suite.id,
          "--target",
          target.id,
          "--judge",
          "app",
        );
        await runCli("runs", "cancel", queued.id);
        expect((await getEvalRun(client.db, scope, queued.id)).status).toBe(
          "cancelled",
        );
      } finally {
        await worker.stop();
        await new Promise<void>((resolve) => apiServer.close(() => resolve()));
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      const replacement = createEvalWorker(client.db, [target]);
      replacement.start();
      await replacement.stop();
      const saved = await getEvalRun(client.db, scope, run.id);
      expect(
        saved.result?.cases[0]?.steps.map((step) => step.observation.type),
      ).toEqual(["interrupt", "answer"]);
      expect(saved.result?.cases[0]?.steps[1]?.criteria[0]?.reason).toContain(
        "Paris",
      );
      expect(saved.events.map((event) => event.event.type)).toEqual([
        "case-started",
        "step-completed",
        "step-completed",
        "case-completed",
      ]);
      expect(
        (await listEvalRuns(client.db, scope)).some(
          (item) => item.id === run.id && item.status === "passed",
        ),
      ).toBe(true);
    }, 30_000);
    it.each([
      false,
      true,
    ])("Studio selects its judge, persists captured grades and bypasses a code judge (available: %s)", async (withCodeJudge) => {
      const pepper = "studio-judge-integration-pepper";
      const { apiKey } = await createTelemetryApiKey(client.db, {
        ...scope,
        name: "Studio judge test",
        scopes: ["studio:read", "eval:run"],
        pepper,
      });
      const grade = vi.fn(async (_input: EvalGradeInput) => ({
        passed: false,
        reason: "Answer changed the salary returned by the tool.",
        evidence: ["Paris: EUR 90,000", "Paris: EUR 99,000"],
      }));
      const targets: EvalTarget[] = [];
      const api = createApiApp({
        db: client.db,
        apiKeyPepper: pepper,
        evalTargets: targets,
        evalJudge: { id: "studio/test", version: "1", grade },
      });
      const apiServer = serve({
        fetch: api.fetch,
        hostname: "127.0.0.1",
        port: 0,
      });
      await once(apiServer, "listening");
      const address = apiServer.address();
      if (!address || typeof address === "string")
        throw new Error("No Studio API listener");
      let consumer: ReturnType<typeof serve> | undefined;
      let worker: ReturnType<typeof createEvalWorker> | undefined;
      try {
        const codeGrade = vi.fn(() => ({
          passed: true,
          reason: "Code would pass",
          evidence: [],
        }));
        const evals = createEvals({
          agent: { streamChat: vi.fn() },
          suites: [suite],
          ...(withCodeJudge
            ? { judge: { id: "app/test", version: "1", grade: codeGrade } }
            : {}),
          execute: ({ command }) =>
            command.type === "message"
              ? {
                  continuation: { requestId: "choose" },
                  observation: {
                    type: "interrupt",
                    text: "Choose",
                    structured: [],
                    events: [
                      {
                        type: "tool-call-result",
                        tool: "read_job",
                        toolCallId: "read-1",
                        content: "Paris: EUR 90,000",
                      },
                    ],
                    interrupt: {
                      requestId: "choose",
                      kind: "custom",
                      schemaId: "job-picker",
                      schemaVersion: "1",
                      options: [],
                      request: { cities: ["Paris", "Barcelona"] },
                    },
                  },
                }
              : {
                  observation: {
                    type: "answer",
                    text: "Paris: EUR 99,000",
                    structured: [],
                  },
                },
        });
        const serviceKey = "studio-judge-consumer-key-at-least-32-characters";
        consumer = serve({
          fetch: createEvalRouteHandler({ evals, serviceKey }),
          hostname: "127.0.0.1",
          port: 0,
        });
        await once(consumer, "listening");
        const listener = consumer.address();
        if (!listener || typeof listener === "string")
          throw new Error("No consumer listener");
        const target = {
          ...scope,
          id: randomUUID(),
          name: "Remote judge test",
          environment: "development",
          serviceKey,
          url: `http://127.0.0.1:${listener.port}`,
          allowInsecureHttp: true,
        };
        targets.push(target);
        const response = await api.request("/v1/studio/evals/runs", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ ...request, targetId: target.id }),
        });
        expect(response.status).toBe(202);
        const { id } = z.object({ id: z.uuid() }).parse(await response.json());
        worker = createEvalWorker(client.db, targets, {
          id: "studio/test",
          version: "1",
          grade,
        });
        worker.start();
        await vi.waitFor(
          async () =>
            expect((await getEvalRun(client.db, scope, id)).status).toBe(
              "failed",
            ),
          { timeout: 10_000 },
        );
        const saved = await getEvalRun(client.db, scope, id);
        expect(saved.result?.judge).toEqual({
          id: "studio/test",
          version: "1",
          location: "studio",
        });
        expect(saved.result?.counts.failed).toBe(1);
        expect(saved.result?.cases[0]?.steps[1]?.criteria[0]?.reason).toContain(
          "salary",
        );
        expect(grade).toHaveBeenCalledOnce();
        expect(codeGrade).not.toHaveBeenCalled();
        expect(saved.request.grading).toBe("studio");
        expect(saved.request.judge).toEqual(saved.result?.judge);
        expect(
          saved.events.some(
            ({ event }) =>
              event.type === "step-completed" &&
              event.step.status === "ungraded",
          ),
        ).toBe(true);
        const graded = grade.mock.calls[0]?.[0] as unknown as {
          conversation: { observation: { events: unknown[] } }[];
        };
        expect(graded.conversation[0]?.observation.events).toEqual(
          saved.result?.cases[0]?.steps[0]?.observation.events,
        );
        expect(JSON.stringify(saved)).not.toContain(apiKey);
      } finally {
        await worker?.stop();
        if (consumer)
          await new Promise<void>((resolve) =>
            consumer?.close(() => resolve()),
          );
        await new Promise<void>((resolve) => apiServer.close(() => resolve()));
      }
    }, 20_000);
    it("a cancellation saved before final persistence wins the completion race", async () => {
      const targetId = randomUUID();
      const run = await enqueue(targetId);
      await claimEvalRun(client.db, "race-owner", [{ ...scope, id: targetId }]);
      await requestEvalCancellation(client.db, scope, run.id);
      await finishEvalRun(client.db, run.id, "race-owner", {
        result: {
          id: randomUUID(),
          suiteId: suite.id,
          suiteRevision: request.suiteRevision,
          suite,
          startedAt: new Date().toISOString(),
          durationMs: 1,
          status: "passed",
          counts: { passed: 1, failed: 0, error: 0, cancelled: 0 },
          cases: [
            {
              caseId: "pick",
              repetition: 1,
              sessionId: "race",
              durationMs: 1,
              status: "passed",
              steps: [],
              errors: [],
            },
          ],
          errors: [],
        },
      });
      const saved = await getEvalRun(client.db, scope, run.id);
      expect(saved.status).toBe("cancelled");
      expect(saved.result).toBeNull();
    });
    it("signals a running consumer on cancellation and saves a cancelled execution", async () => {
      const key = "local-eval-test-service-key-with-32-characters";
      let executing = false;
      let consumerAborted = false;
      const evals = createEvals({
        agent: { streamChat: vi.fn() },
        suites: [suite],
        execute: async ({ signal }) => {
          executing = true;
          await new Promise<void>((resolve) =>
            signal.addEventListener(
              "abort",
              () => {
                consumerAborted = true;
                resolve();
              },
              { once: true },
            ),
          );
          return {
            observation: { type: "cancelled", text: "", structured: [] },
          };
        },
        judge: {
          id: "test",
          version: "1",
          grade: () => ({ passed: true, reason: "Unused", evidence: [] }),
        },
      });
      const handler = createEvalRouteHandler({ evals, serviceKey: key });
      const server = createServer(async (req, res) => {
        let body = "";
        for await (const part of req) body += part;
        const controller = new AbortController();
        res.once("close", () => controller.abort());
        const response = await handler(
          new Request("http://localhost/evals", {
            method: "POST",
            headers: {
              authorization: req.headers.authorization ?? "",
              "content-type": "application/json",
            },
            body,
            signal: controller.signal,
          }),
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) Readable.fromWeb(response.body).pipe(res);
        else res.end();
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No listener");
      const target = {
        ...scope,
        id: randomUUID(),
        name: "Cancellation test",
        environment: "development",
        serviceKey: key,
        url: `http://127.0.0.1:${address.port}/evals`,
        allowInsecureHttp: true,
      };
      const run = await enqueue(target.id);
      const worker = createEvalWorker(client.db, [target]);
      worker.start();
      try {
        await vi.waitFor(() => expect(executing).toBe(true));
        await requestEvalCancellation(client.db, scope, run.id);
        await vi.waitFor(
          async () =>
            expect((await getEvalRun(client.db, scope, run.id)).status).toBe(
              "cancelled",
            ),
          { timeout: 10_000 },
        );
        await vi.waitFor(() => expect(consumerAborted).toBe(true), {
          timeout: 5_000,
        });
      } finally {
        await worker.stop();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }, 15_000);
  },
);
