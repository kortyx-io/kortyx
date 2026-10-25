import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { expect, test } from "@playwright/test";

for (const path of [
  "/sample/sessions",
  "/sample/interrupts",
  "/sample/evals?view=runs",
  "/sample/evals/suites",
  `/sample/evals/evaluations/${sample.evaluationId}`,
]) {
  test(`status clicks filter without navigating the row: ${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    const status = page
      .locator(
        'td:is([data-column="status"], [data-column="latest"]) button[aria-label^="Filter "]',
      )
      .first();
    await expect(status).toBeVisible();
    const label = await status.getAttribute("aria-label");
    await status.click();
    await expect(page).toHaveURL((url) =>
      [...url.searchParams.keys()].some((key) =>
        key.startsWith("tableFilters"),
      ),
    );
    await expect(
      page
        .locator(
          'td:is([data-column="status"], [data-column="latest"]) button[aria-pressed="true"]',
        )
        .first(),
    ).toHaveAttribute("aria-label", label ?? "");
    await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
    await page
      .locator(
        'td:is([data-column="status"], [data-column="latest"]) button[aria-pressed="true"]',
      )
      .first()
      .click();
    await expect(page).toHaveURL(
      (url) =>
        ![...url.searchParams.keys()].some((key) =>
          key.startsWith("tableFilters"),
        ),
    );
  });
}

test("filter header and footer follow the table's actual heights", async ({
  page,
}) => {
  await page.goto(`/sample/evals/evaluations/${sample.evaluationId}`);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Filters",
    exact: true,
  });
  await expect(panel).toBeVisible();
  for (const width of [1440, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () => {
        const header = await panel
          .locator(":scope > div")
          .first()
          .boundingBox();
        const controls = await page
          .locator("[data-table-controls]")
          .boundingBox();
        const footer = await panel.locator(":scope > div").last().boundingBox();
        const tableFooter = await page
          .locator("[data-table-footer]")
          .boundingBox();
        if (!header || !controls || !footer || !tableFooter) return 999;
        return Math.max(
          Math.abs(header.y + header.height - controls.y - controls.height),
          Math.abs(footer.y - tableFooter.y),
        );
      })
      .toBeLessThanOrEqual(1);
  }
  await page.screenshot({
    path: test.info().outputPath("aligned-filters.png"),
  });
});

test("events stay on one row beside an inspector and help stays at the right edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(
    "/sample/runs/sample-pending-credit?tab=events&event=sample-pending-credit-event-3",
  );
  const search = page.getByRole("searchbox", {
    name: "Search events",
    exact: true,
  });
  const category = page.getByRole("combobox", {
    name: "Filter event category",
  });
  const status = page.getByRole("combobox", { name: "Filter event status" });
  await expect(search).toBeVisible();
  const inspector = page.locator('[data-detail-inspector][data-state="open"]');
  await expect(inspector).toBeVisible();
  await expect
    .poll(() =>
      inspector.evaluate(
        (element) =>
          element
            .getAnimations()
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(0);
  await expect
    .poll(() =>
      search.evaluate((element) => {
        const container = element.closest('[role="tabpanel"]')?.parentElement;
        return container
          ? Number.parseFloat(getComputedStyle(container).paddingRight)
          : 0;
      }),
    )
    .toBe(480);
  await expect
    .poll(async () => {
      const boxes = await Promise.all([
        search.boundingBox(),
        category.boundingBox(),
        status.boundingBox(),
      ]);
      return (
        Math.max(...boxes.map((box) => box?.y ?? 9999)) -
        Math.min(...boxes.map((box) => box?.y ?? 0))
      );
    })
    .toBeLessThanOrEqual(2);
  const tabs = page
    .locator('[data-page-help="tabs"]')
    .filter({ visible: true })
    .first();
  await expect(tabs.locator('[data-detail-tab="events"]')).toBeInViewport({
    ratio: 0.99,
  });
  const help = tabs.locator('[data-slot="popover-trigger"]');
  const tabsBox = await tabs.boundingBox();
  const rightPadding = await tabs.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).paddingRight),
  );
  const helpBox = await help.boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(
    helpBox && inspectorBox && helpBox.x + helpBox.width <= inspectorBox.x,
  ).toBe(true);
  await help.click();
  await expect(
    page.getByRole("dialog", { name: "About Events", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    tabsBox &&
      helpBox &&
      tabsBox.x + tabsBox.width - rightPadding - helpBox.x - helpBox.width,
  ).toBeLessThan(35);
  await page.screenshot({
    path: test.info().outputPath("events-inspector-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  // Return to the events content on mobile, where the inspector covers it.
  await page.goto("/sample/runs/sample-pending-credit?tab=events");
  await expect(search).toBeVisible();
  await expect
    .poll(() =>
      search.evaluate(
        (element) =>
          (element.closest("header")?.scrollWidth ?? 0) -
          (element.closest("header")?.clientWidth ?? 0),
      ),
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: test.info().outputPath("events-mobile.png") });
});

test("rich cost help owns the hover without an inherited native tooltip", async ({
  page,
}) => {
  await page.goto("/sample/runs");
  const cost = page
    .locator('td[data-column="cost"] [data-slot="popover-trigger"]')
    .first();
  await expect(cost).toBeVisible();
  await cost.hover();
  await expect(
    page.getByRole("dialog", { name: "Model cost", exact: true }),
  ).toBeVisible();
  expect(
    await cost.evaluate((element) => {
      const titled = [];
      for (let node: Element | null = element; node; node = node.parentElement)
        if (node.getAttribute("title")) titled.push(node.getAttribute("title"));
      return titled;
    }),
  ).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("single-cost-help.png"),
  });
});
