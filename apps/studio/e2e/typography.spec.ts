import { expect, test } from "@playwright/test";

test("uses the compact observability scale without shrinking the browser root", async ({
  page,
}) => {
  await page.goto("/settings/general");
  await expect(
    page.getByRole("heading", { name: "Local scope", exact: true }),
  ).toHaveCSS("font-size", "16px");
  await expect(page.getByRole("link", { name: "Runs", exact: true })).toHaveCSS(
    "font-size",
    "12px",
  );
  await expect(page.locator("body")).toHaveCSS("font-size", "14px");
  await expect(page.locator("html")).toHaveCSS("font-size", "16px");
  await expect(
    page.getByRole("link", { name: "Connection", exact: true }),
  ).toHaveCSS("font-size", "13px");
});
