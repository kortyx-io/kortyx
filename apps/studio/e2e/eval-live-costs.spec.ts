import { randomUUID } from "node:crypto";
import {
  type EvalRunResult,
  type EvalStepResult,
  getEvalSuiteRevision,
} from "@kortyx/agent";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const suite = {
  id: "live-costs",
  name: "Live billing verification",
  cases: [
    {
      id: "lookup",
      name: "Product lookup",
      steps: [
        {
          message: "Read product A",
          expect: {
            type: "answer" as const,
            criteria: ["Price matches the retrieved product"],
          },
        },
      ],
    },
  ],
};

test("receives external eval progress and late billing in a case drawer without polling or losing URL state", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const sql = postgres(
    process.env.DATABASE_URL ??
      "postgres://kortyx:kortyx@127.0.0.1:6543/kortyx",
    { max: 1 },
  );
  const id = randomUUID();
  const session = `e2e-ktx25-eval-cost-${id}`;
  const fullPage = await page.context().newPage();
  const step: EvalStepResult = {
    index: 0,
    input: { message: "Read product A" },
    expectation: suite.cases[0].steps[0].expect,
    observation: {
      type: "answer",
      text: "Product A costs $10",
      structured: [],
      runId: DRAWER_FIXTURE.runId,
    },
    status: "ungraded",
    criteria: [],
  };
  try {
    const [scope] =
      await sql`select organization_id,project_id from studio_runs where run_id=${DRAWER_FIXTURE.runId} limit 1`;
    if (!scope) throw new Error("Seed the drawer fixture first");
    const change = async (resource = "evals") => {
      await sql`select pg_notify('kortyx_studio_changes', ${JSON.stringify({ schemaVersion: 1, changeId: randomUUID(), emittedAt: new Date().toISOString(), organizationId: scope.organization_id, projectId: scope.project_id, resources: [resource] })})`;
    };
    await page.goto("/evals/runs?q=Live+billing");
    await expect(
      page.getByRole("button", { name: /Live refresh: Connected/ }),
    ).toBeVisible({ timeout: 15_000 });
    await sql`insert into eval_runs (id,organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,request,requested_by,status) values (${id},${scope.organization_id},${scope.project_id},'development','e2e-live-costs','Billing fixture',${suite.id},${getEvalSuiteRevision(suite)},${sql.json(suite)},${sql.json({ suiteId: suite.id, suiteRevision: getEvalSuiteRevision(suite), repetitions: 1 })},'e2e','running')`;
    await change();
    const historyRow = page.locator(`[data-row-key="${id}"]`);
    await expect(historyRow).toBeVisible();
    await historyRow
      .getByRole("button", { name: suite.name, exact: true })
      .click();
    const runPath = `/evals/runs/${id}`;
    const runDrawer = page.locator("main").last();
    await expect(page).toHaveURL(new RegExp(runPath));
    await expect(
      runDrawer.getByRole("button", { name: "Product lookup", exact: true }),
    ).toBeVisible();
    await sql`insert into eval_run_events (run_id,organization_id,project_id,event) values (${id},${scope.organization_id},${scope.project_id},${sql.json({ type: "case-started", caseId: "lookup", repetition: 1, sessionId: session })}), (${id},${scope.organization_id},${scope.project_id},${sql.json(JSON.parse(JSON.stringify({ type: "step-completed", caseId: "lookup", repetition: 1, step })))})`;
    await change();
    await runDrawer
      .getByRole("button", { name: "Product lookup", exact: true })
      .click();
    const casePath = `/evals/cases/${id}/lookup/1`;
    const caseDrawer = page.locator(`[data-detail-drawer="${casePath}"]`);
    await expect(caseDrawer).toHaveAttribute("data-state", "open");
    await caseDrawer
      .getByRole("button", { name: "Conversation and debugging", exact: true })
      .click();
    const url = page.url();
    await fullPage.goto(casePath);
    const caseHeader = fullPage.locator(
      '[data-responsive-surface="detail-header"]',
    );
    await expect(
      caseHeader.getByText("Running", { exact: true }),
    ).toBeVisible();
    await sql`insert into telemetry_events (organization_id,project_id,event_id,schema_version,type,occurred_at,environment,service_name,run_id,session_id,workflow_id,payload) values (${scope.organization_id},${scope.project_id},${randomUUID()},1,'generation.completed',now(),'development','e2e',${session},${session},'catalog',${sql.json({ pricing: { source: "provider", currency: "USD", actualCostMicros: 1200 } })})`;
    await change("runs");
    await expect(
      caseDrawer.getByRole("button", {
        name: "Total cost: $0.0012+",
        exact: true,
      }),
    ).toBeVisible();
    step.status = "passed";
    step.criteria = [
      {
        id: "0",
        text: suite.cases[0].steps[0].expect.criteria[0],
        passed: true,
        reason: "Accurate",
        evidence: ["$10"],
      },
    ];
    step.judgeCalls = 1;
    step.judgeUsage = [
      {
        provider: "openrouter",
        model: "fixture",
        occurredAt: new Date().toISOString(),
        pricing: { source: "provider", currency: "USD", actualCostMicros: 300 },
      },
    ];
    const result: EvalRunResult = {
      id,
      suiteId: suite.id,
      suiteRevision: getEvalSuiteRevision(suite),
      suite,
      startedAt: new Date().toISOString(),
      durationMs: 100,
      status: "passed",
      counts: { passed: 1, failed: 0, error: 0, cancelled: 0 },
      errors: [],
      cases: [
        {
          caseId: "lookup",
          repetition: 1,
          sessionId: session,
          status: "passed",
          durationMs: 100,
          steps: [step],
          errors: [],
        },
      ],
    };
    await sql`update eval_runs set result=${sql.json(JSON.parse(JSON.stringify(result)))},status='passed',ended_at=now() where id=${id}`;
    await change();
    await expect(
      caseDrawer.getByRole("button", {
        name: "Total cost: $0.0015",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      caseDrawer.getByText("Accurate", { exact: true }),
    ).toBeVisible();
    await expect(caseHeader.getByText("Passed", { exact: true })).toBeVisible();
    await expect(
      fullPage.getByRole("button", {
        name: "Total cost: $0.0015",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(url);
    await expect(
      caseDrawer.getByRole("button", {
        name: "Conversation and debugging",
        exact: true,
      }),
    ).toHaveAttribute("aria-expanded", "true");
    await caseDrawer.getByRole("button", { name: "Close detail" }).click();
    await expect(caseDrawer).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(runPath));
    await expect(
      runDrawer
        .locator('[data-row-key="lookup:1"]')
        .getByRole("button", { name: "Total cost: $0.0015", exact: true }),
    ).toBeVisible();
    let reads = 0;
    page.on("request", (request) => {
      if (request.url().includes(`/api/studio/evals/runs/${id}`)) reads++;
    });
    await page.waitForTimeout(3_500);
    expect(reads).toBe(0);
    await runDrawer.getByRole("button", { name: /Live refresh:/ }).click();
    await expect(page).toHaveURL(/live=false/);
    await page.reload();
    await expect(
      page.getByRole("button", { name: /Live refresh: Live updates are off/ }),
    ).toHaveAttribute("aria-pressed", "false");
  } finally {
    await fullPage.close();
    await sql`delete from eval_runs where id=${id}`;
    await sql`delete from telemetry_events where session_id=${session}`;
    await sql.end();
  }
});
