import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import migration from "../fixtures/studio-documentation-migration.json";

const areas = [
  ["/docs/sdk/start-here", "Kortyx SDK"],
  ["/docs/studio/overview", "Kortyx Studio"],
  ["/docs/cloud", "Kortyx Cloud"],
  ["/docs/self-hosting", "Self-hosting"],
  ["/docs/cli", "Kortyx CLI"],
];

test("old Studio HTML and Markdown links reach their corresponding canonical guides", async ({
  request,
}) => {
  for (const page of migration)
    for (const extension of ["", ".md"]) {
      const source = page.source + extension;
      const destination = page.destination + extension;
      const response = await request.get(source, { maxRedirects: 0 });
      expect(response.status(), source).toBe(
        source === destination ? 200 : 308,
      );
      if (source !== destination)
        expect(
          new URL(response.headers().location, response.url()).pathname,
          source,
        ).toBe(destination);
      const target = await request.get(destination, { maxRedirects: 0 });
      expect(target.status(), destination).toBe(200);
      expect(target.headers()["content-type"]).toContain(
        extension ? "text/markdown" : "text/html",
      );
    }
});

test("a moved help heading preserves its query and lands on the actual section", async ({
  page,
}) => {
  await page.goto("/docs/studio/v0/cloud-account?source=old-studio#passkeys");
  await expect(page).toHaveURL(
    /\/docs\/cloud\/sign-in\?source=old-studio#passkeys$/,
  );
  await expect(page.locator("h3#passkeys")).toBeVisible();
  await page.goto(
    "/docs/studio/cli-commands?source=old-bookmark#run-locally-without-studio",
  );
  await expect(page).toHaveURL(
    /\/docs\/cli\/local-evaluations\?source=old-bookmark#run-locally-without-studio$/,
  );
  await expect(page.locator("h2#run-locally-without-studio")).toBeVisible();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/docs/cli/reference#constructor");
  await expect(page.locator("main h1")).toHaveText("CLI command reference");
  await page.goto("/docs/cli/reference#%invalid");
  await expect(page.locator("main h1")).toBeVisible();
  expect(errors).toEqual([]);
});

test("area entry points have canonical SEO, social metadata, and structured data", async ({
  page,
  request,
}) => {
  for (const [url, name] of areas) {
    await page.goto(url ?? "/docs");
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page).toHaveTitle(new RegExp(name ?? "Kortyx"));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://kortyx.io${url}`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.{100,160}/,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `https://kortyx.io${url}`,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    const schemas = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const articles = schemas.flatMap((source) => {
      const schema = JSON.parse(source);
      return (schema["@graph"] ?? [schema]).filter(
        (node: { "@type"?: string }) => node["@type"] === "TechArticle",
      );
    });
    expect(articles).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const [url] of areas)
    expect(sitemap).toContain(`<loc>https://kortyx.io${url}</loc>`);
  for (const entry of migration.filter((p) => p.source !== p.destination))
    expect(sitemap).not.toContain(
      `<loc>https://kortyx.io${entry.source}</loc>`,
    );
});

test("readers can choose every area and find shared guides from Cloud search", async ({
  page,
}, testInfo) => {
  await page.goto("/docs");
  const notice = page.getByTestId("consent-banner-root");
  if (await notice.isVisible())
    await notice.getByRole("button", { name: "Got it", exact: true }).click();
  for (const [url, name] of areas)
    await expect(
      page
        .locator("main")
        .getByRole("link")
        .filter({ hasText: name ?? "" })
        .first(),
    ).toHaveAttribute("href", url ?? "");
  const output = process.env.KORTYX_DOCS_SCREENSHOTS;
  if (output) {
    await mkdir(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, `${testInfo.project.name}-docs-index.png`),
      fullPage: true,
    });
  }
  await page.locator('main a[href="/docs/cloud"]').click();
  await expect(page.locator("main h1")).toHaveText("Use Kortyx Cloud");
  await page
    .getByRole("button", { name: "Search documentation", exact: true })
    .click();
  const search = page.getByRole("dialog", { name: "Search docs", exact: true });
  await expect(search).toContainText("All documentation");
  await search.getByRole("searchbox").fill("Investigate a slow run");
  const result = search.locator('a[href="/docs/studio/slow-runs"]');
  await expect(result).toBeVisible();
  await search
    .getByRole("button", { name: "Search this area", exact: true })
    .click();
  await expect(result).toHaveCount(0);
  await search
    .getByRole("button", { name: "Search all documentation", exact: true })
    .click();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/\/docs\/studio\/slow-runs$/);
  await expect(page.locator("main h1")).toHaveText("Investigate a slow run");
  const mobileMenu = page.getByRole("button", {
    name: "Open menu",
    exact: true,
  });
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  if (isMobile) await mobileMenu.click();
  await page.getByRole("button", { name: /^Choose documentation:/ }).click();
  const areaMenu = page.getByRole("menu");
  await expect(areaMenu.getByRole("menuitem")).toHaveCount(5);
  await areaMenu.locator('a[href="/docs/cli"]').click();
  await expect(page).toHaveURL(/\/docs\/cli$/);
  if (isMobile)
    await expect(
      page.getByRole("dialog", { name: "Documentation Menu", exact: true }),
    ).toBeHidden();
  for (const [url, name] of areas.slice(1)) {
    await page.goto(url ?? "/docs");
    if (output)
      await page.screenshot({
        path: path.join(
          output,
          `${testInfo.project.name}-${name?.toLowerCase().replaceAll(" ", "-")}.png`,
        ),
        fullPage: true,
      });
  }
});
