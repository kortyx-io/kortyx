import { expect, test } from "@playwright/test";

test.describe("Studio settings and shell identity", () => {
  test("shows real project context and only supported identity-menu actions", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(page.locator('[data-settings-ready="true"]')).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Local installation")).toBeVisible();
    await expect(
      page.getByText("Default Project", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("studio:read")).toBeVisible();
    await expect(page.getByText("Configured · ••••••••")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("ktyx_");

    await page.getByRole("button", { name: /Open Studio menu\./ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Settings" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Documentation/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("menu").getByText("v0.1.0", { exact: true }),
    ).toBeVisible();

    for (const unsupported of [
      "Upgrade to Pro",
      "Account",
      "Billing",
      "Notifications",
      "Log out",
    ]) {
      await expect(page.getByText(unsupported, { exact: true })).toHaveCount(0);
    }
  });

  test("persists theme preference for server-rendered reloads", async ({
    page,
  }) => {
    await page.goto("/settings");

    const light = page.getByRole("button", { name: /Light/ });
    await light.click();
    await expect(light).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-preference",
      "light",
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-preference",
      "light",
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-resolved",
      "light",
    );
    await expect(light).toHaveAttribute("aria-pressed", "true");

    const dark = page.getByRole("button", { name: /Dark/ });
    await dark.click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-preference",
      "dark",
    );
  });
});
