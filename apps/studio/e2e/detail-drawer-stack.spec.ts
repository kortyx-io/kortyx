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
  test("keeps the list and Session mounted after the first Run navigation resolves", async ({
    page,
  }) => {
    await openSessionDrawer(page);
    const session = drawer(page, sessionPath);
    const sessionNode = await session.elementHandle();
    const listNode = await page
      .locator('[data-table-ready="true"]')
      .elementHandle();

    await session.getByRole("button", { name: /^Runs \d+$/ }).click();
    // Exercise completed production prefetches, not only a click before the
    // link enters the viewport cache. Live refresh is off for this fixture.
    await page.waitForLoadState("networkidle");
    await openRunFromSession(page);

    // Check resolved content, not just the loading drawer: a prefetched
    // standalone route can briefly show loading before replacing the stack.
    await expect(
      drawer(page, runPath).getByRole("button", {
        name: "Overview",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(2);
    expect(await sessionNode?.evaluate((node) => node.isConnected)).toBe(true);
    expect(await listNode?.evaluate((node) => node.isConnected)).toBe(true);
    await expectAncestorReveal(session, drawer(page, runPath));
  });

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

    const sessionExit = await observeClosedState(session);
    await closeButton(session).click();
    await expect(session).toHaveCount(0);
    await expectClosedState(sessionExit);
    await expect(page).toHaveURL(/\/sessions\?/);

    await clickTableRow(sessionTableRow(page));
    const reopened = drawer(page, sessionPath);
    await expect(reopened).toHaveAttribute("data-state", "open");
    await expect(reopened).toHaveAttribute("data-entry-motion", "preserve");
    await expect
      .poll(() => readDrawerAudit(page))
      .toMatchObject({ added: 2, removed: 1 });
  });

  for (const presentation of ["route", "expanded drawer"] as const) {
    test(`closes a reopened Trace once without remounting in the ${presentation}`, async ({
      page,
    }) => {
      if (presentation === "route") {
        await page.goto(
          `${runPath}?tab=trace&detailView=expanded&trace=e2e-ktx25-chat-started`,
        );
      } else {
        await openRunsList(page);
        await clickTableRow(runTableRow(page));
        const run = drawer(page, runPath);
        await expect(run).toHaveAttribute("data-state", "open");
        await waitForSurfaceMotion(run);
        await run.getByRole("button", { name: "Expand detail" }).click();
        await expect(page).toHaveURL(/detailView=expanded/);
        await run.getByRole("button", { name: "Trace", exact: true }).click();
        await page
          .getByRole("tabpanel")
          .locator('button[aria-haspopup="dialog"]')
          .nth(1)
          .click();
      }

      const rows = page
        .getByRole("tabpanel")
        .locator('button[aria-haspopup="dialog"]');
      const selectedRow = page.locator(
        'button[aria-haspopup="dialog"][aria-expanded="true"]',
      );
      const selectedName = await selectedRow.getAttribute("aria-label");
      expect(selectedName).not.toBeNull();
      const sameTrace = page.getByRole("button", {
        name: selectedName ?? "",
        exact: true,
      });

      // Repeat the same item, then switch items on the still-mounted inspector.
      // Checking only the original element misses a new portal replaying exit.
      for (const iteration of [0, 1, 2, 3]) {
        if (iteration > 0) await sameTrace.click();
        if (iteration === 3) {
          await waitForSurfaceMotion(inspector(page));
          await rows.last().click();
          await sameTrace.click();
        }
        await expect(inspector(page)).toHaveCount(1);
        await waitForSurfaceMotion(inspector(page));
        await installInspectorCloseAudit(page);

        if (iteration === 2) {
          await page.keyboard.press("Escape");
        } else {
          await inspector(page)
            .getByRole("button", { name: "Close item details" })
            .click();
        }
        // Observe the transient closed state in the browser. A loaded runner
        // can receive the click response after the exit has already finished.
        await expect(page).toHaveURL((url) => !url.searchParams.has("trace"));
        await expect(inspector(page)).toHaveCount(0);
        // Include the paint following removal and the URL-backed close commit.
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              );
            }),
        );
        expect(await readInspectorCloseAudit(page)).toEqual({
          closed: true,
          exitPoseRetained: true,
          selectionClearedAtExitEnd: true,
          added: 0,
          removed: 1,
          starts: ["exit"],
          ends: ["exit"],
          reopened: false,
          movedBackwards: false,
        });
        await expect(sameTrace).toHaveAttribute("aria-expanded", "false");
      }
    });
  }

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

    const inspectorExit = await observeClosedState(inspector(page));
    await clickBackdrop(page);
    await expectBackdropActive(page);
    await expect(inspector(page)).toHaveCount(0);
    await expectClosedState(inspectorExit);
    await expect(drawer(page, runPath)).toHaveAttribute("data-state", "open");

    const runExit = await observeClosedState(drawer(page, runPath));
    await clickBackdrop(page);
    await expectBackdropActive(page);
    await expect(drawer(page, runPath)).toHaveCount(0);
    await expectClosedState(runExit);
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(sessionPath)}\\?`));
    await expect(drawer(page, sessionPath)).toHaveAttribute(
      "data-state",
      "open",
    );

    const sessionExit = await observeClosedState(drawer(page, sessionPath));
    await clickBackdrop(page);
    await expect(drawer(page, sessionPath)).toHaveCount(0);
    await expectClosedState(sessionExit);
    await expect(page).toHaveURL(/\/sessions\?/);
  });

  test("animates Browser Back and reopens the retained stack with Browser Forward", async ({
    page,
  }) => {
    await openSessionDrawer(page);
    await openRunFromSession(page);

    const run = drawer(page, runPath);
    const runExit = await observeClosedState(run);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(sessionPath)}\\?`));
    await expect(run).toHaveCount(0);
    await expectClosedState(runExit);
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

    const inspectorExit = await observeClosedState(inspector(page));
    await page.getByRole("button", { name: /^Events \d+$/ }).click();
    await expect(page).toHaveURL(/tab=events/);
    await expect(
      drawer(page, runPath).getByText("Chronological event stream"),
    ).toBeVisible();
    await expect(inspector(page)).toHaveCount(0);
    await expectClosedState(inspectorExit);

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
    await expectAncestorReveal(session, drawer(page, runPath));

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
  const session = drawer(page, sessionPath);
  await expect(session).toHaveAttribute("data-state", "open");
  await expect(session).toContainText(DRAWER_FIXTURE.sessionId);
  await waitForSurfaceMotion(session);
}

async function openRunFromSession(page: Page) {
  const session = drawer(page, sessionPath);
  await session.getByRole("button", { name: /^Runs \d+$/ }).click();
  const runLink = session
    .getByRole("tabpanel")
    .locator(`a[href^="${runPath}"]`);
  await expect(runLink).toBeVisible();
  await runLink.click();
  // The first intercepted Run route is compiled on demand by the dev server.
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(runPath)}\\?`), {
    timeout: 15_000,
  });
  const run = drawer(page, runPath);
  await expect(run).toHaveAttribute("data-state", "open");
  await expect(run).toContainText(DRAWER_FIXTURE.runId);
  await waitForSurfaceMotion(run);
}

async function openTraceInspector(page: Page) {
  const run = drawer(page, runPath);
  await run.getByRole("button", { name: "Trace", exact: true }).click();
  const traceRow = run
    .getByRole("tabpanel")
    .locator('button[aria-haspopup="dialog"]')
    .first();
  await expect(traceRow).toBeVisible();
  await traceRow.click();
  await expect(inspector(page)).toBeVisible();
  await waitForSurfaceMotion(inspector(page));
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

async function expectAncestorReveal(ancestor: Locator, child: Locator) {
  await expect
    .poll(async () => {
      const [ancestorBox, childBox] = await Promise.all([
        ancestor.boundingBox(),
        child.boundingBox(),
      ]);
      if (!ancestorBox || !childBox) return Number.NEGATIVE_INFINITY;
      return childBox.x - ancestorBox.x;
    })
    .toBeGreaterThanOrEqual(40);
}

async function waitForSurfaceMotion(surface: Locator) {
  await expect(surface).toBeVisible();
  // Let entry styles reach the browser before sampling Web Animations. This
  // avoids treating the frame before a CSS transition starts as "settled".
  await surface.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect
    .poll(() =>
      surface.evaluate((element) =>
        element
          .getAnimations({ subtree: false })
          .some((animation) => animation.playState === "running"),
      ),
    )
    .toBe(false);
  // Finished animations may still have an animationend event queued. Drain
  // those entry events before installing an audit of the next close operation.
  await surface.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function observeClosedState(surface: Locator) {
  return surface.evaluateHandle((element) => {
    if (element.getAttribute("data-state") !== "open")
      throw new Error("Close audits must start on an open surface");
    const audit = { closed: false };
    const observer = new MutationObserver((records) => {
      if (
        element.getAttribute("data-state") === "closed" ||
        records.some((record) => record.oldValue === "closed")
      )
        audit.closed = true;
    });
    observer.observe(element, {
      attributes: true,
      attributeFilter: ["data-state"],
      attributeOldValue: true,
    });
    return { audit, observer };
  });
}

async function expectClosedState(
  handle: Awaited<ReturnType<typeof observeClosedState>>,
) {
  const closed = await handle.evaluate(({ audit, observer }) => {
    observer.disconnect();
    return audit.closed;
  });
  await handle.dispose();
  expect(closed).toBe(true);
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

async function installInspectorCloseAudit(page: Page) {
  await page.evaluate(() => {
    const audit = {
      closed: false,
      exitPoseRetained: false,
      selectionClearedAtExitEnd: false,
      added: 0,
      removed: 0,
      starts: [] as string[],
      ends: [] as string[],
      reopened: false,
      movedBackwards: false,
    };
    const state = window as typeof window & {
      __inspectorCloseAudit?: typeof audit;
      __stopInspectorCloseAudit?: () => void;
    };
    state.__stopInspectorCloseAudit?.();
    state.__inspectorCloseAudit = audit;
    const selector = "[data-detail-inspector]";
    const openBounds = document
      .querySelector(selector)
      ?.getBoundingClientRect();
    const count = (node: Node) =>
      node instanceof Element
        ? Number(node.matches(selector)) +
          node.querySelectorAll(selector).length
        : 0;
    let closed = false;
    let lastLeft: number | undefined;
    let frame = 0;
    const sample = () => {
      const surface = document.querySelector(selector);
      if (surface?.getAttribute("data-state") === "closed") {
        audit.closed = true;
        closed = true;
        const left = surface.getBoundingClientRect().left;
        if (lastLeft !== undefined && left < lastLeft - 1) {
          audit.movedBackwards = true;
        }
        lastLeft = left;
      } else if (closed && surface) {
        audit.reopened = true;
      }
      frame = requestAnimationFrame(sample);
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) audit.added += count(node);
        for (const node of record.removedNodes) audit.removed += count(node);
        if (
          record.type === "attributes" &&
          record.target instanceof Element &&
          record.target.matches(selector) &&
          record.target.getAttribute("data-state") === "closed"
        ) {
          audit.closed = true;
        }
        if (
          record.type === "attributes" &&
          record.target instanceof Element &&
          record.target.matches(selector) &&
          record.oldValue === "closed" &&
          record.target.getAttribute("data-state") === "open"
        ) {
          audit.reopened = true;
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
      attributeOldValue: true,
    });
    const onAnimation = (event: AnimationEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(selector))
        return;
      if (event.type === "animationstart")
        audit.starts.push(event.animationName);
      else {
        audit.ends.push(event.animationName);
        if (event.animationName === "exit") {
          audit.exitPoseRetained =
            openBounds !== undefined &&
            event.target.getBoundingClientRect().left >=
              openBounds.left + openBounds.width - 2;
          audit.selectionClearedAtExitEnd = !new URL(
            window.location.href,
          ).searchParams.has("trace");
        }
      }
    };
    document.addEventListener("animationstart", onAnimation, true);
    document.addEventListener("animationend", onAnimation, true);
    frame = requestAnimationFrame(sample);
    state.__stopInspectorCloseAudit = () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("animationstart", onAnimation, true);
      document.removeEventListener("animationend", onAnimation, true);
    };
  });
}

async function readInspectorCloseAudit(page: Page) {
  return page.evaluate(() => {
    const state = window as typeof window & {
      __inspectorCloseAudit?: {
        closed: boolean;
        exitPoseRetained: boolean;
        selectionClearedAtExitEnd: boolean;
        added: number;
        removed: number;
        starts: string[];
        ends: string[];
        reopened: boolean;
        movedBackwards: boolean;
      };
      __stopInspectorCloseAudit?: () => void;
    };
    state.__stopInspectorCloseAudit?.();
    return state.__inspectorCloseAudit;
  });
}
