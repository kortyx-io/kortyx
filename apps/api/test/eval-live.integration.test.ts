import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { getEvalSuiteRevision } from "@kortyx/agent";
import {
  type EvalRunResult,
  type EvalSuite,
  StudioEvalLiveDetailSchema,
  StudioEvalLiveUpdateSchema,
} from "@kortyx/agent/evals";
import { TelemetryEventBatchSchema } from "@kortyx/telemetry-contracts";
import {
  appendEvalProgress,
  claimEvalRun,
  createTelemetryApiKey,
  createTelemetryDbClient,
  enqueueEvalRun,
  ensureLocalDevelopmentProject,
  finishEvalRun,
  getEvalLiveRun,
  getEvalRun,
  ingestTelemetryEvents,
} from "@kortyx/telemetry-db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const url = process.env.TEST_EVAL_DATABASE_URL;
const databaseUrl = url ?? "postgresql://localhost/kortyx_evals_test";
describe.skipIf(!url)(
  "compact live eval reads on a disposable database",
  () => {
    const client = createTelemetryDbClient(databaseUrl);
    const db = client.db;
    let scope: { organizationId: string; projectId: string };
    let authorization: string;
    const suite: EvalSuite = {
      id: "live",
      cases: ["a", "b"].map((id) => ({
        id,
        steps: [{ message: "Hi", expect: { type: "answer" } }],
      })),
    };
    const revision = getEvalSuiteRevision(suite);
    const pepper = "local-live-test";
    beforeAll(async () => {
      const parsed = new URL(databaseUrl);
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
          env: { ...process.env, DATABASE_URL: databaseUrl },
        },
      );
      scope = await ensureLocalDevelopmentProject(db);
      authorization = `Bearer ${(await createTelemetryApiKey(db, { ...scope, name: "Live read test", scopes: ["studio:read"], pepper })).apiKey}`;
    });
    afterAll(() => client.close());
    async function fixture() {
      const targetId = randomUUID();
      const run = await enqueueEvalRun(db, {
        ...scope,
        environment: "development",
        targetId,
        targetName: "Live test",
        suiteId: suite.id,
        suiteRevision: revision,
        suite,
        request: {
          suiteId: suite.id,
          suiteRevision: revision,
          repetitions: 1,
          concurrency: 2,
        },
        requestedBy: "test",
      });
      await claimEvalRun(db, "owner", [{ ...scope, id: targetId }]);
      const attemptId = randomUUID(),
        runtimeId = randomUUID(),
        sessionId = randomUUID();
      await appendEvalProgress(db, run.id, "owner", {
        type: "case-started",
        caseId: "a",
        repetition: 1,
        attemptId,
        sessionId,
      });
      await appendEvalProgress(db, run.id, "owner", {
        type: "case-runtime-associated",
        caseId: "a",
        repetition: 1,
        attemptId,
        execution: { sessionId, runId: runtimeId },
      });
      return { run, attemptId, runtimeId, sessionId };
    }
    const generation = (
      f: Awaited<ReturnType<typeof fixture>>,
      amount: number,
      environment = "development",
    ) =>
      TelemetryEventBatchSchema.parse({
        events: [
          {
            schemaVersion: 1,
            eventId: randomUUID(),
            type: "generation.completed",
            occurredAt: new Date().toISOString(),
            environment,
            service: { name: "live-test" },
            correlation: {
              runId: f.runtimeId,
              sessionId: f.sessionId,
              workflowId: "test",
            },
            payload: {
              provider: "test",
              model: "test",
              evalAttemptId: f.attemptId,
              pricing: {
                source: "provider",
                currency: "USD",
                actualCostMicros: amount,
              },
              output: "private-provider-output",
            },
          },
        ],
      }).events;

    it("keeps live responses small and reconciles missed changes by version", async () => {
      const f = await fixture();
      const api = createApiApp({ db, apiKeyPepper: pepper });
      const path = `/v1/studio/evals/runs/${f.run.id}/live`;
      const headers = { authorization };
      const initial = StudioEvalLiveDetailSchema.parse(
        await (await api.request(path, { headers })).json(),
      ).run;
      await appendEvalProgress(db, f.run.id, "owner", {
        type: "step-completed",
        caseId: "a",
        repetition: 1,
        step: {
          index: 0,
          input: { message: "hi" },
          expectation: { type: "answer" },
          observation: {
            type: "answer",
            text: "PRIVATE_EVIDENCE".repeat(100_000),
            structured: [],
          },
          status: "ungraded",
          criteria: [],
        },
      });
      // Historical warming must not materialize the large observation either.
      await client.sql`update eval_runs set live_projection=null where id=${f.run.id}`;
      const response = await api.request(`${path}?after=${initial.version}`, {
        headers,
      });
      const text = await response.text();
      const update = StudioEvalLiveUpdateSchema.parse(JSON.parse(text));
      expect(update.version).not.toBe(initial.version);
      expect(update.run?.cases[0]?.completedSteps).toBe(1);
      expect(text.length).toBeLessThan(10_000);
      expect(text).not.toContain("PRIVATE_EVIDENCE");
      expect(
        StudioEvalLiveUpdateSchema.parse(
          await (
            await api.request(`${path}?after=${update.version}`, { headers })
          ).json(),
        ).run,
      ).toBeNull();
      const evidence = await api.request(
        `/v1/studio/evals/runs/${f.run.id}/case?caseId=a&repetition=1`,
        { headers },
      );
      expect(await evidence.text()).toContain("PRIVATE_EVIDENCE");
      expect((await api.request(`${path}?after=bad`, { headers })).status).toBe(
        400,
      );
    });
    it("updates late billing without a viewer or duplicate charges, retaining environment and execution fences", async () => {
      const f = await fixture();
      await appendEvalProgress(db, f.run.id, "owner", {
        type: "case-completed",
        result: {
          caseId: "a",
          repetition: 1,
          attemptId: f.attemptId,
          runtimeExecutions: [{ sessionId: f.sessionId, runId: f.runtimeId }],
          sessionId: f.sessionId,
          status: "passed",
          durationMs: 1,
          steps: [],
          errors: [],
        },
      });
      const before = await getEvalLiveRun(db, scope, f.run.id);
      const events = generation(f, 1_000);
      await ingestTelemetryEvents(db, { ...scope, events });
      await ingestTelemetryEvents(db, { ...scope, events });
      await ingestTelemetryEvents(db, {
        ...scope,
        events: generation(f, 900_000, "production"),
      });
      // No live read is needed to persist the new price.
      const [stored] =
        await client.sql`select live_projection from eval_runs where id=${f.run.id}`;
      if (!stored) throw new Error("Expected a saved eval projection.");
      const storedCases = Object.values(stored.live_projection.attempts) as {
        summary: { costs: { workflow: { amount: number; calls: number } } };
      }[];
      expect(storedCases[0]?.summary.costs.workflow).toMatchObject({
        amount: 0.001,
        calls: 1,
      });
      const after = await getEvalLiveRun(db, scope, f.run.id);
      expect(after.version).not.toBe(before.version);
      expect(after.cases[0]?.costs?.workflow.amount).toBe(0.001);
      await expect(
        getEvalLiveRun(db, { ...scope, projectId: randomUUID() }, f.run.id),
      ).rejects.toThrow("not found");
      await expect(
        getEvalLiveRun(db, { ...scope, environment: "production" }, f.run.id),
      ).rejects.toThrow("not found");
    });
    it("detects changed rate cards without invalidating every run or rereading case evidence", async () => {
      const f = await fixture();
      const before = await getEvalLiveRun(db, scope, f.run.id);
      const [rate] =
        await client.sql`insert into model_rate_cards (organization_id,project_id,provider,model,currency,unit_prices,source)
        values (${scope.organizationId},${scope.projectId},'test',${randomUUID()},'USD','[]'::jsonb,'test') returning id`;
      if (!rate) throw new Error("Expected the pricing fixture.");
      try {
        const [saved] =
          await client.sql`select live_projection is not null as retained from eval_runs where id=${f.run.id}`;
        expect(saved?.retained).toBe(true);
        const after = await getEvalLiveRun(db, scope, f.run.id);
        expect(after.version).not.toBe(before.version);
        expect(after.cases[0]?.evidenceVersion).toBe(
          before.cases[0]?.evidenceVersion,
        );
      } finally {
        await client.sql`delete from model_rate_cards where id=${rate.id}`;
      }
    });
    it("preserves billing, progress and final results when derived live-view writes fail, then rebuilds without rerunning", async () => {
      const f = await fixture();
      await client.sql`update eval_runs set target_name='Projection failure fixture' where id=${f.run.id}`;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await client.sql`create function kortyx_test_reject_live_projection() returns trigger language plpgsql as $$
          begin if new.target_name='Projection failure fixture' and new.live_projection is not null then
            raise exception 'projection fixture failure'; end if; return new; end $$`;
        await client.sql`create trigger kortyx_test_live_projection_failure before update of live_projection on eval_runs
          for each row execute function kortyx_test_reject_live_projection()`;
        const billing = generation(f, 1_000);
        await ingestTelemetryEvents(db, { ...scope, events: billing });
        const [storedBilling] =
          await client.sql`select count(*)::integer as count from telemetry_events where event_id=${billing[0]?.eventId ?? ""}`;
        expect(storedBilling?.count).toBe(1);
        const step = {
          index: 0,
          input: { message: "hi" },
          expectation: { type: "answer" as const },
          observation: {
            type: "answer" as const,
            text: "kept evidence",
            structured: [],
          },
          status: "passed" as const,
          criteria: [],
        };
        await appendEvalProgress(db, f.run.id, "owner", {
          type: "step-completed",
          caseId: "a",
          repetition: 1,
          step,
        });
        const result: EvalRunResult = {
          id: f.run.id,
          suiteId: suite.id,
          suiteRevision: revision,
          suite,
          startedAt: new Date().toISOString(),
          durationMs: 1,
          status: "passed",
          counts: { passed: 2, failed: 0, error: 0, cancelled: 0 },
          errors: [],
          cases: ["a", "b"].map((caseId) => ({
            caseId,
            repetition: 1,
            sessionId: caseId === "a" ? f.sessionId : "other-session",
            ...(caseId === "a"
              ? {
                  attemptId: f.attemptId,
                  runtimeExecutions: [
                    { sessionId: f.sessionId, runId: f.runtimeId },
                  ],
                }
              : {}),
            status: "passed",
            durationMs: 1,
            steps: [step],
            errors: [],
          })),
        };
        await finishEvalRun(db, f.run.id, "owner", { result });
        const saved = await getEvalRun(db, scope, f.run.id);
        expect(
          saved.events.some(({ event }) => event.type === "step-completed"),
        ).toBe(true);
        expect(saved.result?.cases[0]?.steps[0]?.observation).toMatchObject({
          text: "kept evidence",
        });
        expect(saved.status).toBe("passed");
        expect(warn).toHaveBeenCalledWith(
          "Evaluation live view maintenance was deferred.",
        );
      } finally {
        await client.sql`drop trigger if exists kortyx_test_live_projection_failure on eval_runs`;
        await client.sql`drop function if exists kortyx_test_reject_live_projection()`;
        warn.mockRestore();
      }
      const rebuilt = await getEvalLiveRun(db, scope, f.run.id);
      expect(rebuilt.counts?.passed).toBe(2);
      expect(
        rebuilt.cases.find((c) => c.caseId === "a")?.costs?.workflow.amount,
      ).toBe(0.001);
    });
    it("reconciles older SQL writers once and preserves selected-case evidence through completion", async () => {
      const f = await fixture();
      const result: EvalRunResult = {
        id: f.run.id,
        suiteId: suite.id,
        suiteRevision: revision,
        suite,
        startedAt: new Date().toISOString(),
        durationMs: 1,
        status: "passed",
        counts: { passed: 2, failed: 0, error: 0, cancelled: 0 },
        errors: [],
        cases: ["a", "b"].map((caseId) => ({
          caseId,
          repetition: 1,
          sessionId: caseId === "a" ? f.sessionId : "other-session",
          attemptId: caseId === "a" ? f.attemptId : randomUUID(),
          runtimeExecutions:
            caseId === "a"
              ? [{ sessionId: f.sessionId, runId: f.runtimeId }]
              : [],
          status: "passed",
          durationMs: 1,
          steps:
            caseId === "a"
              ? [
                  {
                    index: 0,
                    input: { message: "hi" },
                    expectation: { type: "answer" },
                    observation: {
                      type: "answer",
                      text: "private-terminal-output".repeat(10_000),
                      structured: [],
                    },
                    status: "passed",
                    criteria: [],
                    judgeCalls: 1,
                    judgeUsage: [
                      {
                        provider: "test",
                        model: "test",
                        occurredAt: new Date().toISOString(),
                        pricing: {
                          source: "provider",
                          currency: "USD",
                          actualCostMicros: 250,
                        },
                      },
                    ],
                  },
                ]
              : [],
          errors: [],
        })),
      };
      await finishEvalRun(db, f.run.id, "owner", { result });
      await client.sql`update eval_runs set live_projection=null where id=${f.run.id}`;
      const events = generation(f, 2_000);
      const event = events[0];
      if (!event) throw new Error("Expected a generation fixture.");
      await client.sql`insert into telemetry_events (organization_id,project_id,event_id,schema_version,type,occurred_at,environment,service_name,run_id,session_id,workflow_id,payload)
      values (${scope.organizationId},${scope.projectId},${event.eventId},1,'generation.completed',now(),'development','test',${f.runtimeId},${f.sessionId},'test',${JSON.stringify(event.payload)}::jsonb)`;
      const live = await getEvalLiveRun(db, scope, f.run.id);
      expect(live.cases[0]?.costs?.workflow.amount).toBe(0.002);
      expect(live.cases[0]?.costs?.judge.amount).toBe(0.00025);
      expect(JSON.stringify(live)).not.toContain("private-terminal-output");
      expect(live.counts?.passed).toBe(2);
      const selected = await getEvalRun(db, scope, f.run.id, {
        caseId: "b",
        repetition: 1,
      });
      expect(selected.result?.cases.map((c) => c.caseId)).toEqual(["b"]);
      expect(selected).not.toHaveProperty("liveProjection");
    });
  },
);
