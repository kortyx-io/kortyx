import { randomUUID } from "node:crypto";
import { StudioEvaluationComparisonSchema } from "@kortyx/agent/evals";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTelemetryDbClient } from "../src/client";
import { getEvaluationComparison } from "../src/repositories/evaluation-comparison";
import { ensureLocalDevelopmentProject } from "../src/repositories/projects";
import { evalRuns, evaluationRuns } from "../src/schema";

const url = process.env.TEST_EVAL_DATABASE_URL;
describe.skipIf(!url)("bounded evaluation comparisons on PostgreSQL", () => {
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
  it("keeps a constant response size with multi-megabyte observations and fingerprints changed context", async () => {
    const { id, childId } = await fixture();
    const before = await getEvaluationComparison(client.db, scope, id);
    StudioEvaluationComparisonSchema.parse({ run: before });
    const fingerprint = before.suites[0]?.cases[0]?.contexts[0]?.fingerprint;
    expect(fingerprint).toBeTruthy();
    // Generate the large evidence inside PostgreSQL: it must never be returned to the test process.
    await client.db
      .update(evalRuns)
      .set({
        result: sql`jsonb_set(${evalRuns.result},'{cases,0,steps,0,observation,text}',to_jsonb(repeat('PRIVATE_OUTPUT',1000000)))`,
      })
      .where(eq(evalRuns.id, childId));
    const after = await getEvaluationComparison(client.db, scope, id);
    expect(after).toEqual(before);
    expect(Buffer.byteLength(JSON.stringify(after))).toBeLessThan(10_000);
    expect(JSON.stringify(after)).not.toMatch(
      /PRIVATE_OUTPUT|observation|sessionId|question|verified/,
    );
    await client.db
      .update(evalRuns)
      .set({
        result: sql`jsonb_set(${evalRuns.result},'{cases,0,steps,0,reference}', '{"source":"different"}'::jsonb)`,
      })
      .where(eq(evalRuns.id, childId));
    const changed = await getEvaluationComparison(client.db, scope, id);
    expect(changed.suites[0]?.cases[0]?.contexts[0]?.fingerprint).not.toBe(
      fingerprint,
    );
    expect(changed.suites[0]?.cases[0]?.status).toBe("passed");
  });
  it("exposes recorded prompt/model identities and fingerprints their changes without prompts", async () => {
    const { id, childId } = await fixture();
    const before = await getEvaluationComparison(client.db, scope, id);
    await client.db
      .update(evalRuns)
      .set({
        result: sql`jsonb_set(${evalRuns.result},'{cases,0,steps,0,observation,promptUsage}', '[{"id":"saved-prompt","version":2,"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"development","snapshotRevision":"recorded-snapshot","model":"recorded-model"}]'::jsonb)`,
      })
      .where(eq(evalRuns.id, childId));
    const after = await getEvaluationComparison(client.db, scope, id);
    StudioEvaluationComparisonSchema.parse({ run: after });
    const context = after.suites[0]?.cases[0]?.contexts[0];
    expect(context?.models).toEqual(["recorded-model"]);
    expect(context?.prompts?.[0]?.id).toBe("saved-prompt");
    expect(context?.fingerprint).not.toBe(
      before.suites[0]?.cases[0]?.contexts[0]?.fingerprint,
    );
    expect(JSON.stringify(after)).not.toContain("question");
  });
  it("checks organization, project and environment before reading another evaluation", async () => {
    const { id } = await fixture();
    for (const denied of [
      { ...scope, organizationId: randomUUID() },
      { ...scope, projectId: randomUUID() },
      { ...scope, environment: "production" },
    ])
      await expect(
        getEvaluationComparison(client.db, denied, id),
      ).rejects.toThrow("not found");
  });
  it("rejects excessive cardinality instead of silently truncating a comparison", async () => {
    const { id, childId } = await fixture();
    await client.db
      .update(evalRuns)
      .set({
        request: {
          suiteId: "suite",
          suiteRevision: "revision",
          repetitions: 2001,
          concurrency: 1,
        },
      })
      .where(eq(evalRuns.id, childId));
    await expect(getEvaluationComparison(client.db, scope, id)).rejects.toThrow(
      "too large",
    );
  });
});
