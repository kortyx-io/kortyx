import { expect, test } from "@playwright/test";
import { OUTPUT_SUITE } from "./support/eval-output-plan";
import { EVAL_FIXTURE } from "./support/eval-plan";

test("native workflow outputs are checked, persisted and inspectable through suite and case drawers", async ({
  page,
}) => {
  await page.goto(
    `/evals/suites?q=${encodeURIComponent(OUTPUT_SUITE.name ?? "")}`,
  );
  await page
    .getByRole("link", { name: "Product output contracts", exact: true })
    .click();
  const suitePath = `/evals/suites/${EVAL_FIXTURE.targetId}/${OUTPUT_SUITE.id}`;
  const suite = page.locator(`[data-detail-drawer="${suitePath}"]`);
  await expect(
    suite.getByRole("heading", { name: "Conversation plan" }),
  ).toBeVisible();
  const requirements = suite.getByRole("region", {
    name: "Required structured outputs",
  });
  // Named sections are regions. First case explicitly requires two independent outputs.
  await expect(requirements).toHaveCount(5);
  await expect(requirements.first()).toContainText("app.product-list");
  await expect(requirements.first()).toContainText("Any version");
  await expect(requirements.first()).toContainText("app.product-summary");
  await expect(requirements.first()).toContainText("v1");
  await suite.getByRole("button", { name: "Run suite", exact: true }).click();
  const launch = page.getByRole("dialog", { name: "Run evaluations" });
  await launch.getByRole("button", { name: "Judge", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "App judge", exact: true })
    .click();
  await launch
    .getByRole("button", { name: "Run evaluations", exact: true })
    .click();
  await expect(page).toHaveURL((url) =>
    /^\/evals\/evaluations\/[0-9a-f-]+$/.test(url.pathname),
  );
  await page
    .getByRole("button", { name: OUTPUT_SUITE.name!, exact: true })
    .click();
  await expect(page).toHaveURL((url) =>
    /^\/evals\/runs\/[0-9a-f-]+$/.test(url.pathname),
  );
  const runPath = new URL(page.url()).pathname;
  for (const [id, status] of [
    ["multiple-outputs", "Passed"],
    ["exact-version", "Passed"],
    ["wrong-version", "Failed"],
    ["missing-output", "Failed"],
    ["partial-only", "Failed"],
  ])
    await expect(page.locator(`[data-row-key="${id}:1"]`)).toContainText(
      status ?? "",
      { timeout: 15_000 },
    );
  await page.reload();
  await expect(
    page.locator('[data-row-key="multiple-outputs:1"]'),
  ).toContainText("Passed");
  await page
    .getByRole("button", { name: "Product list and summary", exact: true })
    .click();
  const casePath = `/evals/cases/${runPath.split("/").at(-1)}/multiple-outputs/1`;
  const inspector = page.locator(`[data-detail-drawer="${casePath}"]`);
  await expect(
    inspector.getByRole("region", { name: "Required structured outputs" }),
  ).toContainText("app.product-summary");
  await inspector
    .getByRole("button", { name: "Conversation and debugging", exact: true })
    .click();
  await inspector
    .getByRole("button", { name: "Structured output", exact: true })
    .click();
  await inspector
    .getByRole("button", {
      name: "Payload representation: Pretty",
      exact: true,
    })
    .click();
  await page.getByRole("menuitemradio", { name: "JSON", exact: true }).click();
  await expect(inspector).toContainText("Blue backpack");
  await expect(inspector).toContainText("One blue backpack, USD 80.");
  await page.reload();
  await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
  await expect(page.locator("main").last()).toContainText("Blue backpack");
  await page.getByRole("link", { name: "Eval run", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Obsolete product list contract",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "Required completed structured outputs were not observed: app.product-list (version 1).",
      { exact: true },
    ),
  ).toBeVisible();
});

test("output requirements remain readable at half width after opening a suite directly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await page.goto(`/evals/suites/${EVAL_FIXTURE.targetId}/${OUTPUT_SUITE.id}`);
  await expect(
    page.getByRole("region", { name: "Required structured outputs" }),
  ).toHaveCount(5);
  await expect(
    page.getByText("app.product-summary", { exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
