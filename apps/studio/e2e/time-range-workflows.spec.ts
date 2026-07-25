import { expect, test } from "@playwright/test";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

test.describe("Studio time ranges and workflow cohorts", () => {
  test("keeps range and version filters URL-backed and preserves the exact View runs cohort", async ({
    page,
  }) => {
    await page.goto(
      `/workflows?workflow=${DRAWER_FIXTURE.workflowId}&range=All+time`,
    );
    await expect(
      page.getByRole("heading", { name: "Workflows" }),
    ).toBeVisible();
    await expect(page.locator('[data-workflows-ready="true"]')).toBeVisible();

    const range = page.getByRole("combobox", { name: "Time range" });
    const version = page.getByRole("combobox", {
      name: "Workflow version",
    });
    await expect(range).toHaveValue("All time");
    await version.selectOption("1.0.0-e2e");
    await expect(page).toHaveURL(/version=1\.0\.0-e2e/);

    const allTimeRuns = page.getByRole("link", { name: "View runs" });
    await expect(allTimeRuns).toHaveAttribute(
      "href",
      new RegExp(
        `workflow=${DRAWER_FIXTURE.workflowId}.*version=1\\.0\\.0-e2e.*range=All\\+time`,
      ),
    );

    await range.selectOption("7 days");
    await expect(page).toHaveURL(/range=7\+days/);
    await expect(allTimeRuns).toHaveAttribute(
      "href",
      /range=Custom\+range.*startedAfter=.*startedBefore=/,
    );

    await page.goBack();
    await expect(range).toHaveValue("All time");
    await page.goForward();
    await expect(range).toHaveValue("7 days");
  });

  test("round-trips custom UTC bounds through reload and reports partial ranges", async ({
    page,
  }) => {
    const after = "2026-07-20T00:00:00.000Z";
    const before = "2026-07-26T23:59:59.999Z";
    await page.goto(
      `/workflows?workflow=${DRAWER_FIXTURE.workflowId}&range=Custom+range&startedAfter=${encodeURIComponent(after)}&startedBefore=${encodeURIComponent(before)}`,
    );

    const range = page.getByRole("combobox", { name: "Time range" });
    await expect(range).toHaveValue("Custom range");
    await expect(
      page.getByRole("button", { name: "Jul 20, 2026 – Jul 26, 2026" }),
    ).toBeVisible();
    await page.reload();
    await expect(range).toHaveValue("Custom range");
    await expect(page.getByRole("link", { name: "View runs" })).toHaveAttribute(
      "href",
      new RegExp(
        `startedAfter=${encodeURIComponent(after)}.*startedBefore=${encodeURIComponent(before)}`,
      ),
    );

    await page.goto(
      `/workflows?range=Custom+range&startedAfter=${encodeURIComponent(after)}`,
    );
    await expect(
      page.getByText("End time is required for a custom range."),
    ).toBeVisible();
  });
});
