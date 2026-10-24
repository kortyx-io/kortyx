import { randomUUID } from "node:crypto";
import {
  EvalInspectionQuerySchema,
  EvalInspectionResponseSchema,
} from "@kortyx/agent/evals";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTelemetryDbClient } from "../src/client";
import { inspectEvaluation } from "../src/repositories/eval-inspection";
import { getEvalLiveState } from "../src/repositories/eval-live";
import { getEvaluation } from "../src/repositories/evaluations";
import { ensureLocalDevelopmentProject } from "../src/repositories/projects";
import { evalRuns, evaluationRuns } from "../src/schema";

const url = process.env.TEST_EVAL_DATABASE_URL;
describe.skipIf(!url)("bounded evaluation inspection on PostgreSQL", () => {
  const client = createTelemetryDbClient(url!);
  let scope: { organizationId: string; projectId: string };
  const parents: string[] = [];
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      !["/kortyx_bounded_memory", "/kortyx_evals_test"].includes(
        target.pathname,
      )
    )
      throw new Error(
        "Use the dedicated loopback bounded-memory test database.",
      );
    scope = await ensureLocalDevelopmentProject(client.db);
  });
  afterAll(async () => {
    for (const id of parents)
      await client.db.delete(evaluationRuns).where(eq(evaluationRuns.id, id));
    await client.close();
  });
  async function fixture() {
    const id = randomUUID(),
      childId = randomUUID();
    parents.push(id);
    const suite = {
      id: "suite",
      name: "Suite",
      cases: [
        {
          id: "answer",
          name: "Answer",
          steps: [
            {
              message: "question",
              expect: { type: "answer" as const, criteria: ["Correct"] },
            },
          ],
        },
      ],
    };
    await client.db.insert(evaluationRuns).values({
      ...scope,
      id,
      environment: "development",
      targetId: "app",
      targetName: "App",
      name: "Run",
      request: {
        targetId: "app",
        selection: "all",
        suites: [{ suiteId: "suite", suiteRevision: "revision" }],
      },
      requestHash: "hash",
      requestedBy: "local-test",
    });
    await client.db.insert(evalRuns).values({
      ...scope,
      id: childId,
      evaluationId: id,
      environment: "development",
      targetId: "app",
      targetName: "App",
      suiteId: "suite",
      suiteRevision: "revision",
      suite,
      requestedBy: "local-test",
      request: {
        suiteId: "suite",
        suiteRevision: "revision",
        repetitions: 1,
        concurrency: 1,
      },
      status: "passed",
      startedAt: new Date(),
      endedAt: new Date(),
      result: {
        id: "result",
        suiteId: "suite",
        suiteRevision: "revision",
        suite,
        status: "passed",
        startedAt: new Date().toISOString(),
        durationMs: 10,
        judge: { id: "judge", version: "1", location: "app" },
        counts: { passed: 1, failed: 0, error: 0, cancelled: 0 },
        errors: [],
        cases: [
          {
            caseId: "answer",
            repetition: 1,
            sessionId: "session",
            status: "passed",
            durationMs: 10,
            errors: [],
            steps: [
              {
                index: 0,
                input: { message: "question" },
                reference: { source: "verified" },
                expectation: { type: "answer", criteria: ["Correct"] },
                observation: {
                  type: "answer",
                  text: "small",
                  structured: [],
                },
                status: "passed",
                criteria: [],
              },
            ],
          },
        ],
      },
    });
    return { id, childId };
  }
  const query = (value: Record<string, unknown>) =>
    EvalInspectionQuerySchema.parse(value);
  it("invalidates progress under a restricted caller search path", async () => {
    const { childId } = await fixture();
    await client.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL search_path = pg_catalog`);
      await tx.execute(
        sql`INSERT INTO public.eval_run_events(run_id, organization_id, project_id, event) VALUES (${childId}::uuid, ${scope.organizationId}::uuid, ${scope.projectId}::uuid, '{"type":"case-started","caseId":"answer","repetition":1,"sessionId":"restricted"}'::jsonb)`,
      );
    });
    const [row] = await client.db
      .select({ projection: evalRuns.liveProjection })
      .from(evalRuns)
      .where(eq(evalRuns.id, childId));
    expect(row?.projection).toBeNull();
  });

  it("reads a cold evaluation inside a read-only transaction without persisting its cache", async () => {
    const { id } = await fixture();
    const run = await client.db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      const detail = await getEvaluation(tx as typeof client.db, scope, id);
      await tx.execute(sql`SELECT 1`); // a denied cache write must not poison the caller transaction
      return detail;
    });
    expect(run.suites[0]?.counts.passed).toBe(1);
    expect(run.suites[0]?.status).toBe("passed");
    const [cache] = await client.db
      .select({ projection: evalRuns.liveProjection })
      .from(evalRuns)
      .where(eq(evalRuns.evaluationId, id));
    expect(cache?.projection).toBeNull();
  });

  it("reads cold and stale evaluation summaries with SELECT-only privileges", async () => {
    const { id } = await fixture();
    const role = `eval_reader_${randomUUID().replaceAll("-", "")}`;
    await client.sql.unsafe(`CREATE ROLE "${role}"`);
    try {
      await client.sql.unsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await client.sql.unsafe(
        `GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`,
      );
      const read = () =>
        client.db.transaction(async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL ROLE "${role}"`));
          const detail = await getEvaluation(tx as typeof client.db, scope, id);
          await tx.execute(sql`SELECT 1`);
          return detail;
        });
      const cold = await read();
      expect(cold.suites[0]?.counts.passed).toBe(1);
      const childId = cold.suites[0]?.id;
      if (!childId) throw new Error("Expected the child run");
      const readLive = () =>
        client.db.transaction(async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL ROLE "${role}"`));
          return getEvalLiveState(tx as typeof client.db, scope, childId);
        });
      const first = await readLive();
      const second = await readLive();
      expect(second.version).toBe(first.version);
      expect(second.cases[0]?.evidenceVersion).toBe(
        first.cases[0]?.evidenceVersion,
      );
      const [unwritten] = await client.db
        .select({ projection: evalRuns.liveProjection })
        .from(evalRuns)
        .where(eq(evalRuns.evaluationId, id));
      expect(unwritten?.projection).toBeNull();
      // Warm with an authorized writer, then force a repricing refresh.
      await getEvaluation(client.db, scope, id);
      await client.sql`UPDATE eval_runs SET live_projection=jsonb_set(live_projection,'{pricingVersion}','"stale"') WHERE evaluation_id=${id}::uuid`;
      const stale = await read();
      expect(stale.suites[0]?.counts).toEqual(cold.suites[0]?.counts);
      const [unchanged] =
        await client.sql`SELECT live_projection->>'pricingVersion' AS version FROM eval_runs WHERE evaluation_id=${id}::uuid`;
      expect(unchanged?.version).toBe("stale");
    } finally {
      await client.sql.unsafe(`DROP OWNED BY "${role}"`);
      await client.sql.unsafe(`DROP ROLE "${role}"`);
    }
  });

  it("inventories attempts and bounds selected evidence with a multi-megabyte saved output", async () => {
    const { id, childId } = await fixture();
    await client.db
      .update(evalRuns)
      .set({
        result: sql`jsonb_set(${evalRuns.result},'{cases,0,steps,0,observation,text}',to_jsonb(repeat('PRIVATE_OUTPUT',1000000)))`,
      })
      .where(eq(evalRuns.id, childId));
    const overview = await inspectEvaluation(client.db, scope, id, query({}));
    EvalInspectionResponseSchema.parse(overview);
    expect(Buffer.byteLength(JSON.stringify(overview))).toBeLessThan(40_000);
    expect(JSON.stringify(overview)).not.toContain("PRIVATE_OUTPUT");
    const attempts = await inspectEvaluation(
      client.db,
      scope,
      id,
      query({ view: "attempts", limit: 1, status: "passed" }),
    );
    expect(attempts.page).toMatchObject({
      available: 1,
      returned: 1,
      nextCursor: null,
    });
    const selection = {
      suite: childId,
      caseId: "answer",
      repetition: 1,
      turn: 0,
    };
    const turn = await inspectEvaluation(
      client.db,
      scope,
      id,
      query({ view: "turn", ...selection }),
    );
    expect(JSON.stringify(turn)).not.toContain("PRIVATE_OUTPUT");
    const evidence = await inspectEvaluation(
      client.db,
      scope,
      id,
      query({
        view: "evidence",
        section: "output",
        contentLimit: 100,
        ...selection,
      }),
    );
    expect(evidence.page.returned).toBe(100);
    expect(evidence.page.nextCursor).toBe(100);
    expect(evidence.page.available).toBeGreaterThan(10_000_000);
    const next = await inspectEvaluation(
      client.db,
      scope,
      id,
      query({
        view: "evidence",
        section: "output",
        contentLimit: 100,
        contentCursor: 100,
        ...selection,
      }),
    );
    expect(next.page.nextCursor).toBe(200);
  });
  it("redacts nested credentials before evidence pagination and preserves Unicode offsets", async () => {
    const { id, childId } = await fixture();
    await client.db
      .update(evalRuns)
      .set({
        result: sql`jsonb_set(${evalRuns.result},'{cases,0,steps,0,observation,structured}', '[{"text":"😀😀", "nested":{"resumeToken":"NEVER_EXPOSE_THIS", "credentials":{"password":"ALSO_PRIVATE"}}, "header":"Bearer hidden-token"}]'::jsonb)`,
      })
      .where(eq(evalRuns.id, childId));
    let cursor = 0,
      text = "";
    for (;;) {
      const result = await inspectEvaluation(
        client.db,
        scope,
        id,
        query({
          view: "evidence",
          suite: childId,
          caseId: "answer",
          repetition: 1,
          section: "observation",
          contentLimit: 7,
          contentCursor: cursor,
        }),
      );
      text += (result.data as { content: string }).content;
      if (result.page.nextCursor === null) break;
      cursor = result.page.nextCursor;
    }
    expect(text).not.toMatch(/NEVER_EXPOSE_THIS|ALSO_PRIVATE|hidden-token/);
    expect(text).toContain("😀😀");
    expect(JSON.parse(text).structured[0].nested.credentials).toBe(
      "[REDACTED]",
    );
  });
  it("scopes every reader and validates selections without executing new work", async () => {
    const { id, childId } = await fixture();
    await expect(
      inspectEvaluation(
        client.db,
        { ...scope, projectId: randomUUID() },
        id,
        query({}),
      ),
    ).rejects.toThrow("not found");
    await expect(
      inspectEvaluation(
        client.db,
        { ...scope, environment: "production" },
        childId,
        query({ view: "attempts" }),
      ),
    ).rejects.toThrow("not found");
    await expect(
      inspectEvaluation(client.db, scope, id, query({ view: "turn" })),
    ).rejects.toThrow("Select one");
    await expect(
      inspectEvaluation(
        client.db,
        scope,
        id,
        query({
          view: "turn",
          suite: childId,
          caseId: "missing",
          repetition: 1,
        }),
      ),
    ).rejects.toThrow("not found");
    const empty = await inspectEvaluation(
      client.db,
      scope,
      id,
      query({ view: "attempts", status: "error" }),
    );
    expect(empty.page).toMatchObject({
      available: 0,
      returned: 0,
      nextCursor: null,
    });
    const missing = await inspectEvaluation(
      client.db,
      scope,
      id,
      query({
        view: "evidence",
        suite: childId,
        caseId: "answer",
        repetition: 1,
        section: "model",
      }),
    );
    expect(missing.data).toMatchObject({ state: "not_captured" });
  });
});
