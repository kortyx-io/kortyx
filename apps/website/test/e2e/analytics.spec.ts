import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

test("analytics waits for fresh consent and stops on withdrawal", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  const posthogPayloads: string[] = [];
  // PostHog drops navigator.webdriver traffic. Exercise its real payload path
  // with a local visitor fixture; all vendor destinations remain intercepted.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
  });
  await page.route("**/api/website-analytics", (route) =>
    route.fulfill({
      json: {
        posthogKey: "phc_publictest",
        gaMeasurementId: "G-TEST123",
        cloudflareToken: "a".repeat(32),
        paths: ["/", "/product", "/docs"],
      },
    }),
  );
  await page.route(/^https:\/\//, async (route) => {
    external.push(route.request().url());
    const request = route.request();
    if (new URL(request.url()).hostname === "eu.i.posthog.com") {
      const body = request.postDataBuffer();
      if (body)
        posthogPayloads.push(
          body[0] === 31 && body[1] === 139
            ? gunzipSync(body).toString()
            : body.toString(),
        );
      await route.fulfill({ json: { status: 1 } });
      return;
    }
    await route.fulfill({
      contentType: "application/javascript",
      body:
        new URL(request.url()).hostname === "www.googletagmanager.com"
          ? 'document.cookie="_ga=synthetic; Path=/; SameSite=Lax";'
          : "",
    });
  });
  await page.goto("/?token=private-query#private-fragment");
  const banner = page.getByTestId("consent-banner-root");
  await expect(
    banner.getByRole("button", { name: "Reject analytics", exact: true }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  await banner
    .getByRole("button", { name: "Reject analytics", exact: true })
    .click();
  await page.reload();
  await expect(banner).toHaveCount(0);
  expect(external).toEqual([]);
  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: "Privacy settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Privacy settings",
    exact: true,
  });
  await expect(
    dialog.getByText("Website analytics", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("switch", { name: /Website analytics/ }).check();
  await dialog
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect
    .poll(() =>
      external.some(
        (url) => new URL(url).hostname === "www.googletagmanager.com",
      ),
    )
    .toBe(true);
  await expect.poll(() => posthogPayloads.length).toBe(1);
  expect(posthogPayloads[0]).not.toContain("private-query");
  expect(posthogPayloads[0]).not.toContain("private-fragment");
  const events = JSON.parse(posthogPayloads[0]).batch;
  expect(events).toHaveLength(1);
  const event = events[0];
  expect(event.properties.token).toBe("phc_publictest");
  expect(typeof event.properties.distinct_id).toBe("string");
  expect(event.properties.$current_url).toBe("https://kortyx.io/");
  expect(event).not.toHaveProperty("$set");
  expect(event).not.toHaveProperty("$set_once");
  await expect
    .poll(() =>
      external.some(
        (url) => new URL(url).hostname === "static.cloudflareinsights.com",
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      external.some((url) => new URL(url).hostname === "eu.i.posthog.com"),
    )
    .toBe(true);
  const queue = await page.evaluate(() =>
    (window as unknown as { dataLayer: ArrayLike<unknown>[] }).dataLayer.map(
      (entry) => Array.from(entry),
    ),
  );
  expect(JSON.stringify(queue)).not.toContain("private-query");
  expect(JSON.stringify(queue)).not.toContain("private-fragment");
  expect(
    queue.filter((entry) => entry[0] === "event" && entry[1] === "page_view"),
  ).toHaveLength(1);
  expect(
    (await context.cookies()).some((cookie) => cookie.name === "_ga"),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Product", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/product$/);
  await expect.poll(() => posthogPayloads.length).toBe(2);
  const second = JSON.parse(posthogPayloads[1]).batch[0];
  expect(second.properties.$current_url).toBe("https://kortyx.io/product");
  expect(second.properties.distinct_id).toBe(event.properties.distinct_id);
  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: "Privacy settings", exact: true })
    .click();
  await dialog.getByRole("switch", { name: /Website analytics/ }).uncheck();
  const reloaded = page.waitForEvent("load");
  await dialog
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await reloaded;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const count = external.length;
  await page.getByRole("link", { name: "Kortyx", exact: true }).first().click();
  await expect(page).toHaveURL(/4317\/$/);
  expect(external).toHaveLength(count);
  expect(
    (await context.cookies()).some((cookie) => /^_ga/.test(cookie.name)),
  ).toBe(false);
});
