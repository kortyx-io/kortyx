import { randomUUID } from "node:crypto";
import {
  type EvalRunResult,
  type EvalStepResult,
  getEvalSuiteRevision,
} from "@kortyx/agent";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const suite = "/sample/evals/suites/sample-support/sample-resolution-safety";
const result =
  "/sample/evals/cases/10000000-0000-4000-8000-000000000004/order-status/1";

test("definition instructions stack above the conversation, search, expand and restore its state", async ({
  page,
}) => {
  await page.goto(`${suite}?suiteCase=credit-approval&definitionStep=1`);
  const definition = page.getByRole("dialog", {
    name: "Review before creating a credit",
    exact: true,
  });
  await definition
    .getByRole("link", { name: "Judge instructions", exact: true })
    .click();
  const reader = page.getByRole("dialog", {
    name: "Judge instructions",
    exact: true,
  });
  await expect(reader).toBeInViewport();
  // The parent must remain visibly offset behind its child, not fully covered.
  const parentBounds = await definition.boundingBox();
  const childBounds = await reader.boundingBox();
  if (!parentBounds || !childBounds) throw new Error("Missing drawer bounds");
  expect(parentBounds.x).toBeLessThan(childBounds.x - 20);
  await expect(reader).toContainText("Configured Studio judge");
  await expect(reader).toContainText("sample-support-rubric");
  await page.screenshot({ path: "/tmp/kortyx-pr2-stacked-drawers.png" });
  await reader
    .getByRole("searchbox", { name: "Find in judge instructions" })
    .fill("evidence");
  await expect(reader.locator("mark").first()).toBeVisible();
  await expect(reader.getByRole("status")).toContainText("matches");
  await reader
    .getByRole("button", { name: "Expand detail", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("detailView") === "expanded",
  );
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === suite &&
      url.searchParams.get("suiteCase") === "credit-approval" &&
      url.searchParams.get("definitionStep") === "1",
  );
  await expect(definition).toContainText(
    "The answer confirms exactly one credit",
  );
  await page.goForward();
  await expect(reader).toBeInViewport();
  // Forward restores the expanded presentation, which fully covers its parent.
  // Return through its visible navigation before testing the stacked hit target.
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("detailView") === "expanded",
  );
  await reader
    .getByRole("link", { name: "Back to conversation", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === suite && url.searchParams.get("definitionStep") === "1",
  );
  await definition
    .getByRole("link", { name: "Judge instructions", exact: true })
    .click();
  await expect(reader).toBeInViewport();
  await expect(page).not.toHaveURL(/detailView=expanded/);
  await definition.click({ position: { x: 12, y: 35 } });
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === suite && url.searchParams.get("definitionStep") === "1",
  );
});

test("expanded judge history never expands its retained conversation", async ({
  page,
}) => {
  await page.goto(
    "/sample/evals/evaluations/10000000-0000-4000-8000-000000000003",
  );
  await page
    .getByRole("link", { name: "Shipment status and a follow-up", exact: true })
    .click();
  const conversation = page.locator(
    '[data-detail-drawer="/evals/cases/10000000-0000-4000-8000-000000000004/order-status/1"]',
  );
  const openJudge = () =>
    conversation
      .getByRole("link", { name: "Judge instructions", exact: true })
      .click();
  await expect(conversation).toHaveAttribute("data-detail-expanded", "false");
  await openJudge();
  const reader = page.getByRole("dialog", {
    name: "Judge instructions",
    exact: true,
  });
  await reader
    .getByRole("button", { name: "Expand detail", exact: true })
    .click();
  await expect(reader).toHaveAttribute("data-detail-expanded", "true");
  await page.goBack();
  await expect(conversation).toHaveAttribute("data-state", "open");
  await expect(conversation).toHaveAttribute("data-detail-expanded", "false");
  await page.goForward();
  await expect(reader).toHaveAttribute("data-detail-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL((url) => url.pathname === result);
  await expect(conversation).toHaveAttribute("data-detail-expanded", "false");
  await openJudge();
  await expect(reader).toHaveAttribute("data-detail-expanded", "false");
  await expect(conversation).toHaveAttribute("data-detail-expanded", "false");
});

test("saved instructions open from a conversation and survive reload", async ({
  page,
}) => {
  await page.goto(`${result}?caseStep=1`);
  await page
    .getByRole("link", { name: "Judge instructions", exact: true })
    .click();
  const reader = page.getByRole("dialog", {
    name: "Judge instructions",
    exact: true,
  });
  await expect(reader).toBeInViewport();
  await expect(reader).toContainText("Saved snapshot");
  await expect(
    reader.getByRole("heading", { name: "System Message", exact: true }),
  ).toBeVisible();
  await expect(reader.locator('[contenteditable="true"]')).toHaveCount(0);
  await reader
    .getByRole("button", { name: "Close detail", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === result && url.searchParams.get("caseStep") === "1",
  );
  await page
    .getByRole("link", { name: "Judge instructions", exact: true })
    .click();
  await expect(reader).toBeInViewport();
  await page.reload();
  await expect(
    page.getByRole("article", { name: "Judge instruction text" }),
  ).toContainText("Never invent facts or quotes.");
  await page
    .getByRole("link", { name: "Back to conversation", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === result && url.searchParams.get("caseStep") === "1",
  );
});

test("instructions remain readable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${suite}?suiteCase=credit-approval`);
  await page
    .getByRole("link", { name: "Judge instructions", exact: true })
    .click();
  const reader = page.getByRole("dialog", {
    name: "Judge instructions",
    exact: true,
  });
  await expect(reader).toBeInViewport();
  const box = await reader.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);
  await expect(reader.getByRole("searchbox")).toBeVisible();
  await reader
    .getByRole("button", { name: "Close detail", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === suite &&
      url.searchParams.get("suiteCase") === "credit-approval",
  );
});

test("conversation stats expand beneath the summary and the header shows its ID", async ({
  page,
}) => {
  await page.goto(
    "/sample/evals/evaluations/10000000-0000-4000-8000-000000000003",
  );
  await page
    .getByRole("link", { name: "Shipment status and a follow-up", exact: true })
    .click();
  const drawer = page.locator("[data-detail-drawer]").last();
  await expect(drawer.locator("header")).toContainText("order-status");
  await expect(
    drawer.getByRole("heading", { name: /^Selected repetition/ }),
  ).toHaveCount(0);
  const actions = drawer.locator("[data-eval-inspection-actions]");
  await expect(
    actions.getByRole("link", { name: "Inspect workflow", exact: true }),
  ).toHaveCount(1);
  await expect(
    actions.getByRole("link", { name: "Judge instructions", exact: true }),
  ).toHaveCount(1);
  await expect(
    drawer.getByRole("button", { name: "Execution details", exact: true }),
  ).toHaveCount(0);
  await expect(
    drawer.getByRole("region", { name: "This repetition stats", exact: true }),
  ).toHaveCount(0);
  await drawer
    .getByRole("button", { name: /See (more|less) stats/, exact: true })
    .click();
  await expect(
    drawer.getByRole("region", { name: "This repetition stats", exact: true }),
  ).toContainText("Workflow cost");
  await expect(
    drawer.getByRole("region", { name: "All repetitions stats", exact: true }),
  ).toContainText("Mean cost / repetition");
  const ordered = await drawer.evaluate((element) => {
    const summary = element.querySelector("[data-repetition-stats]");
    const details = element.querySelector(
      '[aria-label="This repetition stats"]',
    );
    const aggregate = element.querySelector(
      '[aria-label="All repetitions stats"]',
    );
    const steps = element.querySelector("[data-eval-assessment]");
    return Boolean(
      summary &&
        details &&
        aggregate &&
        steps &&
        summary.compareDocumentPosition(details) &
          Node.DOCUMENT_POSITION_FOLLOWING &&
        details.compareDocumentPosition(aggregate) &
          Node.DOCUMENT_POSITION_FOLLOWING &&
        aggregate.compareDocumentPosition(steps) &
          Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(ordered).toBe(true);
});

test("assessment separates the criterion from the recorded grading messages", async ({
  page,
}) => {
  await page.goto(result);
  const assessment = page.locator("[data-eval-assessment]");
  await assessment
    .getByRole("button", { name: "Assessment details", exact: true })
    .click();
  await assessment
    .getByRole("button", { name: "Grading request", exact: true })
    .click();
  await expect(
    assessment.getByRole("heading", { name: "1. system message" }),
  ).toBeVisible();
  await expect(
    assessment.getByRole("heading", { name: "3. user message" }),
  ).toBeVisible();
  await expect(assessment.locator("pre").last()).toContainText("Criterion:");
  await expect(assessment.locator("pre").last()).toContainText(
    "Current observation:",
  );
  await page.screenshot({
    path: "/tmp/kortyx-pr2-grading-request.png",
    fullPage: true,
  });
});

test("postcondition help explains the separate application check", async ({
  page,
}) => {
  await page.goto(result);
  const verification = page.getByRole("region", {
    name: "Postcondition verification",
    exact: true,
  });
  await expect(verification).toContainText(
    "The order lookup left the saved order unchanged.",
  );
  const help = verification.getByRole("button", {
    name: "About Postcondition verification",
    exact: true,
  });
  await help.focus();
  await expect(
    page.getByRole("dialog", {
      name: "About Postcondition verification",
      exact: true,
    }),
  ).toContainText("separate from the judge");
  await expect(
    page.getByRole("link", { name: /documentation/i }),
  ).toHaveAttribute("href", /evals#postcondition-verification$/);
  await page.keyboard.press("Escape");
  await verification.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/kortyx-pr2-postconditions.png" });
});

test("evaluation header uses refresh icon and keeps Live at the right", async ({
  page,
}) => {
  await page.goto(
    "/sample/evals/evaluations/10000000-0000-4000-8000-000000000003",
  );
  const header = page.locator('[data-tour-surface="eval-summary"]');
  const refresh = header.getByRole("button", {
    name: "Refresh evaluation",
    exact: true,
  });
  const live = header.getByRole("button", { name: /^Live refresh:/ });
  await expect(refresh).toBeVisible();
  await expect(live).toBeVisible();
  const refreshBounds = await refresh.boundingBox();
  const liveBounds = await live.boundingBox();
  if (!refreshBounds || !liveBounds)
    throw new Error("Missing refresh controls");
  expect(liveBounds.x).toBeGreaterThan(refreshBounds.x);
  await page.screenshot({ path: "/tmp/kortyx-pr2-evaluation-header.png" });
});

test("historical judge instructions use recorded grades before finalization and never substitute configured prompts", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const sql = postgres(
    process.env.DATABASE_URL ??
      "postgres://kortyx:kortyx@127.0.0.1:6543/kortyx",
    { max: 1 },
  );
  const id = randomUUID();
  const messages = [
    { role: "system" as const, content: "Recorded Kortyx verdict protocol" },
    {
      role: "system" as const,
      content: "Recorded Workfully system instructions",
    },
    {
      role: "user" as const,
      content: "Recorded rules, city criterion and Barcelona evidence",
    },
  ];
  const savedSuite = {
    id: "saved-judge-history",
    name: "Saved judge history",
    cases: [
      {
        id: "discovery",
        steps: [
          {
            message: "Discover a city",
            expect: {
              type: "answer" as const,
              criteria: ["Report the recorded city"],
            },
          },
        ],
      },
    ],
  };
  const step: EvalStepResult = {
    index: 0,
    input: { message: "Discover a city" },
    expectation: savedSuite.cases[0].steps[0].expect,
    observation: { type: "answer", text: "Barcelona", structured: [] },
    status: "passed",
    criteria: [
      {
        id: "city",
        text: "Report the recorded city",
        passed: true,
        reason: "Correct",
        evidence: [],
        request: { protocol: "eval-verdict-v1", messages },
      },
    ],
  };
  const execution: EvalRunResult = {
    id,
    suiteId: savedSuite.id,
    suiteRevision: getEvalSuiteRevision(savedSuite),
    suite: savedSuite,
    judge: {
      id: "saved-model",
      version: "1",
      prompt: {
        id: "saved/judge",
        version: 1,
        hash: "a".repeat(64),
        content: {
          format: "system-user",
          messages: [
            { role: "system", content: "Final saved snapshot instructions" },
            { role: "user", content: "Saved template: {{criterion.text}}" },
          ],
          variablesSchema: {},
          configSchema: {},
          config: {},
          dependencies: [],
        },
      },
    },
    startedAt: "2026-10-23T00:00:00Z",
    durationMs: 10,
    status: "passed",
    counts: { passed: 1, failed: 0, error: 0, cancelled: 0 },
    errors: [],
    cases: [
      {
        caseId: "discovery",
        repetition: 1,
        sessionId: id,
        status: "passed",
        durationMs: 10,
        errors: [],
        steps: [step],
      },
    ],
  };
  try {
    const [scope] =
      await sql`select organization_id,project_id from studio_runs where run_id=${DRAWER_FIXTURE.runId} limit 1`;
    if (!scope) throw new Error("Seed the drawer fixture first");
    await sql`insert into eval_runs (id,organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,request,requested_by,status) values (${id},${scope.organization_id},${scope.project_id},'development','e2e-saved-judge','Saved judge history',${savedSuite.id},${execution.suiteRevision},${sql.json(savedSuite)},${sql.json({ suiteId: savedSuite.id, suiteRevision: execution.suiteRevision, repetitions: 1, judge: { id: "configured-only", version: "2", instructions: "Queued configuration must not replace history" } })},'e2e','running')`;
    await sql`insert into eval_run_events (run_id,organization_id,project_id,event) values (${id},${scope.organization_id},${scope.project_id},${sql.json(JSON.parse(JSON.stringify({ type: "step-completed", caseId: "discovery", repetition: 1, step })))})`;
    await page.goto(`/evals/judges/run/${id}?caseId=discovery&repetition=1`);
    const reader = page
      .locator("[data-judge-instructions]")
      .filter({ visible: true });
    await expect(reader).toContainText("Recorded grading request");
    await expect(reader).toContainText(
      "final judge snapshot is not yet available",
    );
    await expect(reader.locator("pre")).toHaveCount(3);
    for (const message of messages)
      await expect(reader).toContainText(message.content);
    await expect(reader).not.toContainText(
      "Queued configuration must not replace history",
    );
    await expect(reader).not.toContainText("Instructions not recorded.");

    // A second grading call must be selectable, never combined with the first.
    const firstCriterion = step.criteria[0];
    if (!firstCriterion) throw new Error("Expected the recorded criterion");
    step.criteria.push({
      ...firstCriterion,
      id: "second",
      text: "Second criterion",
      request: {
        protocol: "eval-verdict-v1",
        messages: [
          { role: "user", content: "Evidence for the second criterion only" },
        ],
      },
    });
    await sql`insert into eval_run_events (run_id,organization_id,project_id,event) values (${id},${scope.organization_id},${scope.project_id},${sql.json(JSON.parse(JSON.stringify({ type: "step-completed", caseId: "discovery", repetition: 1, step })))})`;
    await page.reload();
    await reader
      .getByRole("button", { name: "Recorded grading request", exact: true })
      .click();
    await page
      .getByRole("menuitemradio")
      .filter({ hasText: "Second criterion" })
      .click();
    await expect(reader.locator("pre")).toHaveCount(1);
    await expect(reader).toContainText(
      "Evidence for the second criterion only",
    );

    await sql`update eval_runs set status='cancelled',ended_at=now() where id=${id}`;
    await page.reload();
    await expect(reader).toContainText("The judge snapshot is unavailable.");
    await expect(reader).toContainText(messages[1].content);

    await sql`update eval_runs set status='passed',result=${sql.json(JSON.parse(JSON.stringify(execution)))} where id=${id}`;
    await page.reload();
    await expect(reader).toContainText("Saved snapshot");
    await expect(reader).toContainText("Final saved snapshot instructions");
    await expect(reader).toContainText("{{criterion.text}}");
    await expect(reader).not.toContainText("Recorded grading request");

    // Older completed executions may have neither a prompt snapshot nor messages.
    execution.judge = { id: "historical-model", version: "1" };
    const { request: _recordedRequest, ...historicalCriterion } =
      firstCriterion;
    step.criteria = [historicalCriterion];
    await sql`delete from eval_run_events where run_id=${id}`;
    await sql`update eval_runs set result=${sql.json(JSON.parse(JSON.stringify(execution)))} where id=${id}`;
    await page.reload();
    await expect(reader).toContainText("Instructions not recorded.");
    await expect(reader).not.toContainText(
      "Queued configuration must not replace history",
    );
    await expect(reader).not.toContainText("not yet available");

    await sql`update eval_runs set status='running',result=null,ended_at=null where id=${id}`;
    await page.reload();
    await expect(reader).toContainText(
      "No grading requests have been recorded yet.",
    );
    await expect(reader).not.toContainText("Instructions not recorded.");
  } finally {
    await sql`delete from eval_runs where id=${id}`;
    await sql.end();
  }
});
