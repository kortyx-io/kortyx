import { expect, test } from "@playwright/test";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

test.describe("Interrupt semantics", () => {
  test("renders captured static choices and their selected response", async ({
    page,
  }) => {
    await page.goto(`/interrupts/${DRAWER_FIXTURE.interruptId}`);

    await expect(page.getByText("2 static options").first()).toBeVisible();
    await expect(page.getByText("Approve", { exact: true })).toBeVisible();
    await expect(page.getByText("Continue to publishing.")).toBeVisible();
    const response = page.getByText("Response", { exact: true }).locator("..");
    await expect(response.getByText("approve", { exact: true })).toBeVisible();
  });

  test("describes a client-resolved picker without calling it zero options", async ({
    page,
  }) => {
    await page.goto(`/interrupts/${DRAWER_FIXTURE.dynamicInterruptId}`);

    await expect(page.getByText("Dynamic picker").first()).toBeVisible();
    await expect(page.getByText("pick-agent v1").first()).toBeVisible();
    await expect(
      page.getByText(/Options are resolved by the client using pick-agent/),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Response content was not captured by the telemetry policy.",
      ),
    ).toBeVisible();
    await expect(page.getByText(/0 options/i)).toHaveCount(0);
  });

  test("distinguishes an expired free-form request in details and the list", async ({
    page,
  }) => {
    await page.goto(`/interrupts/${DRAWER_FIXTURE.freeformInterruptId}`);

    await expect(page.getByText("Free-form response").first()).toBeVisible();
    await expect(
      page.getByText("Expired before a response was received."),
    ).toBeVisible();

    await page.goto(`/interrupts?q=${DRAWER_FIXTURE.dynamicInterruptId}`);
    const row = page.locator(
      `[data-row-key="${DRAWER_FIXTURE.dynamicInterruptId}"]`,
    );
    await expect(row).toContainText("Dynamic picker");
    await expect(row).not.toContainText("0 options");
  });
});
