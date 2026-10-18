import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const screenshots = process.env.KORTYX_HELP_SCREENSHOTS;
async function expectArrowAttached(
  card: import("@playwright/test").Locator,
  trigger: import("@playwright/test").Locator,
) {
  await expect
    .poll(() =>
      card.evaluate(
        (element) =>
          element
            .getAnimations()
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(0);
  const arrow = card.locator('[data-slot="popover-arrow"]');
  await expect(arrow).toBeVisible();
  await expect(arrow).toHaveCSS("overflow", "visible");
  const panel = await card.boundingBox();
  const pointer = await arrow.boundingBox();
  const anchor = await trigger.boundingBox();
  if (!panel || !pointer || !anchor)
    throw new Error("Help and its trigger must be visible");
  const side = await card.getAttribute("data-side");
  const horizontal = side === "top" || side === "bottom";
  const join =
    side === "top"
      ? pointer.y - (panel.y + panel.height)
      : side === "bottom"
        ? pointer.y + pointer.height - panel.y
        : side === "left"
          ? pointer.x - (panel.x + panel.width)
          : pointer.x + pointer.width - panel.x;
  const target = horizontal
    ? pointer.x + pointer.width / 2 - (anchor.x + anchor.width / 2)
    : pointer.y + pointer.height / 2 - (anchor.y + anchor.height / 2);
  expect(Math.abs(join)).toBeLessThanOrEqual(1);
  expect(Math.abs(target)).toBeLessThanOrEqual(1);
}
async function screenshot(page: import("@playwright/test").Page, name: string) {
  if (!screenshots) return;
  await expect(
    page.locator('[data-slot="popover-content"][data-state="open"]').last(),
  ).toHaveCSS("opacity", "1");
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, name), fullPage: true });
}

test("header title owns help, preserves sort, and supports hover and keyboard", async ({
  page,
}) => {
  await page.goto("/runs?range=All+time&live=false");
  const header = page.locator('th[data-column="status"]');
  const sort = header.locator("button").filter({ hasText: /^Status$/ });
  // The title itself owns help; there is no extra question-mark button.
  await expect(header.locator('button[aria-haspopup="dialog"]')).toHaveCount(1);
  await expect(header.locator(".lucide-circle-help")).toHaveCount(0);
  const trigger = sort;
  const before = page.url();
  await trigger.hover();
  const card = page.getByRole("dialog", { name: "About Status", exact: true });
  await expect(card).toBeVisible();
  await expect(card.locator('[data-slot="popover-arrow"]')).toBeVisible();
  await expectArrowAttached(card, trigger);
  expect(page.url()).toBe(before);
  const docs = card.getByRole("link", { name: /Read documentation/ });
  await expect(docs).toHaveAttribute(
    "href",
    /\/studio\/v0\/runs#status-and-completion$/,
  );
  await expect(docs).toHaveAttribute("target", "_blank");
  await docs.hover();
  await expect(card).toBeVisible();
  await screenshot(page, "oss-table-help-dark.png");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await trigger.focus();
  await expect(card).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(docs).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(trigger).toBeFocused();
  // Hovering and using the footer must not change the sort URL.
  expect(page.url()).toBe(before);
  await sort.first().click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await trigger.press("Enter");
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect(header).not.toHaveAttribute("data-column-dragging", "true");
  await trigger.press(" ");
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(header).not.toHaveAttribute("data-column-dragging", "true");

  const website = process.env.KORTYX_HELP_WEBSITE_URL;
  if (website) {
    const sortedUrl = page.url();
    await page.context().route("https://kortyx.io/docs/**", (route) =>
      route.fulfill({
        status: 302,
        headers: {
          location: `${website}${new URL(route.request().url()).pathname}`,
        },
      }),
    );
    await trigger.hover();
    const popupPromise = page.waitForEvent("popup");
    await card.getByRole("link", { name: /Read documentation/ }).click();
    const popup = await popupPromise;
    await expect(
      popup.getByRole("heading", { name: "Inspect a run", exact: true }),
    ).toBeVisible();
    await popup.close();
    await expect(page).toHaveURL(sortedUrl);
  }
});

test("Escape closes help without closing its owning run drawer", async ({
  page,
}) => {
  await page.goto(`/runs?range=All+time&live=false&q=${DRAWER_FIXTURE.runId}`);
  await page
    .locator(`[data-row-key="${DRAWER_FIXTURE.runId}"] td`)
    .first()
    .click();
  const drawer = page.locator(
    `[data-detail-drawer="/runs/${DRAWER_FIXTURE.runId}"]`,
  );
  await expect(drawer).toBeVisible();
  await expect
    .poll(() =>
      drawer.evaluate(
        (element) =>
          element
            .getAnimations()
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(0);
  const metricHelp = drawer.getByRole("button", {
    name: "Explain Model calls",
    exact: true,
  });
  const metricCard = metricHelp.locator("xpath=../..");
  const cardBounds = await metricCard.boundingBox();
  const helpBounds = await metricHelp.boundingBox();
  if (!cardBounds || !helpBounds)
    throw new Error("Metric card and help trigger must be visible");
  expect(
    cardBounds.x + cardBounds.width - (helpBounds.x + helpBounds.width),
  ).toBeLessThan(20);
  await drawer
    .getByRole("button", { name: "Explain Median TTFT", exact: true })
    .hover();
  const card = page.getByRole("dialog", {
    name: "Explain Median TTFT",
    exact: true,
  });
  await expect(card).toContainText("Time to first token");
  await expectArrowAttached(
    card,
    drawer.getByRole("button", { name: "Explain Median TTFT", exact: true }),
  );
  await screenshot(page, "oss-run-drawer-help.png");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("workflow symbols own the shared help card and documentation footer", async ({
  page,
}) => {
  await page.goto("/workflows?range=All+time&live=false");
  const symbol = page
    .getByRole("button", { name: /^Interrupted node\./ })
    .first();
  await symbol.hover();
  const card = page.getByRole("dialog", {
    name: "Interrupted node",
    exact: true,
  });
  await expect(card).toContainText("paused for input at this node");
  await expectArrowAttached(card, symbol);
  await expect(card.locator('[data-slot="popover-arrow"]')).toBeVisible();
  await expect(
    card.getByRole("link", { name: /Read documentation/ }),
  ).toHaveAttribute("href", /workflows#node-states$/);
  await expect(symbol.locator(".lucide-circle-help")).toHaveCount(0);
  await screenshot(page, "oss-symbol-help.png");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await symbol.focus();
  await page.keyboard.press("Tab");
  await expect(
    card.getByRole("link", { name: /Read documentation/ }),
  ).toBeFocused();
});

test("touch help fits a narrow screen and can be dismissed outside", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    colorScheme: "dark",
    httpCredentials: {
      username: process.env.KORTYX_STUDIO_BASIC_AUTH_USERNAME ?? "admin",
      password: process.env.KORTYX_STUDIO_BASIC_AUTH_PASSWORD ?? "kortyx",
    },
  });
  const page = await context.newPage();
  await page.goto("/settings/api-keys");
  await page
    .getByRole("button", { name: "About Self-hosted API keys", exact: true })
    .tap();
  const card = page.getByRole("dialog", {
    name: "About Self-hosted API keys",
    exact: true,
  });
  await expect(card).toBeVisible();
  const bounds = await card.boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
  await expect(
    card.getByRole("link", { name: /Read documentation/ }),
  ).toHaveAttribute("href", /credentials-secrets$/);
  await screenshot(page, "oss-settings-help-mobile.png");
  await page.touchscreen.tap(5, 5);
  await expect(card).toBeHidden();
  await page.goto("/runs?range=All+time&live=false");
  const headerTitle = page.locator(
    'th[data-column="status"] button[data-slot="popover-trigger"]',
  );
  await headerTitle.tap();
  await expect(page).toHaveURL(/sort=status/);
  const headerHelp = page.getByRole("dialog", {
    name: "About Status",
    exact: true,
  });
  await expect(
    headerHelp.getByRole("link", { name: /Read documentation/ }),
  ).toBeVisible();
  await expect(headerHelp.locator('[data-slot="popover-arrow"]')).toBeVisible();
  await context.close();
});

test("light appearance keeps the separate documentation footer", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/settings/evaluations");
  await page
    .getByRole("button", {
      name: "About Self-hosted evaluation configuration",
      exact: true,
    })
    .hover();
  await expect(
    page.getByRole("dialog", {
      name: "About Self-hosted evaluation configuration",
      exact: true,
    }),
  ).toBeVisible();
  await screenshot(page, "oss-evaluation-help-light.png");
});
