import { expect, test } from "@playwright/test";
import {
  DRAWER_FIXTURE,
  emitLiveRunChange,
  LIVE_RUN_ID,
} from "./support/telemetry-fixture";

test.describe("Studio live refresh", () => {
  test("receives committed run changes without losing list state", async ({
    page,
    request,
  }) => {
    await page.goto(`/runs?q=${DRAWER_FIXTURE.workflowId}`);
    await expect(page.locator('[data-table-ready="true"]')).toBeVisible();

    const live = page.getByRole("button", {
      name: /Live refresh:/,
    });
    await live.click();
    await expect(live).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", {
        name: /Live refresh: Connected\./,
      }),
    ).toBeVisible();

    await page
      .locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`)
      .click({ position: { x: 8, y: 8 } });
    const runDrawer = page.locator(
      `[data-detail-drawer="/runs/${DRAWER_FIXTURE.runId}"]`,
    );
    await expect(runDrawer).toHaveAttribute("data-state", "open");

    await emitLiveRunChange(request);

    await expect(page.locator(`[data-row-key="${LIVE_RUN_ID}"]`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(runDrawer).toHaveAttribute("data-state", "open");
    await expect(page).toHaveURL(
      new RegExp(
        `/runs/${DRAWER_FIXTURE.runId}\\?q=${DRAWER_FIXTURE.workflowId}.*live=true`,
      ),
    );

    await runDrawer.getByRole("button", { name: "Close detail" }).click();
    await expect(runDrawer).toHaveCount(0);
    await expect(page.locator(`[data-row-key="${LIVE_RUN_ID}"]`)).toBeVisible();
  });
});
