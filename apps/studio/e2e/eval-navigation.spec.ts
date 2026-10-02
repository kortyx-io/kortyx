import { expect, test } from "@playwright/test";
import { EVAL_FIXTURE } from "./support/eval-fixture";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const runPath = `/evals/runs/${EVAL_FIXTURE.candidate}`;
const comparePath = `${runPath}/compare?baseline=${EVAL_FIXTURE.baseline}`;
const casePath = `/evals/cases/${EVAL_FIXTURE.candidate}/${EVAL_FIXTURE.caseId}/1`;
const comparisonCasePath = `/evals/cases/${EVAL_FIXTURE.candidate}/${EVAL_FIXTURE.caseId}/compare`;
const workflowPath = `/runs/${DRAWER_FIXTURE.runId}`;
test.describe("Eval route and drawer navigation", () => {
  test("opens Runs by default, reaches Suites, and restores history navigation", async ({
    page,
  }) => {
    await page.goto("/evals");
    await expect(page).toHaveURL(/\/evals\/runs$/);
    await page
      .getByRole("navigation", { name: "Eval navigation" })
      .getByRole("link", { name: "Suites", exact: true })
      .click();
    await expect(page).toHaveURL(/\/evals\/suites$/);
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Suites", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(page).toHaveURL(/\/evals\/runs$/);
  });
  test("restores case selection and keeps evaluation above debugging", async ({
    page,
  }) => {
    await page.goto(runPath);
    await page
      .getByRole("button", { name: "Ambiguous role", exact: true })
      .click();
    await expect(page).toHaveURL(/case=ambiguity%3A1/);
    await page.reload();
    const inspector = page.locator("main").last();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(inspector.getByText("Step 1 evaluation")).toBeVisible();
    await expect(
      inspector.getByRole("button", {
        name: "Conversation and debugging",
        exact: true,
      }),
    ).toHaveAttribute("aria-expanded", "false");
    await inspector
      .getByRole("button", { name: "Conversation and debugging", exact: true })
      .click();
    await expect(page).toHaveURL(/expand\./);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await inspector
      .getByRole("link", { name: "Eval run", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/evals/runs/${EVAL_FIXTURE.candidate}`),
    );
    await page.goBack();
    await expect(page.getByText("Step 1 evaluation")).toBeVisible();
  });
  test("keeps comparison mounted through workflow inspection, close, Back and Forward", async ({
    page,
  }) => {
    await page.goto(comparePath);
    await page
      .getByRole("link", { name: "Ambiguous role", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`${comparisonCasePath}.*baseline=`),
    );
    const comparisonDrawer = page.locator(
      `[data-detail-drawer="${comparisonCasePath}"]`,
    );
    const comparison = comparisonDrawer.getByRole("heading", {
      name: "Ambiguous role",
      exact: true,
    });
    await expect(comparisonDrawer).toBeVisible();
    const node = await comparison.elementHandle();
    await page.getByRole("link", { name: "Inspect workflow" }).last().click();
    const drawer = page.locator(`[data-detail-drawer="${workflowPath}"]`);
    await expect(
      drawer.getByRole("button", { name: "Overview", exact: true }),
    ).toBeVisible();
    expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
    await expect(page).toHaveURL(/baseline=/);
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await drawer
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(comparisonCasePath));
    await expect(comparison).toBeVisible();
    await page.goForward();
    await expect(drawer).toHaveCount(1);
    await page.goBack();
    await expect(comparison).toBeVisible();
    await comparisonDrawer
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(comparisonDrawer).toHaveCount(0);
    await expect(page).toHaveURL(
      new RegExp(`/evals/runs/${EVAL_FIXTURE.candidate}/compare`),
    );
  });
  test("restores the selected case after workflow inspection and reopen", async ({
    page,
  }) => {
    await page.goto(runPath);
    await page
      .getByRole("button", { name: "Ambiguous role", exact: true })
      .click();
    const inspector = page.locator(`[data-detail-drawer="${casePath}"]`);
    await inspector.getByRole("link", { name: "Inspect workflow" }).click();
    const workflow = page.locator(`[data-detail-drawer="${workflowPath}"]`);
    await expect(
      workflow.getByRole("button", { name: "Overview", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await expect(inspector).toHaveAttribute("data-state", "open");
    await workflow
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(workflow).toHaveCount(0);
    await expect(inspector.getByText("Step 1 evaluation")).toBeVisible();
    await inspector.getByRole("button", { name: "Close detail" }).click();
    await expect(inspector).toHaveCount(0);
    await page
      .getByRole("button", { name: "Ambiguous role", exact: true })
      .click();
    await expect(inspector.getByText("Step 1 evaluation")).toBeVisible();
  });
  test("persists comparison filters and attempts in URL", async ({ page }) => {
    await page.goto(comparePath);
    await page.getByRole("button", { name: "Improved", exact: true }).click();
    await expect(page).toHaveURL(/change=improved/);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Improved", exact: true }),
    ).toHaveClass(/secondary/);
    await page
      .getByRole("link", { name: "Ambiguous role", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Candidate attempt", exact: true })
      .click();
    await expect(
      page.getByRole("menuitemradio", { name: "Attempt 1" }),
    ).toBeVisible();
  });
});
