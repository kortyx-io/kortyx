import { expect, type Locator, type Page, test } from "@playwright/test";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const runPath = `/runs/${DRAWER_FIXTURE.runId}`;
const interruptPath = `/interrupts/${DRAWER_FIXTURE.interruptId}`;

const detailDrawer = (page: Page, path: string) =>
  page.locator(`[data-detail-drawer="${path}"]`);
const inspector = (page: Page) => page.locator("[data-detail-inspector]");

test.describe("Payload viewer controls and overlay layering", () => {
  test("supports every representation and toolbar state on a light full-page detail", async ({
    page,
  }) => {
    await setTheme(page, "light");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(interruptPath);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-resolved",
      "light",
    );

    await page.getByRole("button", { name: "Payload", exact: true }).click();
    await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
    await expect(page.locator("[data-detail-backdrop]")).toHaveCSS(
      "pointer-events",
      "none",
    );
    const viewer = page.locator("[data-payload-viewer]").first();
    await expect(viewer).toBeVisible();

    await selectModeWithKeyboard(page, viewer, "JSON");
    await expect(viewer).toHaveAttribute("data-mode", "json");
    await expect(payloadContent(viewer)).toContainText('"interruptId"');

    await selectMode(page, viewer, "YAML");
    await expect(payloadContent(viewer)).toContainText("interruptId:");

    await selectMode(page, viewer, "Markdown");
    await expect(payloadContent(viewer)).toContainText("interruptId:");

    await selectMode(page, viewer, "Text");
    await expect(payloadContent(viewer)).toContainText("interruptId:");

    await selectMode(page, viewer, "Pretty");
    await expect(viewer).toHaveAttribute("data-mode", "pretty");

    const trigger = representationTrigger(viewer);
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.mouse.click(24, 240);
    await expect(menu).toBeHidden();
  });

  test("keeps a drawer-owned representation menu above the entity drawer", async ({
    page,
  }) => {
    await setTheme(page, "dark");
    await page.goto(`/interrupts?q=${DRAWER_FIXTURE.interruptId}`);
    await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
    await page
      .locator(`[data-row-key="${DRAWER_FIXTURE.interruptId}"]`)
      .click({ position: { x: 8, y: 8 } });

    const drawer = detailDrawer(page, interruptPath);
    await expect(drawer).toHaveAttribute("data-state", "open");
    await drawer.getByRole("button", { name: "Payload", exact: true }).click();
    const viewer = drawer.locator("[data-payload-viewer]").first();
    await representationTrigger(viewer).click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expectFloatingAbove(menu, drawer);
    await page.getByRole("menuitemradio", { name: "YAML" }).click();
    await expect(viewer).toHaveAttribute("data-mode", "yaml");
  });

  test("keeps nested-inspector controls interactive above the inspector in dark theme", async ({
    page,
  }) => {
    await setTheme(page, "dark");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await openGenerationEventInspector(page);

    const surface = inspector(page);
    const viewer = surface.locator("[data-payload-viewer]").first();
    await expect(viewer).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await representationTrigger(viewer).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expectFloatingAbove(menu, surface);
    await page.getByRole("menuitemradio", { name: "JSON" }).click();
    await expect(viewer).toHaveAttribute("data-mode", "json");

    await expect(viewer).toHaveAttribute("data-clean", "true");
    await expect(payloadContent(viewer)).not.toContainText('"nullable"');
    const cleanToggle = viewer.getByRole("button", {
      name: "Show raw payload",
    });
    await expect(cleanToggle).toHaveAttribute("aria-pressed", "true");
    await cleanToggle.click();
    await expect(viewer).toHaveAttribute("data-clean", "false");
    await expect(payloadContent(viewer)).toContainText('"nullable": null');
    await expect(
      viewer.getByRole("button", { name: "Hide empty payload values" }),
    ).toHaveAttribute("aria-pressed", "false");

    const wrapToggle = viewer.getByRole("button", {
      name: "Disable text wrapping",
    });
    await expect(wrapToggle).toHaveAttribute("aria-pressed", "true");
    await wrapToggle.click();
    await expect(viewer).toHaveAttribute("data-wrap", "false");
    await expect(payloadContent(viewer).locator("pre")).toHaveCSS(
      "white-space",
      "pre",
    );
    await viewer.getByRole("button", { name: "Enable text wrapping" }).click();
    await expect(viewer).toHaveAttribute("data-wrap", "true");
    await expect(payloadContent(viewer).locator("pre")).toHaveCSS(
      "white-space",
      "pre-wrap",
    );

    await viewer.getByRole("button", { name: "Copy JSON payload" }).click();
    await expect(
      viewer.getByRole("button", { name: "Copied" }),
    ).toHaveAttribute("data-copy-state", "copied");
    await expect(viewer.getByRole("status")).toHaveText("JSON payload copied");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('"nullable": null');
  });
});

async function openGenerationEventInspector(page: Page) {
  await page.goto(`/runs?q=${DRAWER_FIXTURE.workflowId}`);
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  await page
    .locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`)
    .click({ position: { x: 8, y: 8 } });
  await expect(detailDrawer(page, runPath)).toHaveAttribute(
    "data-state",
    "open",
  );

  await page.getByRole("button", { name: /^Events \d+$/ }).click();
  await page
    .getByRole("button", {
      name: /^gpt-4\.1-mini response completed\./,
    })
    .click();
  await expect(inspector(page)).toBeVisible();
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.context().addCookies([
    {
      name: "theme",
      value: theme,
      url: "http://localhost:6300",
    },
    {
      name: "theme_resolved",
      value: theme,
      url: "http://localhost:6300",
    },
  ]);
}

async function selectMode(page: Page, viewer: Locator, label: string) {
  await representationTrigger(viewer).click();
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
}

async function selectModeWithKeyboard(
  page: Page,
  viewer: Locator,
  label: string,
) {
  const trigger = representationTrigger(viewer);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const item = page.getByRole("menuitemradio", { name: label, exact: true });
  await expect(item).toBeVisible();
  await item.focus();
  await page.keyboard.press("Enter");
}

async function expectFloatingAbove(floating: Locator, owner: Locator) {
  await expect
    .poll(async () => {
      const [floatingZIndex, ownerZIndex] = await Promise.all([
        floating.evaluate((element) =>
          Number.parseInt(getComputedStyle(element).zIndex, 10),
        ),
        owner.evaluate((element) =>
          Number.parseInt(getComputedStyle(element).zIndex, 10),
        ),
      ]);
      return floatingZIndex - ownerZIndex;
    })
    .toBeGreaterThan(0);
}

const representationTrigger = (viewer: Locator) =>
  viewer.getByRole("button", { name: /^Payload representation:/ });

const payloadContent = (viewer: Locator) =>
  viewer.locator("[data-payload-content]");
