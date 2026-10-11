import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const screenshotDir = process.env.LEGAL_SCREENSHOT_DIR;

test("Cloud drafts, exact archives and current links remain readable on every viewport", async ({
  page,
  request,
}, testInfo) => {
  const manifest = await (
    await request.get("/legal/cloud/manifest.json")
  ).json();
  await page.goto("/cloud/terms");
  await page
    .getByTestId("consent-banner-root")
    .getByRole("button", { name: "Got it", exact: true })
    .click();
  for (const release of manifest.releases) {
    const path = new URL(release.versionUrl).pathname;
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("article")).toContainText(
      "Not production-approved",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      release.versionUrl,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    const response = await request.get(new URL(release.contentUrl).pathname);
    const bytes = await response.text();
    expect(createHash("sha256").update(bytes, "utf8").digest("hex")).toBe(
      release.hash,
    );
    const document = JSON.parse(bytes);
    expect(await page.locator("[data-legal-text]").allTextContents()).toEqual(
      document.sections.map((section: { text: string }) => section.text),
    );
    for (const href of await page
      .locator('[data-legal-text] a[href^="/"]')
      .evaluateAll((links) =>
        links.map((link) => (link as HTMLAnchorElement).href),
      )) {
      expect((await request.get(new URL(href).pathname)).status(), href).toBe(
        200,
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (
      screenshotDir &&
      (release.version === manifest.currentWebsiteVersion ||
        (release.slug === "terms" &&
          release.version === "2026-10-10.staging.3"))
    ) {
      await mkdir(screenshotDir, { recursive: true });
      await page.screenshot({
        path: `${screenshotDir}/${testInfo.project.name}-${release.slug}-${release.version}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("link", { name: "Current website draft", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/cloud/${release.slug}$`));
    await expect(
      page
        .getByRole("navigation", { name: "Cloud legal documents" })
        .locator('a[aria-current="page"]'),
    ).toHaveCount(1);
    await expect(page.locator("article")).toContainText(
      manifest.currentWebsiteVersion,
    );
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Cloud DPA", exact: true })
      .click();
    await expect(page).toHaveURL(/\/cloud\/dpa$/);
  }
  for (const path of [
    "/cloud/unknown",
    "/cloud/terms/unknown",
    "/cloud/terms/2026-10-11.staging.4/extra",
    "/cloud/privacy/2026-10-10.staging.3",
    "/legal/cloud/terms/unknown.json",
  ])
    expect((await request.get(path)).status()).toBe(404);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("https://kortyx.io/cloud/");
  // Navigation, viewing, and cookie acknowledgement never call a terms backend.
  expect(await page.locator('button:has-text("Accept Terms")').count()).toBe(0);
});

test("original website drafts keep their content and operator snapshot", async ({
  page,
  request,
}) => {
  expect((await page.goto("/legal/2026-10-04.2-draft"))?.status()).toBe(200);
  await expect(page.locator("article")).not.toContainText("Kortyx S.L.");
  await page.goto("/legal/2026-10-11.3-draft");
  await expect(page.locator("article")).toContainText("Kortyx S.L.");
  expect((await request.get("/terms/unknown")).status()).toBe(404);
});
