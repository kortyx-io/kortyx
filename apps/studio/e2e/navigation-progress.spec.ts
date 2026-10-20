import { expect, test } from "@playwright/test";
import { EVAL_FIXTURE } from "./support/eval-fixture";

const runPath = `/evals/runs/${EVAL_FIXTURE.candidate}`;

test("standard Next links show progress while a suite drawer response is delayed", async ({
  page,
}) => {
  const suitePath = `/evals/suites/${EVAL_FIXTURE.targetId}/${encodeURIComponent(EVAL_FIXTURE.suiteId)}`;
  await page.goto("/evals/suites?live=false");
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  let release = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(
    (url) => url.pathname === suitePath && url.searchParams.has("_rsc"),
    async (route) => {
      requested = true;
      await blocked;
      await route.continue();
    },
  );
  try {
    await page
      .getByRole("link", { name: "E2E job conversations", exact: true })
      .click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator(".bprogress .bar")).toBeVisible();
  } finally {
    release();
  }
  await expect(
    page
      .locator(`[data-detail-drawer="${suitePath}"]`)
      .getByRole("heading", { name: "Conversation plan" }),
  ).toBeVisible();
  await expect(page.locator(".bprogress")).toHaveCount(0);
});

for (const clickTarget of ["row", "button"] as const) {
  test(`shows progress while an eval ${clickTarget} navigation waits for the server`, async ({
    page,
  }) => {
    if (clickTarget === "row") {
      await page.goto(`${runPath}?live=false`);
      await page
        .getByRole("button", { name: "Run history", exact: true })
        .click();
    } else {
      await page.goto("/evals/runs?live=false");
    }
    await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
    const row = page.locator(`[data-row-key="${EVAL_FIXTURE.candidate}"]`);
    await expect(row).toBeVisible();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    await page.route(
      (url) => url.pathname === runPath && url.searchParams.has("_rsc"),
      async (route) => {
        requests += 1;
        await blocked;
        await route.continue();
      },
    );
    try {
      await (clickTarget === "row"
        ? row.locator("td").nth(1)
        : row.getByRole("button", {
            name: "E2E job conversations",
            exact: true,
          })
      ).click();
      await expect.poll(() => requests).toBe(1);
      const progress = page.locator(".bprogress .bar");
      await expect(progress).toBeVisible();
      await expect
        .poll(() =>
          progress.evaluate((bar) => bar.getBoundingClientRect().width),
        )
        .toBeGreaterThan(0);
      const started = Date.now();
      // Keep the response blocked beyond the previous route's completion delay.
      await expect
        .poll(
          async () =>
            Date.now() - started >= 700 && (await progress.isVisible()),
        )
        .toBe(true);
    } finally {
      release();
    }
    await expect(page).toHaveURL(`${runPath}?live=false`);
    await expect(
      page.getByRole("button", { name: "Ambiguous role", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".bprogress")).toHaveCount(0);
    expect(requests).toBe(1);
  });
}

test("a newer navigation wins while an eval row navigation is still pending", async ({
  page,
}) => {
  await page.goto("/evals/runs?live=false");
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(
    (url) => url.pathname === runPath && url.searchParams.has("_rsc"),
    async (route) => {
      requested = true;
      await blocked;
      await route.continue();
    },
  );
  try {
    await page
      .locator(`[data-row-key="${EVAL_FIXTURE.candidate}"]`)
      .locator("td")
      .nth(1)
      .click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator(".bprogress .bar")).toBeVisible();
    await page
      .getByRole("navigation", { name: "Eval navigation" })
      .getByRole("link", { name: "Suites", exact: true })
      .click();
    await expect(page).toHaveURL(/\/evals\/suites$/);
  } finally {
    release();
  }
  await expect(
    page.getByRole("link", { name: "E2E job conversations", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".bprogress")).toHaveCount(0);
  await expect(page).toHaveURL(/\/evals\/suites$/);
});

test("returning to the current list cancels pending detail navigation and clears progress", async ({
  page,
}) => {
  await page.goto("/evals/runs");
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  let release = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(
    (url) => url.pathname === runPath && url.searchParams.has("_rsc"),
    async (route) => {
      requested = true;
      await blocked;
      await route.continue();
    },
  );
  try {
    await page
      .locator(`[data-row-key="${EVAL_FIXTURE.candidate}"]`)
      .locator("td")
      .nth(1)
      .click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator(".bprogress .bar")).toBeVisible();
    await page
      .getByRole("navigation", { name: "Eval navigation" })
      .getByRole("link", { name: "Runs", exact: true })
      .click();
    await expect(page.locator(".bprogress")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/evals\/runs$/);
  await expect(
    page.locator(`[data-row-key="${EVAL_FIXTURE.candidate}"]`),
  ).toBeVisible();
});

test("an unavailable eval refresh shows its failure without trapping navigation", async ({
  page,
}) => {
  await page.goto(`${runPath}?live=false`);
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  await page.route(
    `**/api/studio/evals/runs/${EVAL_FIXTURE.candidate}/live*`,
    (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Eval service is temporarily unavailable." },
      }),
  );
  // SSR already supplied saved evidence. Reconnecting Live requests compact
  // state; healthy navigation must not depend on a redundant full-result read.
  await page.getByRole("button", { name: /Live refresh:/ }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Eval service is temporarily unavailable." }),
  ).toBeVisible();
  await expect(page.locator(".bprogress")).toHaveCount(0);
  await page.getByRole("button", { name: /Live refresh:/ }).click();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await expect(page).toHaveURL(/\/evals\/runs\?live=false$/);
});
