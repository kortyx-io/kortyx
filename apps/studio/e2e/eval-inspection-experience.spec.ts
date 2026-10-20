import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { expect, test } from "@playwright/test";

const suite = `/sample/evals/suites/${sample.targetId}/${sample.suiteId}`;
const evaluation = `/sample/evals/evaluations/${sample.evaluationId}`;

test("suite browsing uses one searchable table and one URL-backed definition inspector", async ({
  page,
}) => {
  await page.goto("/sample/evals/suites?q=Support");
  await page
    .getByRole("link", { name: "Support quality", exact: true })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === suite);
  await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
  await expect(page.locator("[data-row-key]")).toHaveCount(3);
  await page
    .getByRole("button", {
      name: "Shipment status and a follow-up",
      exact: true,
    })
    .click();
  const drawer = page.getByRole("dialog", {
    name: "Shipment status and a follow-up",
    exact: true,
  });
  await expect(
    drawer.getByText("Where is order SAMPLE-42?", { exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(
    drawer.getByText("Will it need a signature?", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("definitionStep") === "1" &&
      url.searchParams.get("suiteCase") === sample.caseId,
  );
  await page.reload();
  await expect(
    drawer.getByText("Will it need a signature?", { exact: true }),
  ).toBeVisible();
  await drawer
    .getByRole("button", { name: "Close conversation definition" })
    .click();
  await page
    .getByPlaceholder("Search conversations…", { exact: true })
    .fill("Locate a delivery note");
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Locate a delivery note", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close conversation definition" })
    .click();
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await page.getByRole("button", { name: "Suites", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/sample/evals/suites" &&
      url.searchParams.get("q") === "Support",
  );
});

test("saved suite context explains its snapshot and settings without reprinting conversations", async ({
  page,
}) => {
  await page.goto(`${evaluation}?suiteRun=${sample.evalRunId}`);
  await page
    .getByRole("button", { name: "Suite details", exact: true })
    .click();
  const drawer = page.getByRole("dialog", {
    name: "Suite details",
    exact: true,
  });
  await expect(
    drawer.getByRole("heading", { name: "Saved definition from this run" }),
  ).toBeVisible();
  await expect(drawer).toContainText("3 conversations · 6 steps");
  await expect(drawer.getByText("Concurrency", { exact: true })).toBeVisible();
  await expect(
    drawer.getByText("Where is order SAMPLE-42?", { exact: true }),
  ).toHaveCount(0);
  await expect(drawer.getByText("Run ID", { exact: true })).toHaveCount(0);
  await drawer
    .getByRole("button", { name: "Additional configuration and identifiers" })
    .click();
  await expect(drawer.getByText("Run ID", { exact: true })).toBeVisible();
});

test("conversation results lead with selected metrics and assessment, with steps and totals separate", async ({
  page,
}) => {
  await page.goto(evaluation);
  await page
    .getByRole("link", { name: "Shipment status and a follow-up", exact: true })
    .click();
  const drawer = page.locator("[data-detail-drawer]").last();
  await expect(drawer.locator("[data-repetition-stats]")).toContainText(
    "$0.008669",
  );
  await expect(drawer.locator("[data-eval-assessment]")).toContainText(
    "Passed",
  );
  const order = await drawer.evaluate((el) => {
    const assessment = el.querySelector("[data-eval-assessment]");
    const conversation = el.querySelector(
      '[data-guide-focus="eval-conversation"]',
    );
    return Boolean(
      assessment &&
        conversation &&
        assessment.compareDocumentPosition(conversation) &
          Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(order).toBe(true);
  await drawer.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(drawer).toContainText("Will it need a signature?");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("caseStep") === "1",
  );
  await drawer
    .getByRole("button", { name: "See more stats", exact: true })
    .click();
  await expect(
    drawer.getByText("Mean cost / repetition", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Step 2 assessment", exact: true }),
  ).toBeVisible();
});

test("comparison aligns assessments and messages, shares step selection and retains repetition costs", async ({
  page,
}) => {
  await page.goto("/sample/evals/runs");
  await page
    .getByRole("button", {
      name: "Inspect changes for Support quality — recorded sample",
      exact: true,
    })
    .click();
  const modal = page.locator("[data-eval-comparison-modal]");
  await expect(modal).toContainText("SAMPLE-42 is in transit");
  for (const section of ["assessment", "conversation"]) {
    const positions = await modal
      .locator(`[data-comparison-section="${section}"]`)
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(positions).toHaveLength(2);
    expect(Math.abs(positions[0] - positions[1])).toBeLessThan(1);
  }
  await modal.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("changeStep") === "1",
  );
  await expect(
    modal.getByRole("heading", { name: "Step 2 assessment", exact: true }),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    modal.getByRole("heading", { name: "Step 2 assessment", exact: true }),
  ).toHaveCount(2);
  await modal.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL((url) => !url.searchParams.has("changeStep"));
});
