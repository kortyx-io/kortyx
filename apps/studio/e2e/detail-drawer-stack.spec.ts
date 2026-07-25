import { expect, type Locator, type Page, test } from "@playwright/test";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const sessionPath = `/sessions/${DRAWER_FIXTURE.sessionId}`;
const runPath = `/runs/${DRAWER_FIXTURE.runId}`;
const interruptPath = `/interrupts/${DRAWER_FIXTURE.interruptId}`;

const drawer = (page: Page, path: string) =>
  page.locator(`[data-detail-drawer="${path}"]`);
const backdrop = (page: Page) => page.locator("[data-detail-backdrop]");
const inspector = (page: Page) => page.locator("[data-detail-inspector]");

test.describe("Studio detail drawer stack", () => {
  test("keeps one animated surface through loading, close, and reopen", async ({
    page,
  }) => {
    await openSessionsList(page);
    await installDrawerAudit(page);

    await clickTableRow(sessionTableRow(page));
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(sessionPath)}\\?`));

    const session = drawer(page, sessionPath);
    await expect(session).toHaveAttribute("data-state", "open");
    // The loading surface performs the entry. Resolved content must preserve
    // that surface instead of replaying the animation.
    await expect(session).toHaveAttribute("data-entry-motion", "preserve");
    await expect(session).toContainText(DRAWER_FIXTURE.sessionId);
    await expect(session).toHaveCSS("transition-duration", "0.3s");
    await expect(session).toHaveCSS(
      "transition-timing-function",
      "cubic-bezier(0.4, 0, 0.2, 1)",
    );

    await expect
      .poll(() => readDrawerAudit(page))
      .toMatchObject({ added: 1, removed: 0 });

    await closeButton(session).click();
    await expect(session).toHaveAttribute("data-state", "closed", {
      timeout: 250,
    });
    await expect(session).toHaveCount(0);
    await expect(page).toHaveURL(/\/sessions\?/);

    await clickTableRow(sessionTableRow(page));
    const reopened = drawer(page, sessionPath);
    await expect(reopened).toHaveAttribute("data-state", "open");
    await expect(reopened).toHaveAttribute("data-entry-motion", "preserve");
    await expect
      .poll(() => readDrawerAudit(page))
      .toMatchObject({ added: 2, removed: 1 });
  });

  test("stacks Session, Run, and Trace while the shared backdrop peels one level at a time", async ({
    page,
  }) => {
    await openSessionDrawer(page);
    await openRunFromSession(page);
    await openTraceInspector(page);

    await expect(drawer(page, sessionPath)).toHaveAttribute(
      "data-state",
      "open",
    );
    await expect(drawer(page, runPath)).toHaveAttribute("data-state", "open");
    await expect(inspector(page)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(3);
    await expectBackdropActive(page);

    await clickBackdrop(page);
    await expect(inspector(page)).toHaveAttribute("data-state", "closed", {
      timeout: 250,
    });
    await expectBackdropActive(page);
    await expect(inspector(page)).toHaveCount(0);
    await expect(drawer(page, runPath)).toHaveAttribute("data-state", "open");

    await clickBackdrop(page);
    await expect(drawer(page, runPath)).toHaveAttribute(
      "data-state",
      "closed",
      { timeout: 250 },
    );
    await expectBackdropActive(page);
    await expect(drawer(page, runPath)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(sessionPath)}\\?`));
    await expect(drawer(page, sessionPath)).toHaveAttribute(
      "data-state",
      "open",
    );

    await clickBackdrop(page);
    await expect(drawer(page, sessionPath)).toHaveAttribute(
      "data-state",
      "closed",
      { timeout: 250 },
    );
    await expect(drawer(page, sessionPath)).toHaveCount(0);
    await expect(page).toHaveURL(/\/sessions\?/);
  });

  test("animates Browser Back and reopens the retained stack with Browser Forward", async ({
    page,
  }) => {
    await openSessionDrawer(page);
    await openRunFromSession(page);

    const run = drawer(page, runPath);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(sessionPath)}\\?`));
    await expect(run).toHaveAttribute("data-state", "closed", {
      timeout: 250,
    });
    await expect(run).toHaveCount(0);
    await expect(drawer(page, sessionPath)).toHaveAttribute(
      "data-state",
      "open",
    );

    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(runPath)}\\?`));
    await expect(drawer(page, runPath)).toHaveAttribute("data-state", "open");
    await expect(drawer(page, sessionPath)).toHaveAttribute(
      "data-state",
      "open",
    );
  });

  test("does not reopen Run while close traverses same-path tab and trace history", async ({
    page,
  }) => {
    await openSessionDrawer(page);
    await openRunFromSession(page);
    await openTraceInspector(page);

    await inspector(page)
      .getByRole("button", { name: "Close item details" })
      .click();
    await expect(inspector(page)).toHaveCount(0);
    await page.getByRole("button", { name: /^Events \d+$/ }).click();
    await expect(page).toHaveURL(/tab=events/);
    await page.getByRole("button", { name: "Trace", exact: true }).click();
    await expect(page).toHaveURL(/tab=trace/);

    await page.evaluate((path) => {
      const target = document.querySelector(`[data-detail-drawer="${path}"]`);
      const states: string[] = [];
      (
        window as typeof window & { __runDrawerStates?: string[] }
      ).__runDrawerStates = states;
      if (!target) return;
      const observer = new MutationObserver(() => {
        states.push(target.getAttribute("data-state") ?? "removed");
      });
      observer.observe(target, {
        attributes: true,
        attributeFilter: ["data-state"],
      });
    }, runPath);

    await closeButton(drawer(page, runPath)).click();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(sessionPath)}\\?`));
    await expect(drawer(page, runPath)).toHaveCount(0);

    const states = await page.evaluate(
      () =>
        (window as typeof window & { __runDrawerStates?: string[] })
          .__runDrawerStates ?? [],
    );
    const firstClosed = states.indexOf("closed");
    expect(firstClosed).toBeGreaterThanOrEqual(0);
    expect(states.slice(firstClosed + 1)).not.toContain("open");
  });

  test("changes tabs immediately, closes the inspector with motion, and keeps the Run surface mounted", async ({
    page,
  }) => {
    await openRunsList(page);
    await clickTableRow(runTableRow(page));
    await expect(drawer(page, runPath)).toHaveAttribute("data-state", "open");
    await openTraceInspector(page);

    await page.evaluate((path) => {
      const value = document.querySelector(`[data-detail-drawer="${path}"]`);
      (
        window as typeof window & { __runDrawerNode?: Element | null }
      ).__runDrawerNode = value;
    }, runPath);

    await page.getByRole("button", { name: /^Events \d+$/ }).click();
    await expect(inspector(page)).toHaveAttribute("data-state", "closed", {
      timeout: 250,
    });
    await expect(page).toHaveURL(/tab=events/);
    await expect(
      drawer(page, runPath).getByText("Chronological event stream"),
    ).toBeVisible();
    await expect(inspector(page)).toHaveCount(0);

    const sameNode = await page.evaluate((path) => {
      const current = document.querySelector(`[data-detail-drawer="${path}"]`);
      return (
        current ===
        (window as typeof window & { __runDrawerNode?: Element | null })
          .__runDrawerNode
      );
    }, runPath);
    expect(sameNode).toBe(true);
    await expect(drawer(page, runPath)).toHaveCount(1);
  });

  test("clicking the visible Session ancestor closes Run and its inspector but preserves Session", async ({
    page,
  }) => {
    await openSessionDrawer(page);
    await openRunFromSession(page);
    await openTraceInspector(page);

    const session = drawer(page, sessionPath);
    const sessionBox = await session.boundingBox();
    const runBox = await drawer(page, runPath).boundingBox();
    expect(sessionBox).not.toBeNull();
    expect(runBox).not.toBeNull();
    if (!sessionBox || !runBox) return;
    expect(sessionBox.x).toBeLessThan(runBox.x);

    await session.click({ position: { x: 8, y: 100 } });

    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(sessionPath)}\\?`));
    await expect(inspector(page)).toHaveCount(0);
    await expect(drawer(page, runPath)).toHaveCount(0);
    await expect(drawer(page, sessionPath)).toHaveAttribute(
      "data-state",
      "open",
    );
  });

  test("opens Run from Interrupt as a second drawer", async ({ page }) => {
    await page.goto(`/interrupts?q=${DRAWER_FIXTURE.interruptId}`);
    await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
    await clickTableRow(interruptTableRow(page));
    await expect(drawer(page, interruptPath)).toHaveAttribute(
      "data-state",
      "open",
    );

    await drawer(page, interruptPath)
      .getByRole("link", { name: "Run", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(runPath)}\\?`));
    await expect(drawer(page, interruptPath)).toHaveAttribute(
      "data-state",
      "open",
    );
    await expect(drawer(page, runPath)).toHaveAttribute("data-state", "open");
  });

  test("expands Run to route bounds, disables the modal backdrop, and leaves navigation interactive", async ({
    page,
  }) => {
    await openSessionDrawer(page);
    await openRunFromSession(page);
    await drawer(page, runPath)
      .getByRole("button", { name: "Expand detail" })
      .click();

    await expect(page).toHaveURL(/detailView=expanded/);
    await expect(backdrop(page)).toHaveCSS("opacity", "0");
    await expect(backdrop(page)).toHaveCSS("pointer-events", "none");
    await expectDrawerAtRouteBounds(page, drawer(page, runPath));

    await page.locator('a[href="/runs"]').first().click();
    await expect(page).toHaveURL(/\/runs(?:\?|$)/);
  });

  test("expanding Run over an already expanded Session still gives Run standalone route bounds", async ({
    page,
  }) => {
    await openSessionDrawer(page);
    await drawer(page, sessionPath)
      .getByRole("button", { name: "Expand detail" })
      .click();
    await expect(page).toHaveURL(/detailView=expanded/);

    await page.getByRole("button", { name: /^Runs \d+$/ }).click();
    await page.getByRole("tabpanel").locator(`a[href^="${runPath}"]`).click();
    await expect(drawer(page, runPath)).toHaveAttribute("data-state", "open");
    await drawer(page, runPath)
      .getByRole("button", { name: "Expand detail" })
      .click();

    await expectDrawerAtRouteBounds(page, drawer(page, runPath));
    await expect(backdrop(page)).toHaveCSS("pointer-events", "none");
  });

  for (const directRoute of [
    {
      path: sessionPath,
      title: "Session details",
      entityId: DRAWER_FIXTURE.sessionId,
    },
    {
      path: runPath,
      title: "Run details",
      entityId: DRAWER_FIXTURE.runId,
    },
    {
      path: interruptPath,
      title: "Interrupt details",
      entityId: DRAWER_FIXTURE.interruptId,
    },
  ]) {
    test(`renders ${directRoute.title} as a full route after hard refresh`, async ({
      page,
    }) => {
      await page.goto(directRoute.path);
      await expect(
        page.getByRole("heading", { name: directRoute.title }),
      ).toBeVisible();
      await expect(
        page.getByText(directRoute.entityId, { exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
      await expect(backdrop(page)).toHaveCSS("pointer-events", "none");
    });
  }
});

async function openSessionsList(page: Page) {
  await page.goto(`/sessions?q=${DRAWER_FIXTURE.sessionId}`);
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  await expect(sessionTableRow(page)).toBeVisible();
}

async function openRunsList(page: Page) {
  await page.goto(`/runs?q=${DRAWER_FIXTURE.workflowId}`);
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  await expect(runTableRow(page)).toBeVisible();
}

async function openSessionDrawer(page: Page) {
  await openSessionsList(page);
  await clickTableRow(sessionTableRow(page));
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(sessionPath)}\\?`));
  await expect(drawer(page, sessionPath)).toHaveAttribute("data-state", "open");
}

async function openRunFromSession(page: Page) {
  await page.getByRole("button", { name: /^Runs \d+$/ }).click();
  await page.getByRole("tabpanel").locator(`a[href^="${runPath}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(runPath)}\\?`));
  await expect(drawer(page, runPath)).toHaveAttribute("data-state", "open");
}

async function openTraceInspector(page: Page) {
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const traceRow = page
    .getByRole("tabpanel")
    .locator('button[aria-haspopup="dialog"]')
    .first();
  await expect(traceRow).toBeVisible();
  await traceRow.click();
  await expect(inspector(page)).toBeVisible();
}

const sessionTableRow = (page: Page) =>
  page.locator(`[data-row-key="${DRAWER_FIXTURE.sessionId}"]`);
const runTableRow = (page: Page) =>
  page.locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`);
const interruptTableRow = (page: Page) =>
  page.locator(`[data-row-key="${DRAWER_FIXTURE.interruptId}"]`);

async function clickTableRow(row: Locator) {
  await expect(row).toBeVisible();
  await row.click({ position: { x: 8, y: 8 } });
}

const closeButton = (surface: Locator) =>
  surface.getByRole("button", { name: "Close detail" });

async function clickBackdrop(page: Page) {
  const topDrawer = page
    .locator('[data-detail-drawer][data-state="open"]')
    .last();
  const topBox = await topDrawer.boundingBox();
  expect(topBox).not.toBeNull();
  if (!topBox) return;
  await page.mouse.click(
    Math.max(8, topBox.x / 2),
    topBox.y + topBox.height / 2,
  );
}

async function expectBackdropActive(page: Page) {
  await expect(backdrop(page)).toHaveCSS("opacity", "1");
  await expect(backdrop(page)).toHaveCSS("pointer-events", "auto");
}

async function expectDrawerAtRouteBounds(page: Page, surface: Locator) {
  await expect
    .poll(async () => {
      const [mainBox, drawerBox] = await Promise.all([
        page.locator('main[data-slot="sidebar-inset"]').boundingBox(),
        surface.boundingBox(),
      ]);
      if (!mainBox || !drawerBox) return Number.POSITIVE_INFINITY;
      return Math.abs(mainBox.x - drawerBox.x);
    })
    .toBeLessThanOrEqual(2);
}

async function installDrawerAudit(page: Page) {
  await page.evaluate(() => {
    const audit = { added: 0, removed: 0 };
    (
      window as typeof window & {
        __drawerAudit?: { added: number; removed: number };
      }
    ).__drawerAudit = audit;
    const count = (node: Node, selector: string) => {
      if (!(node instanceof Element)) return 0;
      return (
        Number(node.matches(selector)) + node.querySelectorAll(selector).length
      );
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          audit.added += count(node, "[data-detail-drawer]");
        }
        for (const node of record.removedNodes) {
          audit.removed += count(node, "[data-detail-drawer]");
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function readDrawerAudit(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __drawerAudit?: { added: number; removed: number };
        }
      ).__drawerAudit ?? { added: 0, removed: 0 },
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
