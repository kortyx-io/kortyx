import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { expect, test } from "@playwright/test";
import { EVAL_FIXTURE } from "./support/eval-plan";

const evaluationPath = `/sample/evals/evaluations/${sample.evaluationId}`;
test("keeps suite context, previews its table facts, and opens conversation evidence in a platform drawer", async ({
  page,
}, testInfo) => {
  let fullReads = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname ===
      `/api/studio/evals/runs/${sample.evalRunId}`
    )
      fullReads++;
  });
  await page.goto(evaluationPath);
  await expect(page.locator("[data-row-key]")).toHaveCount(8);
  const table = await page
    .getByRole("table")
    .filter({ has: page.locator("[data-row-key]") })
    .elementHandle();
  await expect(
    page.getByRole("button", { name: "All conversations", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const navigation = page.getByRole("navigation", {
    name: "Evaluation suites",
  });
  const suite = navigation.getByRole("button", { name: /^Support quality / });
  await suite.hover();
  const preview = page.getByRole("tooltip");
  await expect(preview).toContainText("3 / 3 recorded outcomes");
  for (const fact of [
    "Passed",
    "Workflow cost",
    "Judge cost",
    "Total cost",
    "Duration",
    "Pass rate",
    "Queue time",
  ])
    await expect(preview).toContainText(fact);
  const passedLegend = page
    .locator('[data-slot="tooltip-content"] dl dt')
    .filter({ hasText: /^Passed$/ })
    .first();
  await expect(passedLegend.locator("span")).toHaveCSS(
    "background-color",
    await suite
      .locator('[data-status="passed"]')
      .evaluate((element) => getComputedStyle(element).fill),
  );
  await page.screenshot({ path: testInfo.outputPath("suite-preview.png") });
  const otherSuite = navigation
    .getByRole("button")
    .filter({ hasNotText: /^(Support quality |All conversations$)/ })
    .first();
  const otherName = await otherSuite
    .locator("span.block.truncate")
    .first()
    .innerText();
  await otherSuite.hover();
  await expect(preview).toHaveCount(1);
  await expect(preview).toContainText(otherName);
  await suite.hover();
  await expect(preview).toHaveCount(1);
  await expect(preview).toContainText("Support quality");
  await suite.focus();
  await expect(preview).toBeVisible();
  await suite.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === evaluationPath &&
      url.searchParams.get("suiteRun") === sample.evalRunId,
  );
  await expect(
    page.locator(`[data-eval-run-id="${sample.evalRunId}"]`),
  ).toBeVisible();
  await expect(page.locator("[data-row-key]")).toHaveCount(3);
  await expect(
    page
      .locator('[data-column="case"]')
      .filter({ hasText: sample.caseId })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Evaluation suites" })
      .locator('[data-status="passed"]')
      .first(),
  ).toBeVisible();
  expect(await table?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(
    page
      .locator(`[data-eval-run-id="${sample.evalRunId}"]`)
      .getByRole("heading"),
  ).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page
    .getByRole("button", { name: /^Total cost:/ })
    .first()
    .hover();
  await expect(
    page.getByRole("dialog", { name: "Evaluation cost", exact: true }),
  ).toContainText("Workflow:");
  await expect(
    page.getByRole("dialog", { name: "Evaluation cost", exact: true }),
  ).toContainText("Judge:");
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("suite-workspace.png"),
    animations: "disabled",
  });

  await page
    .getByRole("link", { name: "Shipment status and a follow-up", exact: true })
    .click();
  const drawer = page.locator(
    `[data-detail-drawer="/evals/cases/${sample.evalRunId}/${sample.caseId}/1"]`,
  );
  await expect(drawer).toHaveAttribute("data-state", "open");
  await expect(
    drawer.getByRole("button", { name: "Repetition", exact: true }),
  ).toContainText("Repetition 1");
  await expect(
    drawer.getByRole("button", { name: /See (more|less) stats/, exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByText("Agent answer", { exact: true }).first(),
  ).toBeVisible();
  await drawer
    .getByRole("button", { name: "Close detail", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === evaluationPath &&
      url.searchParams.get("suiteRun") === sample.evalRunId,
  );
  await page.reload();
  await expect(
    page.locator('[data-detail-tab-content="cases"][aria-hidden="false"]'),
  ).toBeVisible();
  expect(fullReads).toBe(0);
  await expect(page.locator('[data-page-help="tabs"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Suite details", exact: true }),
  ).toHaveCount(0);
  const detailsUrl = new URL(page.url());
  detailsUrl.searchParams.set("evalTab", "definition");
  await page.goto(detailsUrl.toString());
  const details = page.getByRole("dialog", {
    name: "Suite details",
    exact: true,
  });
  await expect(details).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("suite-details.png"),
    animations: "disabled",
  });
  await expect(
    page.getByRole("heading", {
      name: "Saved definition from this run",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    details.getByRole("heading", { name: "Execution settings", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(details).toBeVisible();
  await details
    .getByRole("button", { name: "Close suite details", exact: true })
    .click();
  await expect(details).toHaveCount(0);
  await expect(page.locator("[data-row-key]")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Compare run", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Run details", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Recorded execution settings", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Execution settings and run metadata",
      exact: true,
    }),
  ).toContainText("Repetitions");
  await page.keyboard.press("Escape");
});

test("compares saved evaluations across suites and restores comparison after closing a case", async ({
  page,
}, testInfo) => {
  await page.goto(
    `/sample${evaluationPath.replace("/sample", "")}/compare?baseline=${sample.evaluationIds.baseline}`,
  );
  await expect(
    page.getByRole("button", { name: "Compare selected", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("[data-row-key]")).toHaveCount(8);
  await page.screenshot({ path: testInfo.outputPath("comparison.png") });
  await page
    .getByRole("link", { name: "Shipment status and a follow-up", exact: true })
    .click();
  const drawer = page.locator(
    `[data-detail-drawer="/evals/cases/${sample.evalRunId}/${sample.caseId}/compare"]`,
  );
  await expect(drawer).toHaveAttribute("data-state", "open");
  await expect(
    drawer.getByRole("button", { name: "Baseline repetition", exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Candidate repetition", exact: true }),
  ).toBeVisible();
  await drawer
    .getByRole("button", { name: "Close detail", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) => url.pathname === `${evaluationPath}/compare`,
  );
  await page.getByRole("button", { name: /Not comparable/ }).click();
  await expect(page.locator("[data-row-key]")).toHaveCount(3);
});

test("groups mixed repetitions in one row and restores individual evidence on reload", async ({
  page,
}, testInfo) => {
  await page.goto(`/evals/runs/${EVAL_FIXTURE.repeatedCandidate}`);
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await expect(page.locator('[data-row-key="repeated-role"]')).toContainText(
    "Mixed results",
  );
  await expect(page.locator('[data-row-key="repeated-role"]')).toContainText(
    "1 of 2 passed",
  );
  await page.screenshot({
    path: testInfo.outputPath("grouped-repetitions.png"),
  });
  await page.getByRole("link", { name: "Repeated role", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("button", { name: "Repetition", exact: true }),
  ).toContainText("Repetition 2");
  await drawer.getByRole("button", { name: "Repetition", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /^Repetition 1 ·/ }).click();
  await expect(page).toHaveURL(/repetition=1/);
  await expect(
    drawer.getByRole("heading", { name: "Step 1 assessment", exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByText("The selected role description is missing.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Repetition", exact: true }),
  ).toContainText("Repetition 1");
});

test("keeps suite navigation and conversation drawers usable on a narrow screen", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${evaluationPath}?suiteRun=${sample.evalRunId}`);
  await expect(
    page.getByRole("navigation", { name: "Evaluation suites" }),
  ).toBeVisible();
  const conversation = page.getByRole("link", {
    name: "Shipment status and a follow-up",
    exact: true,
  });
  await expect(conversation).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
  await conversation.click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("button", { name: "Repetition", exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: /See (more|less) stats/, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mobile-drawer.png"),
    animations: "disabled",
  });
  await drawer
    .getByRole("button", { name: "Close detail", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("suiteRun") === sample.evalRunId,
  );
});

test("filters one conversation table across suites and restores All conversations after inspecting a case", async ({
  page,
}, testInfo) => {
  let compactReads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/live")) compactReads++;
  });
  await page.goto(evaluationPath);
  await expect(page.locator("[data-row-key]")).toHaveCount(8);
  const table = await page
    .getByRole("table")
    .filter({ has: page.locator("[data-row-key]") })
    .elementHandle();
  const navigation = page.getByRole("navigation", {
    name: "Evaluation suites",
  });
  const search = page.getByRole("searchbox", {
    name: "Search conversations",
    exact: true,
  });
  await search.fill("Shipment");
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("tableSearch.evaluation-conversations") ===
      "Shipment",
  );
  const toolbar = page.locator(
    '[data-table-controls="evaluation-conversations"]',
  );
  const toolbarTop = (await toolbar.boundingBox())?.y;
  const readsBeforeFilter = compactReads;
  await navigation.getByRole("button", { name: /^Support quality / }).click();
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await expect
    .poll(async () => (await toolbar.boundingBox())?.y)
    .toBe(toolbarTop);
  await page.screenshot({
    path: testInfo.outputPath("filtered-conversations.png"),
    animations: "disabled",
  });
  await navigation
    .getByRole("button", { name: "All conversations", exact: true })
    .click();
  await expect(search).toHaveValue("Shipment");
  await expect(page).toHaveURL((url) => !url.searchParams.has("suiteRun"));
  expect(compactReads).toBe(readsBeforeFilter);
  expect(await table?.evaluate((element) => element.isConnected)).toBe(true);
  await search.clear();
  await expect(page.locator("[data-row-key]")).toHaveCount(8);
  await page.screenshot({
    path: testInfo.outputPath("all-conversations.png"),
    animations: "disabled",
  });
  const otherSuiteCase = page
    .locator("[data-row-key]")
    .filter({
      has: page
        .locator('[data-column="suite"]')
        .getByText("Resolution safety", { exact: true }),
    })
    .first()
    .getByRole("link");
  const href = await otherSuiteCase.getAttribute("href");
  await otherSuiteCase.click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("button", { name: "Repetition", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(
    new URL(href ?? "", page.url()).pathname,
  );
  await drawer
    .getByRole("button", { name: "Close detail", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === evaluationPath && !url.searchParams.has("suiteRun"),
  );
  await expect(page.locator("[data-row-key]")).toHaveCount(8);
  await otherSuiteCase.click();
  await expect(page).toHaveURL(
    (url) => url.pathname === new URL(href ?? "", page.url()).pathname,
  );
  await expect(drawer).toHaveCount(1);
  await page.reload();
  await expect(drawer).toHaveCount(0);
  await page
    .getByRole("link", { name: "Evaluation results", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === evaluationPath && !url.searchParams.has("suiteRun"),
  );
  await expect(page.locator("[data-row-key]")).toHaveCount(8);
});

test("sample consistency runs expose two and three repetitions across two suites", async ({
  page,
}, testInfo) => {
  await page.goto("/sample/evals/runs?q=Consistency");
  await page
    .getByRole("button", {
      name: "Consistency check — three repetitions",
      exact: true,
    })
    .click();
  await expect(page.locator("[data-row-key]")).toHaveCount(2);
  await expect(
    page.locator("[data-row-key]").filter({ hasText: "Shipment status" }),
  ).toContainText("Mixed results");
  await expect(
    page.locator("[data-row-key]").filter({ hasText: "Shipment status" }),
  ).toContainText("2 of 3 passed");
  await page.getByRole("button", { name: /^Support quality/ }).click();
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "All conversations", exact: true })
    .click();
  await expect(page.locator("[data-row-key]")).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("multisuite-repetitions.png"),
  });
  await page
    .getByRole("link", { name: "Shipment status and a follow-up", exact: true })
    .click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("button", { name: "Repetition", exact: true }),
  ).toContainText("Repetition 2");
  await drawer.getByRole("button", { name: "Repetition", exact: true }).click();
  await expect(page.getByRole("menuitemradio")).toHaveCount(3);
  await page.getByRole("menuitemradio", { name: /^Repetition 3/ }).click();
  await expect(drawer).toContainText(/in transit/i);
  await page.goto("/sample/evals/runs?q=Consistency");
  await page
    .getByRole("button", {
      name: "Consistency check — two repetitions",
      exact: true,
    })
    .click();
  await expect(page.locator("[data-row-key]")).toHaveCount(2);
  await expect(page.locator("[data-row-key]").first()).toContainText(
    "2 of 2 passed",
  );
});

test("shared headers use available width before truncating a label", async ({
  page,
}) => {
  await page.goto(evaluationPath);
  await expect(page.locator("[data-row-key]")).toHaveCount(8);
  const header = page.locator('th[data-column="cost"]');
  const handle = header.getByRole("button", {
    name: "Resize Total cost column",
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error("Missing resize handle");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 - 30,
    bounds.y + bounds.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await page
    .locator('[data-tour-surface="evaluation-metrics"]')
    .click({ position: { x: 1, y: 1 } });
  await page.mouse.move(0, 0);
  const title = header
    .getByRole("button", { name: "Total cost", exact: true })
    .locator("span")
    .first();
  await expect
    .poll(() =>
      title.evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeLessThanOrEqual(1);
});

test("inline conversation tables keep a flush filter panel and native full-text titles", async ({
  page,
}) => {
  await page.goto(
    `/sample/evals/evaluations/${sample.evaluationId}?suiteRun=${sample.evalRunId}`,
  );
  const table = page
    .locator('[data-table-controls="evaluation-conversations"]')
    .locator("..");
  await table.getByRole("button", { name: "Filters", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Filters",
    exact: true,
  });
  await expect(panel).toBeVisible();
  expect(
    await panel.evaluate((el) => getComputedStyle(el).borderTopRightRadius),
  ).toBe("0px");
  expect(
    await panel.evaluate((el) => getComputedStyle(el).borderLeftWidth),
  ).toBe("0px");
  await panel
    .getByRole("button", { name: "Close filters", exact: true })
    .click();
  const cell = page.locator('[data-row-key] td[data-column="case"]').first();
  await cell.hover();
  await expect(cell).toHaveAttribute("title", /Shipment status/);
  await expect(cell).toContainText(sample.caseId);
  const suiteCell = page
    .locator('[data-row-key] td[data-column="suite"]')
    .first();
  await expect(suiteCell).toHaveAttribute("title", /Support quality/);
  await expect(
    page.getByRole("button", { name: "Suite details", exact: true }),
  ).toHaveCount(0);
});

test("evaluation metrics remain visible without horizontal scrolling on narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(evaluationPath);
  const metrics = page.locator('[data-tour-surface="evaluation-metrics"]');
  await expect(metrics).toContainText("Execution settings");
  expect(
    await metrics.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const bounds = await metrics.boundingBox();
  if (!bounds) throw new Error("Missing evaluation metrics");
  for (const metric of await metrics.locator(":scope > div").all()) {
    const box = await metric.boundingBox();
    if (!box) throw new Error("Missing metric");
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
  }
});
