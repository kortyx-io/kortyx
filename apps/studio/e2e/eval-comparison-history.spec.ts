import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { expect, test } from "@playwright/test";

const evaluation = `/sample/evals/evaluations/${sample.evaluationId}`;

test("comparison groups and arrow navigation survive reload and browser Back/Forward", async ({
  page,
}) => {
  await page.goto("/sample/evals/runs?live=false");
  const row = page.locator("[data-row-key]").filter({
    has: page.getByRole("button", {
      name: "Support quality — recorded sample",
      exact: true,
    }),
  });
  await row.getByRole("button", { name: "2 improved", exact: true }).click();
  const modal = page.locator("[data-eval-comparison-modal]");
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("changeRun") === sample.evaluationId &&
      url.searchParams.get("changeGroup") === "improved",
  );
  const first = page.url();
  const title = modal.getByRole("heading", {
    name: "Shipment status and a follow-up",
    exact: true,
  });
  await expect(title).toBeFocused();
  await expect(title).toHaveCSS("outline-style", "none");
  await page.keyboard.press("ArrowRight");
  await expect(modal.locator("footer")).toContainText("2 of 2");
  await expect(
    modal.getByRole("heading", {
      name: "Review before creating a credit",
      exact: true,
    }),
  ).toBeVisible();
  const second = page.url();
  expect(second).not.toBe(first);
  await page.goBack();
  await expect(title).toBeVisible();
  await expect(page).toHaveURL(first);
  await page.goForward();
  await expect(page).toHaveURL(second);
  await page.reload();
  await expect(modal.locator("footer")).toContainText("2 of 2");
  await page.keyboard.press("ArrowLeft");
  await expect(title).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(
    (url) =>
      !url.searchParams.has("changeCase") &&
      url.searchParams.get("live") === "false",
  );
  await page.goBack();
  await expect(title).toBeVisible();
});

test("baseline and independent repetitions are shareable and restored through history", async ({
  page,
}) => {
  await page.goto("/sample/evals/runs?q=Consistency&live=false");
  await page
    .getByRole("button", {
      name: "Consistency check — three repetitions",
      exact: true,
    })
    .click();
  const row = page.locator("[data-row-key]").filter({
    has: page.getByRole("link", {
      name: "Shipment status and a follow-up",
      exact: true,
    }),
  });
  await row
    .getByRole("button", { name: "Started failing", exact: true })
    .click();
  const modal = page.locator("[data-eval-comparison-modal]");
  const current = modal.getByRole("button", {
    name: "This run repetition",
    exact: true,
  });
  await expect(current).toBeEnabled();
  await current.focus();
  const selectedCase = new URL(page.url()).searchParams.get("changeCase");
  await page.keyboard.press("ArrowRight");
  expect(new URL(page.url()).searchParams.get("changeCase")).toBe(selectedCase);
  await current.click();
  await page.getByRole("menuitemradio", { name: /Repetition 3/ }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("currentRepetition") === "3",
  );
  await modal
    .getByRole("button", { name: "Comparison baseline", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: /initial baseline/ }).click();
  await expect(modal).toContainText("Higher pass rate");
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("changeBaseline") === sample.evaluationIds.baseline,
  );
  const baselineUrl = page.url();
  await page.reload();
  await expect(current).toContainText("Repetition 3");
  await expect(modal.locator('[data-comparison-side="Earlier"]')).toContainText(
    "initial baseline",
  );
  await page.goBack();
  await expect(modal).toContainText("Started failing");
  await expect(current).toContainText("Repetition 3");
  await page.goForward();
  await expect(page).toHaveURL(baselineUrl);
  await expect(modal).toContainText("Higher pass rate");
  await modal.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    modal.getByRole("heading", {
      name: "Honor a declined review",
      exact: true,
    }),
  ).toBeVisible();
  await page.goBack();
  await expect(current).toContainText("Repetition 3");
  await expect(
    modal.getByRole("heading", {
      name: "Shipment status and a follow-up",
      exact: true,
    }),
  ).toBeVisible();
});

test("conversation navigation follows the suite and table search without informational banners", async ({
  page,
}) => {
  await page.goto(`${evaluation}?suiteRun=${sample.evalRunId}&live=false`);
  const search = page.getByRole("searchbox", {
    name: "Search conversations",
    exact: true,
  });
  await search.fill("Keep estimates");
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await page
    .locator("[data-row-key]")
    .getByRole("button", { name: "Unchanged", exact: true })
    .click();
  const modal = page.locator("[data-eval-comparison-modal]");
  await expect(modal.locator("footer")).toContainText("1 of 1");
  await expect(
    modal.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    modal.getByRole("heading", {
      name: "Keep estimates distinct from promises",
      exact: true,
    }),
  ).toBeVisible();
  await expect(modal.locator("footer")).toContainText("1 of 1");
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(search).toHaveValue("Keep estimates");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("suiteRun") === sample.evalRunId,
  );
  await search.fill("");
  await expect(page.locator("[data-row-key]")).toHaveCount(3);
  await page
    .locator("[data-row-key]")
    .filter({
      has: page.getByRole("link", {
        name: "Shipment status and a follow-up",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Now passing", exact: true })
    .click();
  await expect(modal.locator("footer")).toContainText("1 of 3");
  await modal.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    modal.getByRole("heading", {
      name: "Keep estimates distinct from promises",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("suiteRun") === sample.evalRunId,
  );
});
