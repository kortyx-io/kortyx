import { expect, test } from "@playwright/test";

test("first-time Studio entry completes setup inside Settings and returns to Runs", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("heading", { name: "Get started with Studio" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your Studio API connection is ready."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText(
      "npx kortyx studio credentials --format dotenv --service-name my-agent",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("link", { name: "Start observing", exact: true })
    .click();
  await expect(page).toHaveURL(/\/runs$/);
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "kortyx_studio_setup",
    )?.value,
  ).toBe("1");
  await page.goto("/");
  await expect(page).toHaveURL(/\/runs$/);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Get started with Studio" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Appearance", exact: true }),
  ).toBeVisible();
});
