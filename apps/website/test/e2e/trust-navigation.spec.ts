import { expect, test } from "@playwright/test";

test("company and Cloud menus stay separate while the page scrolls", async ({
  page,
}) => {
  await page.goto("/cookies");
  await page.getByRole("button", { name: "Got it", exact: true }).click();

  for (const scrollY of [600, 900, 1200]) {
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: "instant" }),
      scrollY,
    );
    await expect
      .poll(() =>
        page.locator("aside nav").evaluateAll(([company, cloud]) => {
          return (
            company.getBoundingClientRect().bottom <=
            cloud.getBoundingClientRect().top
          );
        }),
      )
      .toBe(true);
  }
});

test("all menu links are reachable on a short desktop viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop sticky sidebar");
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/cloud/terms");
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
  const sidebar = page.locator("aside > div");
  await expect(sidebar).toBeInViewport({ ratio: 1 });
  expect(
    await sidebar.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  const pageScroll = await page.evaluate(() => scrollY);
  await sidebar.hover();
  await page.mouse.wheel(0, 700);
  const lastLink = sidebar.getByRole("link", {
    name: "Subprocessors",
    exact: true,
  });
  await expect(lastLink).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
  await lastLink.click();
  await expect(page).toHaveURL(/\/cloud\/subprocessors$/);
});
