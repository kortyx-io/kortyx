import { expect, test } from "@playwright/test";
import { EVAL_OPAQUE_SUITE, EVAL_SUITE } from "./support/eval-plan";

for (const scope of ["all", "selected"] as const) {
  test(`launches ${scope} suites as one evaluation and drills into suite results`, async ({
    page,
  }) => {
    await page.goto("/evals/runs");
    await page
      .getByRole("button", { name: "Run evaluations", exact: true })
      .click();
    const drawer = page.getByRole("dialog", { name: "Run evaluations" });
    await expect(
      drawer.getByRole("radio", { name: "All suites (3)", exact: true }),
    ).toBeChecked();
    await expect(
      drawer.getByRole("button", { name: "Review conversation definitions" }),
    ).toHaveCount(0);
    if (scope === "selected") {
      await drawer
        .getByRole("radio", { name: "Selected suites", exact: true })
        .check();
      await expect(
        drawer.getByRole("button", { name: "Run evaluations", exact: true }),
      ).toBeDisabled();
      await drawer
        .getByRole("checkbox", { name: /E2E job conversations/ })
        .check();
      await expect(
        drawer.getByRole("group", { name: "Conversations", exact: true }),
      ).toBeVisible();
      await drawer
        .getByRole("checkbox", { name: /Opaque suite identifiers/ })
        .check();
      await expect(
        drawer.getByRole("group", { name: "Conversations", exact: true }),
      ).toHaveCount(0);
      await page.reload();
      await expect(
        drawer.getByRole("checkbox", { name: /Opaque suite identifiers/ }),
      ).toBeChecked();
    }
    await drawer.getByRole("button", { name: "Judge", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: "App judge", exact: true })
      .click();
    await drawer
      .getByRole("button", { name: "Run evaluations", exact: true })
      .click();
    await expect(page).toHaveURL(/\/evals\/evaluations\/[0-9a-f-]+$/);
    const parentPath = new URL(page.url()).pathname;
    const suiteCount = scope === "all" ? 3 : 2;
    await expect(page.locator("[data-row-key]")).toHaveCount(suiteCount);
    await expect(
      page.getByRole("button", { name: EVAL_OPAQUE_SUITE.name!, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${suiteCount}/${suiteCount}`, { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await page.reload();
    await page
      .getByRole("button", { name: EVAL_SUITE.name!, exact: true })
      .click();
    await expect(page).toHaveURL(/\/evals\/runs\/[0-9a-f-]+$/);
    await page
      .getByRole("button", { name: "Ambiguous role", exact: true })
      .click();
    await expect(page.getByText("Step 1 evaluation")).toBeVisible();
    await page.goto(parentPath);
    await page
      .getByRole("button", { name: "Back to evaluation runs", exact: true })
      .click();
    const id = parentPath.split("/").at(-1)!;
    await expect(page.locator(`[data-row-key="${id}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-row-key="${id}"]`)).toContainText(
      `${suiteCount} suites`,
    );
    await page.locator(`[data-row-key="${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(parentPath));
  });
}
