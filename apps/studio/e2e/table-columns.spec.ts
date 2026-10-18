import { expect, type Locator, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

test("overlay scrollbars reserve no space and headers align through horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 500 });
  await page.goto("/runs?range=All+time&q=e2e-ktx25");
  const row = page.locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`);
  await expect(row).toBeVisible();
  const viewport = page.locator(".data-table-body-scroll");
  await expect(viewport).toHaveCSS("scrollbar-width", "none");
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollHeight > el.clientHeight))
    .toBe(true);
  const vertical = viewport
    .locator("..")
    .locator(
      '[data-orientation="vertical"][data-slot="scroll-area-scrollbar"]',
    );
  await expect(vertical).toBeVisible();
  await expect(vertical).toHaveCSS("position", "absolute");
  await expect
    .poll(() =>
      viewport.evaluate(
        (el) => el.getBoundingClientRect().width - el.clientWidth,
      ),
    )
    .toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const header = document.querySelector(".data-table-header-scroll")!;
        const body = document.querySelector(".data-table-body-scroll")!;
        return Math.abs(header.clientWidth - body.clientWidth);
      }),
    )
    .toBeLessThan(1);
  for (const fraction of [0, 0.5, 1, 0]) {
    await page.locator(".data-table-body-scroll").evaluate((el, fraction) => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) * fraction;
    }, fraction);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const header = document.querySelector(".data-table-header-scroll")!;
          const body = document.querySelector(".data-table-body-scroll")!;
          return Math.abs(header.scrollLeft - body.scrollLeft);
        }),
      )
      .toBeLessThan(1);
    const headers = await page.locator("thead th").all();
    for (const header of headers) {
      const key = await header.getAttribute("data-column");
      const head = (await header.boundingBox())!;
      const cell = (await row
        .locator(`td[data-column="${key}"]`)
        .boundingBox())!;
      expect(Math.abs(head.x - cell.x), key!).toBeLessThan(1);
      expect(Math.abs(head.width - cell.width), key!).toBeLessThan(1);
    }
  }
});

test("column drag stays aligned while scrolling the header and body, above pinned columns", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 850 });
  await page.goto(`/runs?range=All+time&q=${DRAWER_FIXTURE.runId}`);
  const row = page.locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`);
  await expect(row).toBeVisible();
  await pin(page, "Workflows", "left");
  await pin(page, "Result", "right");
  await page
    .locator(".data-table-header-scroll, .data-table-body-scroll")
    .evaluateAll((elements) =>
      elements.forEach((el) => {
        el.scrollLeft = 0;
      }),
    );
  const header = page.locator('th[data-column="status"]');
  const cell = row.locator('td[data-column="status"]');
  const box = (await header.boundingBox())!;
  const x = box.x + 35,
    y = box.y + box.height / 2;
  const geometry = () =>
    page.evaluate(() => {
      const head = document.querySelector(".data-table-header-scroll")!;
      const body = document.querySelector(".data-table-body-scroll")!;
      return {
        header: head.scrollLeft,
        body: body.scrollLeft,
        headerWidth: head.scrollWidth,
        bodyWidth: body.scrollWidth,
      };
    });
  const original = await geometry();
  const order = await page
    .locator("thead th")
    .evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute("data-column")),
    );
  await page.mouse.move(x, y);
  await page.mouse.down();
  try {
    await page.mouse.move(x + 35, y, { steps: 5 });
    await expect(header).toHaveAttribute("data-column-dragging", "true");
    const draggedLeft = (await header.boundingBox())!.x;
    await page.mouse.wheel(220, 0);
    await expect
      .poll(async () => (await geometry()).header)
      .toBeGreaterThan(100);
    await expect
      .poll(async () =>
        Math.abs((await geometry()).header - (await geometry()).body),
      )
      .toBeLessThan(1);
    await expect
      .poll(async () => Math.abs((await header.boundingBox())!.x - draggedLeft))
      .toBeLessThan(2);
    await expect
      .poll(async () =>
        Math.abs(
          (await header.boundingBox())!.x - (await cell.boundingBox())!.x,
        ),
      )
      .toBeLessThan(2);
    expect((await geometry()).headerWidth).toBe(original.headerWidth);
    expect((await geometry()).bodyWidth).toBe(original.bodyWidth);
    for (const [active, pinned] of [
      [header, page.locator('th[data-column="workflow"]')],
      [cell, row.locator('td[data-column="workflow"]')],
    ]) {
      const z = await active.evaluate((el) =>
        Number(getComputedStyle(el).zIndex),
      );
      expect(z).toBeGreaterThan(
        await pinned.evaluate((el) => Number(getComputedStyle(el).zIndex)),
      );
    }
    // Trackpad scrolling over the body while still holding the same header.
    await page.locator(".data-table-body-scroll").evaluate((el) => {
      el.scrollLeft += 120;
    });
    await expect.poll(async () => (await geometry()).body).toBeGreaterThan(300);
    await expect
      .poll(async () =>
        Math.abs((await geometry()).header - (await geometry()).body),
      )
      .toBeLessThan(1);
    await expect
      .poll(async () => Math.abs((await header.boundingBox())!.x - draggedLeft))
      .toBeLessThan(2);
    await expect
      .poll(async () =>
        Math.abs(
          (await header.boundingBox())!.x - (await cell.boundingBox())!.x,
        ),
      )
      .toBeLessThan(2);
    await page.keyboard.press("Escape");
  } finally {
    await page.mouse.up();
  }
  await expect
    .poll(() =>
      page
        .locator("thead th")
        .evaluateAll((cells) =>
          cells.map((cell) => cell.getAttribute("data-column")),
        ),
    )
    .toEqual(order);
  await expect(header).toHaveCSS("transform", "none");
  // A dragged sticky column must not receive scroll compensation twice.
  await pin(page, "Status", "left");
  const pinnedBox = (await header.boundingBox())!;
  await page.mouse.move(pinnedBox.x + 35, pinnedBox.y + pinnedBox.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(
      pinnedBox.x + 60,
      pinnedBox.y + pinnedBox.height / 2,
      { steps: 5 },
    );
    await expect(header).toHaveAttribute("data-column-dragging", "true");
    const left = (await header.boundingBox())!.x;
    const scrollBeforePinnedDrag = (await geometry()).header;
    await page.mouse.wheel(120, 0);
    await expect
      .poll(async () => (await geometry()).header)
      .toBeGreaterThan(scrollBeforePinnedDrag + 100);
    await expect
      .poll(async () => Math.abs((await header.boundingBox())!.x - left))
      .toBeLessThan(2);
    await expect
      .poll(async () =>
        Math.abs(
          (await header.boundingBox())!.x - (await cell.boundingBox())!.x,
        ),
      )
      .toBeLessThan(2);
    await page.keyboard.press("Escape");
  } finally {
    await page.mouse.up();
  }
  const from = (await header.boundingBox())!;
  const expectedFirst =
    (await page.locator("thead th").first().getAttribute("data-column")) ===
    "status"
      ? "workflow"
      : "status";
  const to = (await page.locator('th[data-column="workflow"]').boundingBox())!;
  await page.mouse.move(from.x + 35, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 10,
  });
  await expect(header).toHaveAttribute("data-column-dragging", "true");
  await page.mouse.up();
  await expect(page.locator("thead th").first()).toHaveAttribute(
    "data-column",
    expectedFirst,
  );
  await expect(row.locator("td").first()).toHaveAttribute(
    "data-column",
    expectedFirst,
  );
  await expect(header).not.toHaveAttribute("data-column-dragging", "true");
});

test("all columns start visible and Reset layout shows every column again", async ({
  page,
}) => {
  await page.goto("/runs?range=All+time");
  await expect(page.locator("thead th")).toHaveCount(18);
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Environment", exact: true })
    .click();
  await expect(page.locator("thead th")).toHaveCount(17);
  await page.getByRole("button", { name: "Reset layout", exact: true }).click();
  await expect(page.locator("thead th")).toHaveCount(18);
  await expect(
    page.getByRole("checkbox", { name: "Environment", exact: true }),
  ).toBeChecked();
  await page.screenshot({ path: "/tmp/kortyx-all-columns-reset.png" });
});

async function rowColors(row: Locator) {
  return row.locator("td").evaluateAll(async (cells) => {
    await Promise.all(
      cells.flatMap((cell) =>
        cell.getAnimations().map((animation) => animation.finished),
      ),
    );
    return cells.map((cell) => getComputedStyle(cell).backgroundColor);
  });
}

async function pin(page: Page, label: string, side: "left" | "right") {
  const menu = page.getByRole("button", {
    name: `${label} column menu`,
    exact: true,
  });
  await menu.locator("..").hover();
  await menu.click();
  await page.getByRole("button", { name: `Pin ${side}`, exact: true }).click();
}

async function expectSyncedHover(page: Page, row: Locator, pinned: string) {
  await page.getByRole("searchbox").hover();
  const base = await rowColors(row);
  expect(new Set(base).size).toBe(1);
  const unpinned = row.locator("td:not(.sticky)").first();
  await unpinned.hover();
  await expect.poll(async () => new Set(await rowColors(row)).size).toBe(1);
  await expect.poll(async () => (await rowColors(row))[0]).not.toBe(base[0]);
  const highlighted = await rowColors(row);
  await row.locator(`td[data-column="${pinned}"]`).hover();
  await expect.poll(() => rowColors(row)).toEqual(highlighted);
}

test("root hover synchronizes pinned cells on clickable runs and exposes identity columns", async ({
  page,
}) => {
  await page.goto(`/runs?range=All+time&q=${DRAWER_FIXTURE.runId}`);
  const row = page.locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('[data-column="userId"]')).toBeVisible();
  await expect(row.locator('[data-column="tenantId"]')).toBeVisible();
  await pin(page, "Workflows", "left");
  await expectSyncedHover(page, row, "workflow");
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  for (const label of ["Environment", "Run ID", "Ended", "Pricing status"])
    await expect(
      page.getByRole("checkbox", { name: label, exact: true }),
    ).toBeVisible();
});

test("root hover also applies to prompt rows without a row click handler, including right pins", async ({
  page,
  request,
}) => {
  const key = "e2e-table-columns/hover";
  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await db`delete from prompt_assets where key=${key}`;
    const response = await request.post(
      `${process.env.KORTYX_API_URL}/v1/studio/prompts/actions`,
      {
        headers: {
          authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY}`,
        },
        data: {
          action: "create",
          key,
          name: "Shared hover prompt",
          content: {
            format: "system-user",
            messages: [
              { role: "system", content: "Test" },
              { role: "user", content: "Test" },
            ],
            variablesSchema: { type: "object" },
            configSchema: { type: "object" },
            config: {},
            dependencies: [],
          },
        },
      },
    );
    expect(response.ok(), await response.text()).toBe(true);
    const { id } = await response.json();
    await page.goto(`/prompts?q=${encodeURIComponent(key)}`);
    const row = page.locator(`[data-row-key="${id}"]`);
    await expect(row).toBeVisible();
    await pin(page, "Prompt", "left");
    await pin(page, "Actions", "right");
    await expectSyncedHover(page, row, "name");
    await row.locator('[data-column="actions"]').hover();
    await expect.poll(async () => new Set(await rowColors(row)).size).toBe(1);
  } finally {
    await db`delete from prompt_assets where key=${key}`;
    await db.end();
  }
});

for (const [path, tableId] of [
  ["/runs?range=All+time", "runs"],
  ["/sessions?range=All+time", "sessions"],
  ["/interrupts?range=All+time", "interrupts"],
  ["/prompts", "prompts"],
  ["/prompts/groups", "prompt-groups"],
  ["/evals/runs", "evaluations"],
  ["/evals/suites", "eval-suites"],
] as const) {
  test(`column chooser reorders, hides and restores the same layout on ${tableId}`, async ({
    page,
  }) => {
    await page.goto(path);
    const table = page
      .locator(`[data-table-controls="${tableId}"]`)
      .locator("..");
    await expect(table.locator("thead th").first()).toBeVisible();
    const before = await table
      .locator("thead th")
      .evaluateAll((cells) =>
        cells.map((cell) => cell.getAttribute("data-column")),
      );
    await table.getByRole("button", { name: "Columns", exact: true }).click();
    const options = page.locator("[data-column-option]");
    const first = options.nth(0);
    const label = await first.locator("label").innerText();
    await first
      .getByRole("button", { name: `Move ${label} right`, exact: true })
      .click();
    const expected = [before[1], before[0], ...before.slice(2)];
    await expect
      .poll(() =>
        table
          .locator("thead th")
          .evaluateAll((cells) =>
            cells.map((cell) => cell.getAttribute("data-column")),
          ),
      )
      .toEqual(expected);
    await expect
      .poll(() =>
        options.evaluateAll((rows) =>
          rows.map((row) => row.getAttribute("data-column-option")),
        ),
      )
      .toEqual(expected);
    await options.nth(1).getByRole("checkbox").uncheck();
    await expect(table.locator("thead th")).toHaveCount(before.length - 1);
    await page.keyboard.press("Escape");
    await page.reload();
    await expect
      .poll(() =>
        table
          .locator("thead th")
          .evaluateAll((cells) =>
            cells.map((cell) => cell.getAttribute("data-column")),
          ),
      )
      .toEqual(expected.filter((key) => key !== before[0]));
    await table.getByRole("button", { name: "Columns", exact: true }).click();
    await page.getByRole("button", { name: "Show all", exact: true }).click();
    await expect
      .poll(() =>
        table
          .locator("thead th")
          .evaluateAll((cells) =>
            cells.map((cell) => cell.getAttribute("data-column")),
          ),
      )
      .toEqual(expected);
  });
}

test("a sole pinned header can drag into the unpinned group, and the chooser supports pointer and keyboard dragging", async ({
  page,
}) => {
  await page.goto("/runs?range=All+time");
  await pin(page, "Status", "left");
  const status = page.locator('th[data-column="status"]');
  const from = (await status.boundingBox())!;
  const to = (await page.locator('th[data-column="started"]').boundingBox())!;
  await page.mouse.move(from.x + 30, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await expect(status).toHaveAttribute("data-column-dragging", "true");
  await page.mouse.up();
  await expect(status).not.toHaveClass(/sticky/);
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  const chooser = page.locator('[aria-label="Column order"]');
  const first = chooser.locator("[data-column-option]").nth(0);
  const second = chooser.locator("[data-column-option]").nth(1);
  const firstKey = await first.getAttribute("data-column-option");
  const a = (await first
    .getByRole("button", { name: /^Drag / })
    .boundingBox())!;
  const b = (await second.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(chooser.locator("[data-column-option]").nth(1)).toHaveAttribute(
    "data-column-option",
    firstKey!,
  );
  const handle = chooser
    .locator("[data-column-option]")
    .nth(1)
    .getByRole("button", { name: /^Drag / });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  await expect(chooser.locator("[data-column-option]").first()).toHaveAttribute(
    "data-column-option",
    firstKey!,
  );
});
