import { expect, test } from "@playwright/test";

test("first-time OSS entry lands on Runs with operator setup in routed Settings", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/runs$/);
  await expect(
    page.getByRole("heading", { name: "Get started with Studio" }),
  ).toHaveCount(0);
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "kortyx_studio_setup",
    ),
  ).toBeUndefined();
  await page.goto("/settings/connection");
  await expect(
    page.getByRole("heading", { name: "Connection", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "API keys", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/api-keys$/);
  await expect(
    page.getByText(
      "npx kortyx studio credentials --format dotenv --service-name my-agent",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Environments", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Telemetry environment", exact: true }),
  ).toHaveCount(0);
  await page.goto("/");
  await expect(page).toHaveURL(/\/runs$/);
  await page.goto("/settings/appearance");
  await expect(
    page.getByRole("heading", { name: "Get started with Studio" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Appearance", exact: true }),
  ).toBeVisible();
});
