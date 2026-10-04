import { expect, type Page, test } from "@playwright/test";

async function acknowledgeStorageNotice(page: Page) {
  const banner = page.getByTestId("consent-banner-root");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(banner).toHaveCount(0);
}

const trustRoutes = [
  "about",
  "contact",
  "security",
  "privacy",
  "terms",
  "legal",
  "cookies",
];

test("one navbar frame supports docs slots and client-side navigation", async ({
  page,
}) => {
  const mobile = (page.viewportSize()?.width ?? 0) < 1024;
  if (!mobile) await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/cookies");
  await acknowledgeStorageNotice(page);
  const header = page.locator("header");
  await expect(header).toHaveCount(1);
  const frame = header.locator(":scope > div");
  const getFrame = () =>
    frame.evaluate((element) => {
      const styles = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        background: styles.backgroundColor,
        color: styles.color,
        height: bounds.height,
        width: bounds.width,
      };
    });
  const commonFrame = await getFrame();
  expect(commonFrame.background).toBe("rgb(8, 8, 12)");
  const getContainer = () =>
    frame.locator(":scope > div").evaluate((element) => {
      const styles = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        width: bounds.width,
        left: bounds.left,
        padding: styles.paddingLeft,
      };
    });
  const marketingContainer = await getContainer();
  expect(marketingContainer.width).toBe(
    Math.min(page.viewportSize()?.width ?? 0, 1280),
  );
  await expect(
    header.getByRole("button", { name: "Search documentation" }),
  ).toHaveCount(0);

  const navigate = async (name: string) => {
    if (mobile) await header.locator("summary").click();
    await header
      .getByRole("navigation", {
        name: mobile ? "Mobile navigation" : "Main navigation",
        exact: true,
      })
      .getByRole("link", { name, exact: true })
      .click();
  };

  await navigate("Docs");
  await expect(page).toHaveURL(/\/docs$/);
  await expect(header).toHaveCount(1);
  expect(await getFrame()).toEqual(commonFrame);
  expect(await getContainer()).toEqual(marketingContainer);
  await expect(
    header.getByRole("button", { name: "Search documentation" }),
  ).toHaveCount(1);
  await expect(
    header.locator('a[href="/docs"][aria-current="page"]'),
  ).toHaveCount(2);
  if (mobile)
    await expect(header.locator("details")).not.toHaveAttribute("open");

  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "Search docs", exact: true });
  await expect(search).toHaveCount(1);
  await expect(search).toBeVisible();
  await search.getByRole("searchbox").fill("run locally");
  await expect(search.getByRole("link").first()).toBeVisible();
  await search.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/docs\/[^/]+\//);
  await expect(search).toHaveCount(0);
  const docsContainer = await getContainer();
  expect(docsContainer.width).toBe(
    Math.min(page.viewportSize()?.width ?? 0, 1400),
  );
  expect(docsContainer.padding).toBe(mobile ? "16px" : "24px");
  const announcementBounds = await header
    .locator(":scope > a > span")
    .boundingBox();
  expect(announcementBounds?.width).toBe(docsContainer.width);
  expect(announcementBounds?.x).toBe(docsContainer.left);
  await expect(
    header.locator('a[href="/docs"][aria-current="true"]'),
  ).toHaveCount(2);
  await header.getByRole("button", { name: "Search documentation" }).click();
  await expect(search).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toHaveCount(0);

  await header.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await getFrame()).toEqual(commonFrame);
  await header.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).not.toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await getContainer()).toEqual(docsContainer);

  if (mobile) {
    const summary = header.locator("summary");
    await summary.click();
    await expect(header.locator("details")).toHaveAttribute("open");
    await header
      .getByRole("navigation", { name: "Mobile navigation", exact: true })
      .getByRole("link", { name: "Docs", exact: true })
      .focus();
    await page.keyboard.press("Escape");
    await expect(header.locator("details")).not.toHaveAttribute("open");
    await expect(summary).toBeFocused();
  }

  await navigate("Product");
  await expect(page).toHaveURL(/\/product$/);
  expect(await getFrame()).toEqual(commonFrame);
  expect(await getContainer()).toEqual(marketingContainer);
  await expect(
    header.getByRole("button", { name: "Search documentation" }),
  ).toHaveCount(0);
  await expect(
    header.getByRole("button", { name: /Switch to .* mode/ }),
  ).toHaveCount(0);
  await expect(
    header.locator('a[href="/product"][aria-current="page"]'),
  ).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("external links open safely in a new tab while site navigation stays in place", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await acknowledgeStorageNotice(page);

  for (const route of [
    "",
    "product",
    "examples",
    "open-source",
    ...trustRoutes,
    "docs",
    "docs/studio/run-locally",
  ]) {
    await page.goto(`/${route}`);
    const violations = await page.locator("a[href]").evaluateAll((links) =>
      links.flatMap((element) => {
        const link = element as HTMLAnchorElement;
        const href = link.getAttribute("href") ?? "";
        const url = new URL(href, "https://kortyx.io");
        const external =
          ["http:", "https:"].includes(url.protocol) &&
          url.origin !== "https://kortyx.io";
        const valid = external
          ? link.target === "_blank" &&
            link.relList.contains("noopener") &&
            link.relList.contains("noreferrer")
          : link.target !== "_blank";
        return valid ? [] : [href];
      }),
    );
    expect(violations, `Link policy on /${route}`).toEqual([]);
  }

  await expect(page.locator('a[href="http://localhost:6300"]')).toHaveAttribute(
    "target",
    "_blank",
  );

  // Verify real new-tab behavior without contacting the external service.
  await context.route("https://github.com/kortyx-io/kortyx/releases", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Releases</h1>" }),
  );
  await page.goto("/cookies");
  const originalUrl = page.url();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Releases" })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toBe("https://github.com/kortyx-io/kortyx/releases");
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  expect(page.url()).toBe(originalUrl);
  await popup.close();
});

test("trust pages are navigable and identify drafts accurately", async ({
  page,
}) => {
  for (const route of trustRoutes) {
    const response = await page.goto(`/${route}`);
    if (route === "about") await acknowledgeStorageNotice(page);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /in formation|company incorporation|draft for review|publication review covers/i,
    );
    await expect(page.locator('header a[href="/security"]')).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "Company and trust" })
        .locator('a[aria-current="page"]'),
    ).toHaveCount(1);
    await expect(
      page
        .getByRole("contentinfo")
        .getByRole("button", { name: "Privacy settings" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (["privacy", "terms", "legal", "cookies"].includes(route)) {
      await expect(page.getByRole("note")).toHaveCount(0);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      await expect(page.getByText(/Document version:.*-draft/)).toBeVisible();
    }
  }
  expect((await page.goto("/not-a-real-trust-page"))?.status()).toBe(404);
});

test("privacy dialog works without optional tracking or backend requests", async ({
  page,
  context,
}) => {
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4317/"))
      externalRequests.push(request.url());
  });
  await page.goto("/cookies");
  const banner = page.getByTestId("consent-banner-root");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(
    "only necessary cookies and local storage",
  );
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await expect(banner.getByRole("button", { name: "Got it" })).toBeVisible();
  await banner.getByRole("button", { name: "Privacy settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Privacy settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute(
    "aria-describedby",
    "kortyx-privacy-description",
  );
  await expect(dialog).toContainText("Privacy settings");
  await expect(dialog).toContainText("These preferences stay in your browser");
  await expect(
    dialog.getByRole("button", { name: "Close privacy settings" }),
  ).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await expect(
    dialog.getByText("Necessary storage", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: /^Privacy Policy/ }),
  ).toHaveAttribute("href", "/privacy");
  await expect(dialog.getByRole("link", { name: /^Privacy Policy/ })).toHaveCSS(
    "color",
    "rgb(168, 156, 255)",
  );
  await expect(
    dialog.getByRole("link", { name: "Cookie Policy", exact: true }),
  ).toHaveAttribute("href", "/cookies");
  await expect(
    dialog.getByRole("button", { name: /Accept All|Reject All/ }),
  ).toHaveCount(0);

  await dialog
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const cookies = await context.cookies();
  expect(cookies.map((cookie) => cookie.name)).toEqual(["kortyx_privacy"]);
  expect(cookies[0].sameSite).toBe("Lax");
  expect(cookies[0].expires - Date.now() / 1000).toBeLessThanOrEqual(
    180 * 86400 + 10,
  );
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
    "kortyx_privacy",
  ]);

  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const trigger = page
    .getByRole("contentinfo")
    .getByRole("button", { name: "Privacy settings" });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("dialog", { name: "Privacy settings" })
    .getByRole("button", { name: "Close privacy settings" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(pageErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test("first-visit notice dismisses persistently without optional tracking", async ({
  page,
  context,
}) => {
  await page.goto("/security");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).overflow),
  ).not.toBe("hidden");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Kortyx", exact: true })
    .click();
  await expect(page).toHaveURL(/4317\/$/);
  expect(await context.cookies()).toEqual([]);
  await acknowledgeStorageNotice(page);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await context.cookies()).map((cookie) => cookie.name)).toEqual([
    "kortyx_privacy",
  ]);
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("consent-banner-root")).toBeVisible();
});

test("documentation keeps legal controls and keyboard skip navigation available", async ({
  page,
}) => {
  await page.goto("/docs");
  await acknowledgeStorageNotice(page);
  await expect(
    page.getByRole("button", { name: "Privacy settings", exact: true }),
  ).toBeVisible();
  await page.goto("/docs/getting-started/installation");
  const footer = page.getByRole("navigation", {
    name: "Website legal and trust information",
  });
  await expect(
    footer.getByRole("link", { name: "Privacy", exact: true }),
  ).toHaveAttribute("href", "/privacy");
  await footer.getByRole("button", { name: "Privacy settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/security");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("sitemap includes public trust pages but excludes draft notices", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();
  for (const route of ["about", "contact", "security"])
    expect(xml).toContain(`https://kortyx.io/${route}</loc>`);
  for (const route of ["privacy", "terms", "legal", "cookies"])
    expect(xml).not.toContain(`https://kortyx.io/${route}</loc>`);
});

test("privacy controls remain usable when browser storage is blocked", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
  });
  await page.goto("/docs/getting-started/installation");
  await page
    .getByRole("button", { name: "Privacy settings", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("security reporting and basic browser protections are discoverable", async ({
  request,
}) => {
  const response = await request.get("/security");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  const securityTxt = await request.get("/.well-known/security.txt");
  expect(securityTxt.status()).toBe(200);
  expect(await securityTxt.text()).toContain(
    "Contact: https://github.com/kortyx-io/kortyx/security/advisories/new",
  );
});
