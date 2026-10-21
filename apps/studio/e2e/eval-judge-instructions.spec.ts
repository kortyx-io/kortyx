import { expect, test } from "@playwright/test";

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
  await definition.click({ position: { x: 12, y: 35 } });
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === suite && url.searchParams.get("definitionStep") === "1",
  );
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
    .getByRole("button", { name: "See more stats", exact: true })
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
    assessment.getByRole("heading", { name: "2. user message" }),
  ).toBeVisible();
  await expect(assessment.locator("pre").last()).toContainText('"criterion"');
  await expect(assessment.locator("pre").last()).toContainText('"observation"');
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
