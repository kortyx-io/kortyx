import { expect, type Page, test } from "@playwright/test";
import {
  CALL_LINK_FIXTURE,
  NAVIGATION_FIXTURES,
} from "./support/navigation-fixture";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const path = (resource: string, id: string) =>
  `/${resource}/${encodeURIComponent(id)}`;
const surface = (page: Page, href: string) =>
  page.locator(`[data-detail-drawer="${href}"]`);
const heading = (page: Page, id: string) =>
  page.getByRole("heading", { name: id, exact: true });

async function openRow(page: Page, resource: string, id: string) {
  await page.goto(`/${resource}?q=${encodeURIComponent(id)}&range=All+time`);
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  await page
    .locator(`[data-row-key="${id}"]:visible`)
    .click({ position: { x: 8, y: 8 } });
  // A fresh dev server compiles the first intercepted destination on demand.
  await expect(page).toHaveURL((url) => url.pathname === path(resource, id), {
    timeout: 15_000,
  });
  await expect(surface(page, path(resource, id))).toHaveAttribute(
    "data-state",
    "open",
  );
  await expect(heading(page, id)).toBeVisible();
}

test.describe("Studio internal entity links", () => {
  for (const fixture of NAVIGATION_FIXTURES) {
    for (const resource of ["runs", "sessions", "interrupts"] as const) {
      test(`${fixture.name} ${resource} ID survives row navigation, close, and direct reload`, async ({
        page,
      }) => {
        const id =
          fixture[
            resource === "runs"
              ? "runId"
              : resource === "sessions"
                ? "sessionId"
                : "interruptId"
          ];
        const href = path(resource, id);
        await openRow(page, resource, id);
        const drawer = surface(page, href);
        await drawer
          .getByRole("button", { name: "Close detail", exact: true })
          .click();
        await expect(page).toHaveURL((url) => url.pathname === `/${resource}`);
        await expect(drawer).toHaveCount(0);
        await page.goto(href);
        await expect(heading(page, id)).toBeVisible();
        await page.reload();
        await expect(heading(page, id)).toBeVisible();
        await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
      });
    }

    test(`${fixture.name} Run → Session → Run restores the original drawer and filters`, async ({
      page,
    }) => {
      const runPath = path("runs", fixture.runId);
      const sessionPath = path("sessions", fixture.sessionId);
      await openRow(page, "runs", fixture.runId);
      const run = surface(page, runPath);
      const list = await page
        .locator('[data-table-ready="true"]')
        .elementHandle();
      const sessionLink = run.getByRole("link", { name: /^Session / });
      await expect(sessionLink).toHaveAttribute(
        "href",
        `${sessionPath}?q=${encodeURIComponent(fixture.runId).replace(/%20/g, "+")}&range=All+time`,
      );
      await sessionLink.click();
      const session = surface(page, sessionPath);
      await expect(heading(page, fixture.sessionId)).toBeVisible();
      await expect(session).toHaveAttribute("data-state", "open");
      await session.getByRole("button", { name: /^Runs \d+$/ }).click();
      await session
        .getByRole("tabpanel")
        .locator(`a[href^="${runPath}"]`)
        .click();
      await expect(page).toHaveURL((url) => url.pathname === runPath);
      await expect(session).toHaveCount(0);
      await expect(run).toHaveAttribute("data-state", "open");
      expect(await list?.evaluate((node) => node.isConnected)).toBe(true);
      expect(new URL(page.url()).searchParams.get("q")).toBe(fixture.runId);
      await page.goBack();
      await expect(session).toHaveAttribute("data-state", "open");
      await expect(heading(page, fixture.sessionId)).toBeVisible();
      await page.goForward();
      await expect(session).toHaveCount(0);
      await expect(run).toHaveAttribute("data-state", "open");
    });

    test(`${fixture.name} Session → Run → Session exposes the retained ancestor`, async ({
      page,
    }) => {
      const sessionPath = path("sessions", fixture.sessionId);
      const runPath = path("runs", fixture.runId);
      await openRow(page, "sessions", fixture.sessionId);
      const session = surface(page, sessionPath);
      await session.getByRole("button", { name: /^Runs \d+$/ }).click();
      await session
        .getByRole("tabpanel")
        .locator(`a[href^="${runPath}"]`)
        .click();
      const run = surface(page, runPath);
      await expect(heading(page, fixture.runId)).toBeVisible();
      await run.getByRole("link", { name: /^Session / }).click();
      await expect(page).toHaveURL((url) => url.pathname === sessionPath);
      await expect(run).toHaveCount(0);
      await expect(session).toHaveAttribute("data-state", "open");
      await expect(heading(page, fixture.sessionId)).toBeVisible();
      await expect(
        session.getByRole("button", { name: "Close detail", exact: true }),
      ).toBeVisible();
    });
  }

  for (const direct of [false, true]) {
    test(`Run → Session${direct ? " → Run → Session" : ""} → close returns to ${direct ? "a full-page" : "a drawer"} Run`, async ({
      page,
    }) => {
      const fixture = NAVIGATION_FIXTURES[0];
      if (!fixture) throw new Error("Missing colon fixture");
      const runPath = path("runs", fixture.runId);
      const sessionPath = path("sessions", fixture.sessionId);
      if (direct) await page.goto(runPath);
      else await openRow(page, "runs", fixture.runId);
      await page.getByRole("link", { name: /^Session / }).click();
      const session = surface(page, sessionPath);
      await expect(heading(page, fixture.sessionId)).toBeVisible();
      if (direct) {
        await session.getByRole("button", { name: /^Runs \d+$/ }).click();
        await session
          .getByRole("tabpanel")
          .locator(`a[href^="${runPath}"]`)
          .click();
        const revisitedRun = surface(page, runPath);
        await expect(revisitedRun).toHaveAttribute("data-state", "open");
        await revisitedRun
          .getByRole("button", { name: "Close detail", exact: true })
          .click();
        await expect(session).toHaveAttribute("data-state", "open");
      }
      await session
        .getByRole("button", { name: "Close detail", exact: true })
        .click();
      await expect(page).toHaveURL((url) => url.pathname === runPath);
      await expect(session).toHaveCount(0);
      await expect(heading(page, fixture.runId)).toBeVisible();
      await expect(
        page.locator('[data-detail-drawer][data-state="open"]'),
      ).toHaveCount(direct ? 0 : 1);
    });
  }

  test("Interrupt table Run link preserves the document, drawer context, and filters", async ({
    page,
  }) => {
    const fixture = NAVIGATION_FIXTURES[0];
    if (!fixture) throw new Error("Missing colon fixture");
    await page.goto(
      `/interrupts?q=${encodeURIComponent(fixture.interruptId)}&range=All+time`,
    );
    await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
    const list = await page
      .locator('[data-table-ready="true"]')
      .elementHandle();
    const link = page.locator(`[data-row-key="${fixture.interruptId}"] a`);
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(heading(page, fixture.runId)).toBeVisible();
    await expect(surface(page, path("runs", fixture.runId))).toHaveAttribute(
      "data-state",
      "open",
    );
    expect(await list?.evaluate((node) => node.isConnected)).toBe(true);
    expect(new URL(page.url()).searchParams.get("q")).toBe(fixture.interruptId);
    expect(new URL(page.url()).searchParams.get("range")).toBe("All time");
  });

  test("child call interrupt links honor the selected branch and nested invocation", async ({
    page,
  }) => {
    const fixture = CALL_LINK_FIXTURE;
    for (const [branchId, interruptId] of [
      ["branch-a", fixture.interruptId],
      ["branch-b", fixture.otherInterruptId],
    ]) {
      await page.goto(
        `${path("runs", fixture.runId)}?tab=calls&call=${fixture.invocationId}&branch=${branchId}`,
      );
      const link = page.getByRole("link", { name: "Open human interrupt" });
      await expect(link).toHaveAttribute(
        "href",
        path("interrupts", interruptId),
      );
      await link.click();
      await expect(heading(page, interruptId)).toBeVisible();
      await expect(
        surface(page, path("interrupts", interruptId)),
      ).toHaveAttribute("data-state", "open");
    }
  });

  test("modified ancestor links open a new tab without closing the current stack", async ({
    page,
    context,
  }) => {
    const sessionPath = path("sessions", DRAWER_FIXTURE.sessionId);
    const runPath = path("runs", DRAWER_FIXTURE.runId);
    await openRow(page, "sessions", DRAWER_FIXTURE.sessionId);
    const session = surface(page, sessionPath);
    await session.getByRole("button", { name: /^Runs \d+$/ }).click();
    await session
      .getByRole("tabpanel")
      .locator(`a[href^="${runPath}"]`)
      .click();
    const run = surface(page, runPath);
    await expect(heading(page, DRAWER_FIXTURE.runId)).toBeVisible();
    const newTab = context.waitForEvent("page");
    await run
      .getByRole("link", { name: /^Session / })
      .click({ modifiers: ["ControlOrMeta"] });
    const opened = await newTab;
    await expect(heading(opened, DRAWER_FIXTURE.sessionId)).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === runPath);
    await expect(run).toHaveAttribute("data-state", "open");
    await expect(session).toHaveAttribute("data-state", "open");
    await opened.close();
  });

  test("interrupt breadcrumb selects the requested call and survives cyclic close", async ({
    page,
  }) => {
    const fixture = CALL_LINK_FIXTURE;
    const runPath = path("runs", fixture.runId);
    await openRow(page, "runs", fixture.runId);
    const run = surface(page, runPath);
    await run
      .getByRole("combobox", { name: "Execution branch" })
      .selectOption("branch-a");
    await run
      .getByRole("button", { name: /^e2e-ktx25-workflow approval ·/ })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("call") === fixture.invocationId &&
        url.searchParams.get("branch") === "branch-a",
    );
    const originalUrl = page.url();
    await run.getByRole("link", { name: "Open human interrupt" }).click();
    const interrupt = surface(page, path("interrupts", fixture.interruptId));
    await expect(heading(page, fixture.interruptId)).toBeVisible();
    await interrupt
      .locator(`a[href^="${runPath}"][href*="call=nested-branch-a"]`)
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === runPath &&
        url.searchParams.get("call") === "nested-branch-a" &&
        url.searchParams.get("branch") === "branch-a",
    );
    await expect(interrupt).toHaveCount(0);
    await expect(run).toHaveAttribute("data-state", "open");
    await expect(
      run.getByText("nested-branch-a", { exact: true }),
    ).toBeVisible();
    await run
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(interrupt).toHaveAttribute("data-state", "open");
    await interrupt
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(page).toHaveURL(originalUrl);
    await expect(run).toHaveAttribute("data-state", "open");
    await expect(
      run.getByRole("heading", { name: fixture.runId, exact: true }),
    ).toBeInViewport();
    await run
      .getByRole("button", { name: "Close detail", exact: true })
      .click({ trial: true });
  });
});

// Revisiting an entity reuses its retained drawer, but creates a new history
// entry. Unwind every entry, including the original occurrence of that entity.
test.describe("Studio cyclic drawer history", () => {
  const fixture = NAVIGATION_FIXTURES[0];
  if (!fixture) throw new Error("Missing navigation fixture");
  const resources = ["runs", "sessions", "interrupts"] as const;
  type Resource = (typeof resources)[number];
  type Dismissal = "button" | "Escape" | "backdrop" | "Back";
  const ids = {
    runs: fixture.runId,
    sessions: fixture.sessionId,
    interrupts: fixture.interruptId,
  };
  const href = (resource: Resource) => path(resource, ids[resource]);

  async function expectCurrent(page: Page, resource: Resource) {
    await expect(page).toHaveURL((url) => url.pathname === href(resource));
    const drawer = surface(page, href(resource));
    await expect(drawer).toHaveCount(1);
    await expect(drawer).toHaveAttribute("data-state", "open");
    await expect(
      drawer.getByRole("heading", { name: ids[resource], exact: true }),
    ).toBeInViewport();
    // A retained ancestor can have the right URL and state yet remain covered.
    await drawer
      .getByRole("button", { name: "Close detail", exact: true })
      .click({ trial: true });
  }

  async function follow(page: Page, from: Resource, to: Resource) {
    const drawer = surface(page, href(from));
    if (from === "sessions" && to === "runs") {
      await drawer.getByRole("button", { name: /^Runs \d+$/ }).click();
      await drawer
        .getByRole("tabpanel")
        .locator(`a[href^="${href(to)}"]`)
        .click();
    } else {
      const name =
        to === "sessions"
          ? from === "runs"
            ? /^Session /
            : "Session"
          : to === "runs"
            ? "Run"
            : "Open interrupt";
      await drawer
        .getByRole("link", { name, exact: typeof name === "string" })
        .click();
    }
    await expectCurrent(page, to);
  }

  async function traverse(
    page: Page,
    direction: "Back" | "Forward",
    from: Resource,
  ) {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (direction === "Back") await page.goBack();
      else await page.goForward();
      if (new URL(page.url()).pathname !== href(from)) return;
      // Nuqs tab changes are real history entries. They keep the same drawer.
      await expectCurrent(page, from);
    }
    throw new Error(`History did not leave ${href(from)}`);
  }

  async function dismiss(page: Page, resource: Resource, method: Dismissal) {
    if (method === "Back") await traverse(page, "Back", resource);
    else if (method === "Escape") await page.keyboard.press("Escape");
    else if (method === "backdrop") {
      await page
        .locator("[data-detail-backdrop]")
        .click({ position: { x: 200, y: 500 } });
    } else {
      await surface(page, href(resource))
        .getByRole("button", { name: "Close detail", exact: true })
        .click();
    }
  }

  async function expectHistoryStack(page: Page, prefix: Resource[]) {
    let stack: Resource[] = [];
    for (const resource of prefix) {
      const index = stack.indexOf(resource);
      stack = index < 0 ? [...stack, resource] : stack.slice(0, index + 1);
    }
    const expected = stack.map(href).sort();
    await expect
      .poll(() =>
        page
          .locator('[data-detail-drawer][data-state="open"]')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-detail-drawer")).sort(),
          ),
      )
      .toEqual(expected);
    for (const resource of stack)
      await expect(surface(page, href(resource))).toBeInViewport();
  }

  async function cycle(page: Page, route: Resource[], method: Dismissal) {
    const root = route[0];
    await openRow(page, root, ids[root]);
    const list = await page
      .locator('[data-table-ready="true"]')
      .elementHandle();
    for (let index = 1; index < route.length; index++) {
      await follow(page, route[index - 1], route[index]);
      await expectHistoryStack(page, route.slice(0, index + 1));
      await expect(
        page.locator('[data-detail-drawer][data-state="closed"]'),
      ).toHaveCount(0);
    }
    for (let index = route.length - 1; index > 0; index--) {
      await dismiss(page, route[index], method);
      await expectCurrent(page, route[index - 1]);
      await expectHistoryStack(page, route.slice(0, index));
      expect(await list?.evaluate((node) => node.isConnected)).toBe(true);
      expect(new URL(page.url()).searchParams.get("q")).toBe(ids[root]);
    }
    await dismiss(page, root, method);
    await expect(page).toHaveURL((url) => url.pathname === `/${root}`);
    await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
    // Forward must revive the explicitly closed original occurrence as well.
    await page.goForward();
    await expectCurrent(page, root);
    for (let index = 1; index < route.length; index++) {
      await traverse(page, "Forward", route[index - 1]);
      await expectCurrent(page, route[index]);
      await expectHistoryStack(page, route.slice(0, index + 1));
    }
    for (let index = route.length - 2; index >= 0; index--) {
      await traverse(page, "Back", route[index + 1]);
      await expectCurrent(page, route[index]);
      await expectHistoryStack(page, route.slice(0, index + 1));
    }
  }

  for (const revisitSession of [false, true]) {
    test(`two different Runs in one Session ${revisitSession ? "survive a Session cycle" : "unwind normally"}`, async ({
      page,
    }) => {
      await openRow(page, "runs", ids.runs);
      await follow(page, "runs", "sessions");
      const session = surface(page, href("sessions"));
      await session.getByRole("button", { name: /^Runs \d+$/ }).click();
      const otherPath = path("runs", fixture.otherRunId);
      await session
        .getByRole("tabpanel")
        .locator(`a[href^="${otherPath}"]`)
        .click();
      const otherRun = surface(page, otherPath);
      async function expectOtherRun() {
        await expect(page).toHaveURL((url) => url.pathname === otherPath);
        await expect(otherRun).toHaveCount(1);
        await expect(otherRun).toHaveAttribute("data-state", "open");
        await expect(
          otherRun.getByRole("heading", {
            name: fixture.otherRunId,
            exact: true,
          }),
        ).toBeInViewport();
        await otherRun
          .getByRole("button", { name: "Close detail", exact: true })
          .click({ trial: true });
      }
      await expectOtherRun();
      await expect(surface(page, href("runs"))).toHaveCount(0);
      if (revisitSession) {
        await otherRun.getByRole("link", { name: /^Session / }).click();
        await expectCurrent(page, "sessions");
        await dismiss(page, "sessions", "button");
        await expectOtherRun();
        await expect(session).toHaveAttribute("data-state", "open");
      }
      await otherRun
        .getByRole("button", { name: "Close detail", exact: true })
        .click();
      await expectCurrent(page, "sessions");
      await expect(surface(page, href("runs"))).toHaveAttribute(
        "data-state",
        "open",
      );
      await dismiss(page, "sessions", "button");
      await expectCurrent(page, "runs");
      expect(new URL(page.url()).searchParams.get("q")).toBe(ids.runs);
      await dismiss(page, "runs", "button");
      await expect(page).toHaveURL((url) => url.pathname === "/runs");
      await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
    });
  }

  test("Back and Forward during exit cancel the pending close navigation", async ({
    page,
  }) => {
    await openRow(page, "runs", ids.runs);
    await dismiss(page, "runs", "button");
    await page.goBack();
    await page.goForward();
    await expectCurrent(page, "runs");
    const run = surface(page, href("runs"));
    await run
      .getByRole("button", { name: "Expand detail", exact: true })
      .click();
    // Completing a fresh entry-to-expanded transition also crosses the old
    // close deadline without a fixed sleep or a mocked browser clock.
    const left = await page
      .locator('main[data-slot="sidebar-inset"]')
      .evaluate((node) => node.getBoundingClientRect().left);
    await expect
      .poll(() => run.evaluate((node) => node.getBoundingClientRect().left))
      .toBeCloseTo(left, 0);
    await expect(page).toHaveURL((url) => url.pathname === href("runs"));
    await expect(run).toHaveAttribute("data-state", "open");
  });

  for (const resource of resources) {
    test(`${resource} close followed immediately by Forward revives the retained surface`, async ({
      page,
    }) => {
      await openRow(page, resource, ids[resource]);
      await dismiss(page, resource, "button");
      await expect(page).toHaveURL((url) => url.pathname === `/${resource}`);
      // Do not wait for the exit subtree to be removed before reversing it.
      await page.goForward();
      await expectCurrent(page, resource);
      await dismiss(page, resource, "button");
      await expect(page).toHaveURL((url) => url.pathname === `/${resource}`);
      await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
      await page
        .locator(`[data-row-key="${ids[resource]}"]`)
        .click({ position: { x: 8, y: 8 } });
      await expectCurrent(page, resource);
    });
  }

  test("expanded Run → Session → Run restores the expanded ancestor after Escape", async ({
    page,
  }) => {
    await openRow(page, "runs", ids.runs);
    const run = surface(page, href("runs"));
    await run
      .getByRole("button", { name: "Expand detail", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("detailView") === "expanded",
    );
    const expandedLeft = await page
      .locator('main[data-slot="sidebar-inset"]')
      .evaluate((node) => node.getBoundingClientRect().left);
    await expect
      .poll(() => run.evaluate((node) => node.getBoundingClientRect().left))
      .toBeCloseTo(expandedLeft, 0);
    await follow(page, "runs", "sessions");
    await surface(page, href("sessions"))
      .getByRole("button", { name: /^Runs \d+$/ })
      .click();
    await surface(page, href("sessions"))
      .getByRole("tabpanel")
      .locator(`a[href^="${href("runs")}"]`)
      .click();
    await expect(page).toHaveURL((url) => url.pathname === href("runs"));
    await expect(run).toHaveAttribute("data-state", "open");
    await expect(surface(page, href("sessions"))).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expectCurrent(page, "sessions");
    await dismiss(page, "sessions", "button");
    await expect(page).toHaveURL((url) => url.pathname === href("runs"));
    await expect(run).toHaveAttribute("data-state", "open");
    await expect(
      run.getByRole("heading", { name: ids.runs, exact: true }),
    ).toBeInViewport();
    await expect
      .poll(() => run.evaluate((node) => node.getBoundingClientRect().left))
      .toBeCloseTo(expandedLeft, 0);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL((url) => url.pathname === "/runs");
    await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
  });

  for (const root of resources) {
    for (const next of resources.filter((resource) => resource !== root)) {
      const third = resources.find(
        (resource) => resource !== root && resource !== next,
      );
      if (!third) throw new Error("Missing third navigation resource");
      for (const route of [
        [root, next, root],
        [root, next, third, root],
      ]) {
        test(`${route.join(" → ")} closes through every history entry`, async ({
          page,
        }) => {
          await cycle(page, route, "button");
        });
      }
    }
  }
  for (const route of [
    ["runs", "sessions", "runs", "sessions", "runs"],
    [
      "runs",
      "sessions",
      "interrupts",
      "runs",
      "interrupts",
      "sessions",
      "runs",
    ],
  ] satisfies Resource[][]) {
    test(`repeated ${route.join(" → ")} restores every occurrence`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await cycle(page, route, "button");
    });
  }
  for (const method of ["Escape", "backdrop", "Back"] as const) {
    test(`Run → Session → Run unwinds using ${method}`, async ({ page }) => {
      await cycle(page, ["runs", "sessions", "runs"], method);
    });
  }
  test("mobile Run → Session → Run closes and revives", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await cycle(page, ["runs", "sessions", "runs"], "button");
  });
});
