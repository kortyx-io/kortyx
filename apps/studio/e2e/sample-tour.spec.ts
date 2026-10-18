import { SAMPLE_PROJECT } from "@kortyx/telemetry-contracts";
import { expect, type Page, test } from "@playwright/test";

// Maintained for CI. Do not run locally when browser testing is disabled.
const hub = (page: Page) =>
  page.getByRole("dialog", { name: "Explore Studio", exact: true });
const tooltip = (page: Page) => page.getByRole("alertdialog");
async function openHub(page: Page) {
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Explore Studio", exact: true })
    .click();
}
async function quickTour(page: Page) {
  await openHub(page);
  await hub(page)
    .locator('[data-slot="card"]')
    .filter({ hasText: "Quick orientation" })
    .getByRole("button", { name: "Start Quick orientation", exact: true })
    .click();
}

test("optional chapter navigates forward, back, finishes and restarts", async ({
  page,
}) => {
  await page.goto("/sample/runs?status=failed");
  await expect(tooltip(page)).toHaveCount(0);
  await quickTour(page);
  await expect(tooltip(page)).toHaveAccessibleName("Explore a sample project");
  await expect(
    tooltip(page).getByRole("button", { name: "Back", exact: true }),
  ).toBeDisabled();
  await tooltip(page)
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await expect(tooltip(page)).toHaveAccessibleName("Find an execution");
  await tooltip(page)
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await expect(tooltip(page)).toHaveAccessibleName("Understand the execution");
  await expect(page).toHaveURL(
    new RegExp(`/sample/runs/${SAMPLE_PROJECT.runs.success}$`),
  );
  await tooltip(page)
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await expect(tooltip(page)).toHaveAccessibleName("Find an execution");
  await tooltip(page)
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await tooltip(page)
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await expect(hub(page)).toContainText("Chapter completed");
  await hub(page)
    .getByRole("button", { name: "Restart chapter", exact: true })
    .click();
  await expect(tooltip(page)).toHaveAccessibleName("Explore a sample project");
  await tooltip(page)
    .getByRole("button", { name: "Skip", exact: true })
    .click();
  await expect(hub(page)).toContainText("Chapter skipped");
});

test("full tour completes all six chapters and shows the optional library", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/sample/runs");
  await openHub(page);
  await hub(page)
    .getByRole("button", { name: "Take the full tour", exact: true })
    .click();
  const chapters = [
    ["Explore a sample project", 3],
    ["Narrow the investigation", 4],
    ["A session spans several turns", 4],
    ["Read the requested decision", 3],
    ["Read a saved version", 3],
    ["Start with the expectation", 4],
  ] as const;
  for (const [index, [title, count]] of chapters.entries()) {
    await expect(tooltip(page)).toHaveAccessibleName(title);
    await expect(tooltip(page)).toContainText(`Chapter ${index + 1} of 6`);
    for (let step = 1; step < count; step++)
      await tooltip(page)
        .getByRole("button", { name: "Next", exact: true })
        .click();
    await tooltip(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    if (index < chapters.length - 1)
      await hub(page)
        .getByRole("button", { name: "Continue", exact: true })
        .click();
  }
  await expect(hub(page)).toContainText("6 chapters completed · 0 skipped");
  await hub(page)
    .getByRole("button", { name: "All guides", exact: true })
    .click();
  await expect(hub(page)).toContainText("Personalize Studio");
});

test("reload pauses the full tour at the last checkpoint", async ({ page }) => {
  await page.goto("/sample/runs");
  await openHub(page);
  await hub(page)
    .getByRole("button", { name: "Take the full tour", exact: true })
    .click();
  await tooltip(page)
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await expect(tooltip(page)).toHaveAccessibleName("Find an execution");
  await page.reload();
  await expect(tooltip(page)).toHaveCount(0);
  await openHub(page);
  await hub(page)
    .getByRole("button", { name: "Resume tour", exact: true })
    .click();
  await expect(tooltip(page)).toHaveAccessibleName("Find an execution");
  await tooltip(page)
    .getByRole("button", { name: "Skip chapter", exact: true })
    .click();
  await expect(hub(page).getByLabel("Chapter result")).toContainText("Skipped");
});

test("mobile focus and settled spotlight survive exit and restart", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/sample/runs/${SAMPLE_PROJECT.runs.failure}`);
  await quickTour(page);
  await tooltip(page)
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await tooltip(page)
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await expect(tooltip(page)).toHaveAccessibleName("Understand the execution");
  const cutout = page.locator(".react-joyride__overlay path").nth(1);
  await expect
    .poll(() =>
      cutout.evaluate((element) => (element as SVGGraphicsElement).getBBox().x),
    )
    .toBeLessThan(30);
  const box = await tooltip(page).boundingBox();
  if (!box) throw new Error("Tooltip is missing");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  for (let index = 0; index < 5; index++) {
    await page.keyboard.press("Tab");
    expect(
      await tooltip(page).evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(tooltip(page)).toHaveCount(0);
  await expect(page).toHaveURL(
    new RegExp(`/sample/runs/${SAMPLE_PROJECT.runs.success}$`),
  );
  await openHub(page);
  await hub(page)
    .getByRole("button", { name: "Resume tour", exact: true })
    .click();
  await expect(tooltip(page)).toHaveAccessibleName("Understand the execution");
});

test("blocked storage and missing targets remain recoverable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  await page.goto("/sample/runs");
  await openHub(page);
  await expect(hub(page)).toContainText(
    "progress will last only for this visit",
  );
  await page
    .locator('[data-tour-id="sample-project-selector"]')
    .evaluate((element) => element.removeAttribute("data-tour-id"));
  await hub(page)
    .getByRole("button", { name: "Take the full tour", exact: true })
    .click();
  await expect(hub(page).getByRole("alert")).toContainText(
    "could not find its next step",
    { timeout: 25_000 },
  );
  await expect(page.locator("#react-joyride-portal")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Project", exact: true })
    .evaluate((element) =>
      element.setAttribute("data-tour-id", "sample-project-selector"),
    );
  await hub(page)
    .getByRole("button", { name: "Resume tour", exact: true })
    .click();
  await expect(tooltip(page)).toHaveAccessibleName("Explore a sample project");
});
