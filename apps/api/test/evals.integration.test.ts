import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import {
  createEvalRouteHandler,
  createEvals,
  type EvalSuite,
  getEvalSuiteRevision,
} from "@kortyx/agent";
import {
  appendEvalProgress,
  claimEvalRun,
  createTelemetryDbClient,
  enqueueEvalRun,
  ensureLocalDevelopmentProject,
  finishEvalRun,
  getEvalRun,
  listEvalRuns,
  requestEvalCancellation,
} from "@kortyx/telemetry-db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
    it("executes an interrupt/resume over HTTP and persists observations and grading across worker restart", async () => {
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
      const run = await enqueue(target.id);
      const worker = createEvalWorker(client.db, [target]);
      worker.start();
      try {
        await vi.waitFor(
          async () =>
            expect((await getEvalRun(client.db, scope, run.id)).status).toBe(
              "passed",
            ),
          { timeout: 10_000 },
        );
      } finally {
        await worker.stop();
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
    }, 15_000);
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
        await vi.waitFor(() => expect(consumerAborted).toBe(true));
      } finally {
        await worker.stop();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }, 15_000);
  },
);
