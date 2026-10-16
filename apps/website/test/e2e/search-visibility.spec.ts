import { expect, test } from "@playwright/test";
import legacyDocs from "../fixtures/legacy-docs-urls.json";

test("historical docs URLs permanently redirect to their matching HTML or Markdown page", async ({
  request,
}) => {
  for (const { source, destination } of legacyDocs.restored) {
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.status(), source).toBe(308);
    expect(
      new URL(response.headers().location, response.url()).pathname,
      source,
    ).toBe(destination);
    const target = await request.get(destination, { maxRedirects: 0 });
    expect(target.status(), destination).toBe(200);
    expect(target.headers()["content-type"], destination).toContain(
      destination.endsWith(".md") ? "text/markdown" : "text/html",
    );
    if (destination.endsWith(".md")) {
      expect(await target.text(), destination).toMatch(/# /);
    }
  }
});

test("sample API endpoints, source imports, and missing resources remain 404", async ({
  request,
}) => {
  for (const path of [
    ...legacyDocs.notDocumentation,
    "/docs/sdk/guides/99-no-such-page.md",
    "/docs/studio/v99/overview",
    "/01-getting-started/99-no-such-page.md",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
  }
});

test("legacy Markdown redirects preserve query strings", async ({
  request,
}) => {
  const response = await request.get(
    "/docs/03-guides/11-sse.md?source=old-link&lang=en",
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe(
    "/docs/sdk/guides/sse.md?source=old-link&lang=en",
  );
});

test("homepage has a descriptive title and pages exclude the docs search corpus", async ({
  request,
}) => {
  for (const path of ["/", "/product", "/docs/studio/overview"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    // Previously every page carried over 1 MB of unrelated search content.
    expect(Buffer.byteLength(html)).toBeLessThan(300_000);
    if (path === "/") {
      expect(html).toContain(
        "<title>Kortyx — TypeScript Framework for AI Agents</title>",
      );
    }
  }
});

test("www redirects permanently and preserves paths and queries", async ({
  request,
}) => {
  for (const path of ["/", "/docs/sdk/start-here?source=google&lang=en"]) {
    const response = await request.get(path, {
      headers: { host: "www.kortyx.io" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location).href).toBe(
      `https://kortyx.io${path}`,
    );
  }
  for (const host of [
    "kortyx.io",
    "localhost",
    "preview.kortyx.dev",
    "wwwxkortyx.io",
  ]) {
    const response = await request.get("/", {
      headers: { host },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
  }
});

test("search loads on opening, preserves the query while loading, and reuses the index", async ({
  page,
}) => {
  let loads = 0;
  let releaseLoad = () => {};
  const loadGate = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  await page.route("**/api/docs-search", async (route) => {
    loads += 1;
    await loadGate;
    await route.continue();
  });
  await page.goto("/docs/studio/overview");
  const trigger = page.getByRole("button", { name: "Search documentation" });
  await expect(trigger).toBeVisible();
  expect(loads).toBe(0);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search docs", exact: true });
  const input = dialog.getByRole("searchbox", { name: "Search docs" });
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveText(
    "Loading documentation search…",
  );
  await input.fill("run locally");
  await expect(dialog).not.toContainText("No docs found");
  releaseLoad();
  await expect(dialog.getByRole("link").first()).toBeVisible();
  await expect(dialog).toContainText("Kortyx Studio · Latest");
  await expect(
    dialog.locator('a[href^="/docs/studio/run-locally"]'),
  ).not.toHaveCount(0);
  await expect(dialog.locator('a[href^="/docs/sdk/"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link").first()).toBeVisible();
  expect(loads).toBe(1);
  await dialog.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/docs\/studio\/run-locally/);
  await trigger.click();
  await expect(dialog).toBeVisible();
  await input.fill("server");
  await expect(dialog.getByRole("link").first()).toBeVisible();
  expect(loads).toBe(1);
});

test("search can retry after a failed index load", async ({ page }) => {
  let loads = 0;
  await page.route("**/api/docs-search", async (route) => {
    loads += 1;
    if (loads === 1) {
      await route.fulfill({ status: 503, body: "Unavailable" });
    } else {
      await route.continue();
    }
  });
  await page.goto("/docs");
  await page.getByRole("button", { name: "Search documentation" }).click();
  const dialog = page.getByRole("dialog", { name: "Search docs", exact: true });
  await expect(dialog.getByRole("alert")).toContainText(
    "Documentation search couldn’t load.",
  );
  await dialog.getByRole("searchbox").fill("run locally");
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByRole("link").first()).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(loads).toBe(2);
});

test("audit pages expose complete social metadata and valid source/image schema shapes", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/product",
    "/open-source",
    "/examples",
    "/docs",
    "/about",
    "/contact",
    "/security",
    "/docs/sdk/getting-started/quickstart-nextjs",
    "/docs/studio/run-locally",
    "/docs/studio/deployment",
  ]) {
    await page.goto(path);
    for (const property of [
      "og:title",
      "og:description",
      "og:type",
      "og:url",
      "og:image",
    ]) {
      await expect(
        page.locator(`meta[property="${property}"]`),
        `${path}: ${property}`,
      ).toHaveAttribute("content", /\S/);
    }
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description?.length, path).toBeGreaterThanOrEqual(100);
    expect(description?.length, path).toBeLessThanOrEqual(160);
    const graphs = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    for (const graph of graphs) {
      for (const node of JSON.parse(graph)["@graph"] ?? []) {
        if (node["@type"] === "SoftwareApplication") {
          expect(node).not.toHaveProperty("codeRepository");
          expect(node).not.toHaveProperty("programmingLanguage");
          expect(node.subjectOf["@id"]).toBe(
            "https://github.com/kortyx-io/kortyx#source-code",
          );
        }
        if (node["@type"] === "SoftwareSourceCode") {
          expect(node.codeRepository).toBe(
            "https://github.com/kortyx-io/kortyx",
          );
        }
        if (node.primaryImageOfPage) {
          expect(node.primaryImageOfPage["@type"]).toBe("ImageObject");
          expect(new URL(node.primaryImageOfPage.url).hostname).toBe(
            "kortyx.io",
          );
        }
      }
    }
    if (path.startsWith("/docs/")) {
      for (const link of await page
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByRole("link")
        .all()) {
        const href = await link.getAttribute("href");
        if (!href) throw new Error("Breadcrumb is missing its destination");
        const target = await page.request.get(href, { maxRedirects: 0 });
        expect(target.status(), `${path}: ${href}`).toBe(200);
      }
    }
  }
  await page.goto("/about");
  await expect(page).toHaveTitle("About the Kortyx Agent Framework | Kortyx");
  await page.goto("/docs/sdk/reference/package-overview");
  await expect(
    page.locator('main a[href="/docs/sdk/reference/react-client"]'),
  ).not.toHaveCount(0);
  await expect(
    page.locator('a[href="/docs/sdk/reference/06-react-client"]'),
  ).toHaveCount(0);
});
