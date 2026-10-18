import { expect, test } from "@playwright/test";

test("legal documents share a readable header, collapsible index and version footer", async ({
  page,
}) => {
  for (const path of [
    "/terms",
    "/privacy",
    "/legal",
    "/cookies",
    "/cloud/terms",
    "/cloud/privacy",
    "/cloud/dpa",
    "/cloud/subprocessors",
  ]) {
    await page.goto(path);
    if (path === "/terms")
      await page.getByRole("button", { name: "Got it", exact: true }).click();
    const header = page.locator("main > header");
    await expect(header.locator("h1")).toBeVisible();
    await expect(header.locator("time")).toHaveText("11 October 2026");
    expect(await header.innerText()).not.toMatch(
      /draft|staging|framework available/i,
    );
    const index = page.getByRole("navigation", { name: "On this page" });
    await expect(index).toBeHidden();
    await page.getByText("Contents", { exact: true }).click();
    await expect(index).toBeVisible();
    const firstLink = index.getByRole("link").first();
    const target = await firstLink.getAttribute("href");
    await firstLink.click();
    await expect(page.locator(`${target} h2`)).toBeInViewport();
    const footer = page.locator("article footer");
    const history = page.getByRole("navigation", { name: "Document history" });
    await expect(history).toBeHidden();
    expect(await footer.innerText()).not.toMatch(/draft|staging|SHA-256/);
    await footer.locator("summary").click();
    await expect(history).toBeVisible();
    await expect(footer).toContainText("SHA-256");
    await expect(footer).not.toContainText("Legal review pending");
    const permanentLink = footer.getByRole("link", {
      name: "Permanent link",
      exact: true,
    });
    const versionUrl = await permanentLink.getAttribute("href");
    await permanentLink.click();
    await expect(page).toHaveURL(
      new RegExp(`${versionUrl?.replaceAll(".", "\\.")}$`),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
