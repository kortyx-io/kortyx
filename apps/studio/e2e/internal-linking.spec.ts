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
    .locator(`[data-row-key="${id}"]`)
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
    test(`Run → Session → close returns to ${direct ? "a full-page" : "a drawer"} Run`, async ({
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

  test("interrupt breadcrumb selects the requested call in a retained Run", async ({
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
  });
});
