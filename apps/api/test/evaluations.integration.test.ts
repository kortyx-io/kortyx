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
  StudioEvaluationDetailSchema,
  StudioEvaluationResultsSchema,
} from "@kortyx/agent/evals";
import {
  createTelemetryDbClient,
  ensureLocalDevelopmentProject,
  getEvaluation,
  listEvaluations,
} from "@kortyx/telemetry-db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiApp } from "../src/app";
import { fetchEvalManifest } from "../src/evals/targets";
import { createEvalWorker } from "../src/evals/worker";

const url = process.env.TEST_EVAL_DATABASE_URL;
describe.skipIf(!url)("grouped evaluations on disposable PostgreSQL", () => {
  const client = createTelemetryDbClient(url!);
  const cancelHook = vi.fn(async () => {});
  const suites: EvalSuite[] = ["pass", "fail"].map((id) => ({
    id,
    name: `${id} suite`,
    cases: [
      {
        id: "answer",
        steps: [
          {
            message: id,
            expect: { type: "answer", criteria: ["Answers correctly"] },
          },
        ],
      },
    ],
  }));
  const serviceKey = "grouped-eval-service-key-at-least-32-characters";
  let scope: { organizationId: string; projectId: string };
  let server: ReturnType<typeof createServer>;
  let target: {
    id: string;
    name: string;
    environment: string;
    url: string;
    serviceKey: string;
    allowInsecureHttp: boolean;
    organizationId: string;
    projectId: string;
  };
  let api: ReturnType<typeof createApiApp>;
  let worker: ReturnType<typeof createEvalWorker>;
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
    const evals = createEvals({
      agent: {} as never,
      suites,
      execute: async ({ command }) => ({
        observation: {
          type: "answer",
          text: command.type === "message" ? command.message : "resumed",
          structured: [],
        },
      }),
      judge: {
        id: "fixture",
        version: "1",
        location: "app",
        grade: ({ observation }) => ({
          passed: observation.text === "pass",
          reason: "Fixture assessment",
          evidence: [observation.text],
        }),
      },
    });
    const handler = createEvalRouteHandler({ evals, serviceKey });
    server = createServer(async (req, res) => {
      let body = "";
      for await (const part of req) body += part;
      const response = await handler(
        new Request("http://localhost/evals", {
          method: req.method ?? "GET",
          headers: {
            authorization: req.headers.authorization ?? "",
            "content-type": "application/json",
          },
          ...(body ? { body } : {}),
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
    if (!address || typeof address === "string") throw new Error("No listener");
    target = {
      ...scope,
      id: randomUUID(),
      name: "Grouped fixture",
      environment: "development",
      url: `http://127.0.0.1:${address.port}/evals`,
      serviceKey,
      allowInsecureHttp: true,
    };
    api = createApiApp({
      db: client.db,
      apiKeyPepper: "fixture",
      evalTargetAdapter: {
        list: async () => [target],
        manifest: fetchEvalManifest,
        cancel: cancelHook,
      },
      authentication: {
        authenticate: async () => ({
          ...scope,
          kind: "api-key",
          keyId: "fixture",
          mode: "test",
          scopes: ["studio:read", "eval:run"],
        }),
      },
      authorization: { allows: async () => true },
      tenantDatabase: {
        withPrincipal: async (_principal, work) => work(client.db),
      },
    });
    worker = createEvalWorker(client.db, [target]);
  });
  afterAll(async () => {
    await worker?.stop();
    server?.closeAllConnections();
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    await client.close();
  });
  const request = (extra = {}) => ({
    targetId: target.id,
    selection: "all",
    judge: "app",
    suites: suites.map((suite) => ({
      suiteId: suite.id,
      suiteRevision: getEvalSuiteRevision(suite),
    })),
    metadata: {
      source: "deployment",
      commit: "abc123",
      deploymentUrl: "https://ci.example/jobs/1",
    },
    ...extra,
  });
  const start = (body: unknown) =>
    api.request("/v1/studio/evals/evaluations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  it("creates one parent atomically, deduplicates racing triggers, and rejects changed requests", async () => {
    const input = request({ idempotencyKey: `deploy-1-${target.id}` });
    const responses = await Promise.all([start(input), start(input)]);
    expect(
      responses.every((response) => [200, 202].includes(response.status)),
    ).toBe(true);
    const ids = await Promise.all(
      responses.map(async (response) =>
        z.object({ id: z.uuid() }).parse(await response.json()),
      ),
    );
    expect(ids[0]!.id).toBe(ids[1]!.id);
    const saved = await getEvaluation(client.db, scope, ids[0]!.id);
    expect(saved.suites).toHaveLength(2);
    expect(saved.metadata).toEqual(input.metadata);
    expect(saved.totalAttempts).toBe(2);
    expect(saved.judge?.id).toBe("fixture");
    expect(saved.status).toBe("queued");
    await expect(
      getEvaluation(client.db, { ...scope, environment: "staging" }, saved.id),
    ).rejects.toThrow("not found");
    const scoped = await listEvaluations(client.db, {
      ...scope,
      environment: "staging",
    });
    expect(scoped.some((run) => run.targetId === target.id)).toBe(false);
    expect((await start(input)).status).toBe(200);
    expect((await start({ ...input, name: "changed" })).status).toBe(409);
    expect(
      (
        await start({
          ...input,
          idempotencyKey: "bad",
          suites: [input.suites[0], input.suites[0]],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await start({
          ...input,
          idempotencyKey: "stale",
          suites: input.suites.map((suite) => ({
            ...suite,
            suiteRevision: "0".repeat(64),
          })),
        })
      ).status,
    ).toBe(409);
    const rows =
      await client.sql`SELECT id FROM evaluation_runs WHERE target_id=${target.id}`;
    expect(rows).toHaveLength(1);
  });
  it("runs every suite and exposes grouped counts, detailed results and original case links", async () => {
    const response = await start(
      request({ idempotencyKey: `deploy-1-${target.id}` }),
    );
    const { id } = z.object({ id: z.uuid() }).parse(await response.json());
    worker.start();
    await vi.waitFor(
      async () =>
        expect((await getEvaluation(client.db, scope, id)).status).toBe(
          "failed",
        ),
      { timeout: 10_000 },
    );
    await worker.stop();
    const detail = await api.request(`/v1/studio/evals/evaluations/${id}`);
    const saved = StudioEvaluationDetailSchema.parse(await detail.json()).run;
    expect(saved.completedSuites).toBe(2);
    expect(saved.completedAttempts).toBe(2);
    expect(saved.counts).toEqual({
      passed: 1,
      failed: 1,
      error: 0,
      cancelled: 0,
    });
    expect(saved.startedAt).not.toBeNull();
    expect(saved.endedAt).not.toBeNull();
    const results = StudioEvaluationResultsSchema.parse(
      await (
        await api.request(`/v1/studio/evals/evaluations/${id}/results`)
      ).json(),
    ).run;
    expect(
      results.suites
        .map((suite) => suite.result?.cases[0]?.steps[0]?.criteria[0]?.passed)
        .sort(),
    ).toEqual([false, true]);
    for (const suite of results.suites)
      expect(
        (await api.request(`/v1/studio/evals/runs/${suite.id}`)).status,
      ).toBe(200);
    expect(JSON.stringify(saved)).not.toContain("Fixture assessment");
    expect(JSON.stringify(results)).not.toContain(serviceKey);
    await expect(
      getEvaluation(
        client.db,
        { organizationId: randomUUID(), projectId: randomUUID() },
        id,
      ),
    ).rejects.toThrow("not found");
  });
  it("cancels queued child suites together and preserves completed work", async () => {
    const { id } = z
      .object({ id: z.uuid() })
      .parse(
        await (
          await start(request({ idempotencyKey: `cancel-1-${target.id}` }))
        ).json(),
      );
    const before = await getEvaluation(client.db, scope, id);
    const completed = before.suites[0]!;
    await client.sql`UPDATE eval_runs SET status='passed', started_at=now(), ended_at=now() WHERE id=${completed.id}`;
    expect(
      (
        await api.request(`/v1/studio/evals/evaluations/${id}/cancel`, {
          method: "POST",
        })
      ).status,
    ).toBe(200);
    const saved = await getEvaluation(client.db, scope, id);
    expect(saved.suites.map((suite) => suite.status).sort()).toEqual([
      "cancelled",
      "passed",
    ]);
    expect(saved.status).toBe("cancelled");
    expect(saved.cancelRequestedAt).not.toBeNull();
    expect(saved.completedSuites).toBe(2);
    expect(cancelHook).toHaveBeenCalledTimes(1);
    expect(cancelHook).toHaveBeenCalledWith(
      expect.objectContaining(scope),
      before.suites[1]!.id,
    );
  });
  it("accepts independent conversation selections across multiple suites", async () => {
    const response = await start(
      request({
        selection: "selected",
        suites: suites.map((suite) => ({
          suiteId: suite.id,
          suiteRevision: getEvalSuiteRevision(suite),
          caseIds: ["answer"],
        })),
      }),
    );
    expect(response.status).toBe(202);
    const { id } = z.object({ id: z.uuid() }).parse(await response.json());
    const saved = await getEvaluation(client.db, scope, id);
    expect(saved.suiteCount).toBe(2);
    expect(saved.totalAttempts).toBe(2);
    const subsetWorker = createEvalWorker(client.db, [target]);
    subsetWorker.start();
    try {
      await vi.waitFor(
        async () => {
          expect(
            (await getEvaluation(client.db, scope, id)).completedAttempts,
          ).toBe(2);
        },
        { timeout: 10000 },
      );
    } finally {
      await subsetWorker.stop();
    }
    const results = StudioEvaluationResultsSchema.parse(
      await (
        await api.request(`/v1/studio/evals/evaluations/${id}/results`)
      ).json(),
    ).run;
    expect(
      results.suites.map((suite) =>
        suite.result?.cases.map((item) => item.caseId),
      ),
    ).toEqual([["answer"], ["answer"]]);
  });
});
