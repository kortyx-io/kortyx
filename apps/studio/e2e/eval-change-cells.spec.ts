import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { expect, type Page, test } from "@playwright/test";

const evaluation = `/sample/evals/evaluations/${sample.evaluationId}`;
async function unchangedHeight(page: Page, column: string) {
  const measured = await page.locator("[data-row-key]").evaluateAll(
    (rows, key) =>
      rows.map((row) => {
        const before = row.getBoundingClientRect().height;
        const contents = [
          ...row.querySelectorAll<HTMLElement>(`[data-column="${key}"] > *`),
        ];
        for (const content of contents) content.hidden = true;
        const without = row.getBoundingClientRect().height;
        for (const content of contents) content.hidden = false;
        return { before, without };
      }),
    column,
  );
  expect(measured.length).toBeGreaterThan(0);
  for (const row of measured) expect(row.before).toBe(row.without);
}

test("run change counts and icon open a modal without changing row height or selecting runs", async ({
  page,
}, testInfo) => {
  await page.goto("/sample/evals/runs");
  const row = page.locator("[data-row-key]").filter({
    has: page.getByRole("button", {
      name: "Support quality — recorded sample",
      exact: true,
    }),
  });
  await expect(
    row.getByRole("button", { name: "2 improved", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Compare selected/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: /for comparison/ }),
  ).toHaveCount(0);
  await unchangedHeight(page, "changes");
  expect(
    await page
      .locator("th[data-column]")
      .evaluateAll((headers) =>
        headers.map((header) => header.getAttribute("data-column")),
      ),
  ).toEqual([
    "name",
    "status",
    "progress",
    "results",
    "changes",
    "passRate",
    "duration",
    "cost",
    "application",
    "trigger",
    "judge",
    "judgeVersion",
    "queueMs",
    "created",
  ]);
  const url = page.url();
  const icon = row.getByRole("button", {
    name: "Inspect changes for Support quality — recorded sample",
    exact: true,
  });
  await icon.hover();
  await expect(
    page.getByRole("tooltip", { name: "Open comparison", exact: true }),
  ).toBeVisible();
  await icon.click();
  const modal = page.locator("[data-eval-comparison-modal]");
  await expect(modal).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Earlier repetition", exact: true }),
  ).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "This run repetition", exact: true }),
  ).toBeVisible();
  await expect(modal).toContainText("cannot tell you");
  await expect(
    modal
      .locator("[data-comparison-stats]")
      .getByText("No change", { exact: true }),
  ).toHaveCount(0);
  const currentStats = modal.locator('[data-comparison-side="This run"]');
  await currentStats
    .getByRole("button", { name: /See (more|less) stats/, exact: true })
    .click();
  await expect(currentStats.getByRole("img", { name: /^Errors:/ })).toHaveCount(
    0,
  );
  await expect(
    currentStats.getByRole("img", {
      name: /Pass rate: 100% higher.*improved/,
    }),
  ).toHaveAttribute("data-stat-trend", "better");
  await expect(
    page.locator('[data-detail-drawer][data-state="open"]'),
  ).toHaveCount(0);
  await expect(modal.getByRole("dialog", { name: /About/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("comparison-modal.png") });
  await modal.getByRole("button", { name: "Next", exact: true }).click();
  await expect(modal.locator("footer")).toContainText("2 of 8");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(url);
  await row.getByRole("button", { name: "2 improved", exact: true }).click();
  await expect(modal.locator("footer")).toContainText("1 of 2");
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(row).toBeVisible();
});

test("conversation change preserves filters, loads scoped evidence, supports retry and direct reload", async ({
  page,
}, testInfo) => {
  let caseReads = 0,
    fullReads = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/studio/evals/runs/") && path.endsWith("/case"))
      caseReads++;
    if (path.endsWith("/results") && path.startsWith("/api/studio/evals/"))
      fullReads++;
  });
  await page.goto(`${evaluation}?suiteRun=${sample.evalRunId}`);
  await expect(page.locator("[data-row-key]")).toHaveCount(3);
  await unchangedHeight(page, "change");
  expect(caseReads).toBe(0);
  expect(fullReads).toBe(0);
  const row = page.locator("[data-row-key]").filter({
    has: page.getByRole("link", {
      name: "Shipment status and a follow-up",
      exact: true,
    }),
  });
  let fail = true;
  await page.route(
    `**/api/studio/evals/runs/${sample.evalRunId}/case?**`,
    (route) => {
      if (fail) {
        return route.fulfill({ status: 503, json: { error: "Offline" } });
      }
      return route.continue();
    },
  );
  await row.getByRole("button", { name: "Now passing", exact: true }).click();
  const modal = page.locator("[data-eval-comparison-modal]");
  await expect(
    modal.getByRole("button", { name: "Retry evidence", exact: true }),
  ).toBeVisible();
  fail = false;
  await modal
    .getByRole("button", { name: "Retry evidence", exact: true })
    .click();
  await expect(modal).toContainText("SAMPLE-42 is in transit");
  expect(caseReads).toBeGreaterThanOrEqual(3);
  expect(fullReads).toBe(0);
  await page.reload();
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("cannot tell you");
  await page.screenshot({
    path: testInfo.outputPath("conversation-change.png"),
  });
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(page.locator("[data-row-key]")).toHaveCount(3);
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("suiteRun") === sample.evalRunId &&
      !url.searchParams.has("changeCase"),
  );
  await page
    .getByRole("button", { name: "Comparison baseline", exact: true })
    .click();
  await expect(
    page.getByRole("menuitemradio", { name: /initial baseline/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("comparison modal remains readable on mobile and repetitions stay independent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sample/evals/runs?q=Consistency");
  await page
    .getByRole("button", {
      name: "Consistency check — three repetitions",
      exact: true,
    })
    .click();
  const row = page.locator("[data-row-key]").filter({
    has: page.getByRole("link", {
      name: "Shipment status and a follow-up",
      exact: true,
    }),
  });
  await expect(
    row.getByRole("button", { name: "Started failing", exact: true }),
  ).toBeVisible();
  await unchangedHeight(page, "change");
  await row
    .getByRole("button", { name: "Started failing", exact: true })
    .click();
  const modal = page.locator("[data-eval-comparison-modal]");
  await expect(
    modal.getByRole("button", { name: "This run repetition", exact: true }),
  ).toContainText("Repetition 2");
  const stats = modal.locator(
    '[data-comparison-side="This run"] [data-all-repetitions-stats]',
  );
  const selectedStats = modal.locator(
    '[data-comparison-side="This run"] [data-repetition-stats]',
  );
  await expect(selectedStats).toContainText("Failed");
  const selectedCost = await selectedStats
    .getByRole("button", { name: /^Total cost:/ })
    .getAttribute("aria-label");
  await modal
    .locator('[data-comparison-side="This run"]')
    .getByRole("button", { name: /See (more|less) stats/, exact: true })
    .click();
  await expect(stats).toContainText("67% · 2/3");
  await expect(stats).toContainText("Total execution time");
  await expect(stats).toContainText("Total cost");
  await expect(stats.locator('[data-stat-trend="neutral"]')).toHaveCount(0);
  const beforeStats = await stats.innerText();
  await modal
    .getByRole("button", { name: "This run repetition", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: /Repetition 3/ }).click();
  await expect(
    modal.getByRole("button", { name: "Earlier repetition", exact: true }),
  ).toContainText("Repetition 1");
  await expect(stats).toHaveText(beforeStats, { useInnerText: true });
  await expect(selectedStats).toContainText("Passed");
  await expect(
    modal
      .locator('[data-comparison-side="This run"]')
      .getByRole("region", { name: "This repetition stats", exact: true }),
  ).toContainText("This repetition · 3");
  if (!selectedCost) throw new Error("Missing selected repetition cost");
  await expect(
    selectedStats.getByRole("button", { name: /^Total cost:/ }),
  ).not.toHaveAttribute("aria-label", selectedCost);
  const bounds = await modal.boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(390);
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(page.locator("[data-row-key]")).toHaveCount(2);
});

test("explained eval headers can be dragged and still open their help", async ({
  page,
}) => {
  for (const path of ["/sample/evals/runs", evaluation]) {
    await page.goto(path);
    await expect(page.locator("[data-row-key]").first()).toBeVisible();
    const header = page.locator(
      `th[data-column="${path === evaluation ? "change" : "changes"}"]`,
    );
    const before = await page
      .locator("th[data-column]")
      .evaluateAll((headers) =>
        headers.map((header) => header.getAttribute("data-column")),
      );
    await header.scrollIntoViewIfNeeded();
    const dragHandle = header.locator('[aria-roledescription="sortable"]');
    const helpTrigger = header.getByRole("button", {
      name:
        path === evaluation ? "About Change" : "About Evaluation comparison",
      exact: true,
    });
    const box = await dragHandle.boundingBox();
    if (!box) throw new Error("Missing header");
    await page.mouse.move(box.x + 8, box.y + box.height / 2);
    await page.mouse.down();
    const destination = await page
      .locator(
        `th[data-column="${path === evaluation ? "status" : "results"}"]`,
      )
      .boundingBox();
    if (!destination) throw new Error("Missing target header");
    await page.mouse.move(
      destination.x + destination.width / 2,
      box.y + box.height / 2,
      { steps: 15 },
    );
    await expect(header).toHaveAttribute("data-column-dragging", "true");
    await page.mouse.up();
    await expect
      .poll(() =>
        page
          .locator("th[data-column]")
          .evaluateAll((headers) =>
            headers.map((header) => header.getAttribute("data-column")),
          ),
      )
      .not.toEqual(before);
    await page.mouse.move(5, 600);
    await header.hover();
    await helpTrigger.hover();
    const help = page.getByRole("dialog", {
      name:
        path === evaluation ? "About Change" : "About Evaluation comparison",
      exact: true,
    });
    await expect(help).toBeVisible();
    await helpTrigger.click();
    await expect(help).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("modal changes its baseline, keeps the conversation and recovers from a failed comparison", async ({
  page,
}, testInfo) => {
  await page.goto("/sample/evals/runs?q=Consistency");
  await page
    .getByRole("button", {
      name: "Consistency check — three repetitions",
      exact: true,
    })
    .click();
  const row = page.locator("[data-row-key]").filter({
    has: page.getByRole("link", {
      name: "Shipment status and a follow-up",
      exact: true,
    }),
  });
  await row
    .getByRole("button", { name: "Started failing", exact: true })
    .click();
  const modal = page.locator("[data-eval-comparison-modal]");
  const current = modal.locator('[data-comparison-side="This run"]');
  await current
    .getByRole("button", { name: /See (more|less) stats/, exact: true })
    .click();
  await expect(current).toContainText("67% · 2/3");
  const values = current.locator(
    "[data-all-repetitions-stats] dd > span:first-child",
  );
  const stats = await values.allTextContents();
  await expect(
    current.getByRole("img", { name: /Pass rate: 33.3% lower.*worse/ }),
  ).toBeVisible();
  let fail = true;
  await page.route("**/api/studio/evals/comparison?**", (route) =>
    fail
      ? route.fulfill({ status: 503, json: { error: "Offline" } })
      : route.continue(),
  );
  const trigger = modal.getByRole("button", {
    name: "Comparison baseline",
    exact: true,
  });
  const triggerWidth = (await trigger.boundingBox())?.width ?? 0;
  await trigger.click();
  const menu = page.getByRole("menu");
  expect((await menu.boundingBox())?.width).toBeGreaterThan(triggerWidth);
  await page.getByRole("menuitemradio", { name: /initial baseline/ }).click();
  await expect(
    modal.getByRole("button", { name: "Retry comparison" }),
  ).toBeVisible();
  await expect(current).not.toBeVisible();
  fail = false;
  await modal.getByRole("button", { name: "Retry comparison" }).click();
  await expect(modal).toContainText("Higher pass rate");
  await expect(
    current.getByRole("img", { name: /Pass rate: 66.7% higher.*improved/ }),
  ).toBeVisible();
  await expect(modal.locator('[data-comparison-side="Earlier"]')).toContainText(
    "initial baseline",
  );
  await expect(values).toHaveText(stats);
  await expect(
    modal.getByRole("heading", {
      name: "Shipment status and a follow-up",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "This run repetition", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("modal-baseline-and-stats.png"),
  });
  await trigger.click();
  await expect(page.getByRole("menu")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: testInfo.outputPath("comparison-baseline-menu.png"),
  });
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
  await trigger.click();
  await page.getByRole("menuitemradio", { name: /recorded sample/ }).click();
  await expect(modal).toContainText("Started failing");
  await expect(values).toHaveText(stats);
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    row.getByRole("button", { name: "Started failing", exact: true }),
  ).toBeVisible();
});

test("the runs table loads before background comparisons finish", async ({
  page,
}) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route("**/api/studio/evals/changes?*", async (route) => {
    requested = true;
    await pending;
    await route.continue();
  });
  try {
    await page.goto("/sample/evals/runs", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Evaluation runs", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Support quality — recorded sample",
        exact: true,
      }),
    ).toBeVisible();
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByText("Loading changes…").first()).toBeVisible();
    release();
    await expect(
      page.getByRole("button", { name: "2 improved", exact: true }).first(),
    ).toBeVisible();
  } finally {
    release();
  }
});
