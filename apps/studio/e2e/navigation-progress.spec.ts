import { expect, test } from "@playwright/test";
import { evalSuiteHref } from "../src/features/evals/lib/navigation";
import { EVAL_FIXTURE } from "./support/eval-fixture";

const runPath = `/experiments/runs/${EVAL_FIXTURE.candidate}`;

test("standard Next links show progress while a suite workspace response is delayed", async ({
  page,
}) => {
  const suitePath = evalSuiteHref(EVAL_FIXTURE.targetId, EVAL_FIXTURE.suiteId);
  await page.goto("/datasets?live=false");
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
      .locator("[data-eval-suite-id]")
      .getByRole("button", { name: "Ambiguous role", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".bprogress")).toHaveCount(0);
});

for (const clickTarget of ["row", "button"] as const) {
  test(`shows progress while an eval ${clickTarget} navigation waits for the server`, async ({
    page,
  }) => {
    if (clickTarget === "row") {
      await page.goto(`${runPath}?live=false&q=${EVAL_FIXTURE.candidate}`);
      await page
        .getByRole("button", { name: "Run history", exact: true })
        .click();
    } else {
      await page.goto(`/experiments?live=false&q=${EVAL_FIXTURE.candidate}`);
    }
    await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
    const row = page
      .locator('[data-table-ready="true"]')
      .locator(`[data-row-key="${EVAL_FIXTURE.candidate}"]`);
    await expect(row).toBeVisible();
    await expect(page.locator(".bprogress")).toHaveCount(0);
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
        ? row.locator('td[data-column="results"]')
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
      // Production can commit a loading boundary or the cached detail from
      // the earlier visit while the navigation request is still in flight.
      const loading = page.getByRole("region", { name: "Loading dataset run" });
      const result = page.getByRole("link", {
        name: "Ambiguous role",
        exact: true,
      });
      await expect
        .poll(
          async () =>
            Date.now() - started >= 700 &&
            ((await progress.isVisible()) ||
              (await loading.isVisible()) ||
              (await result.isVisible())),
        )
        .toBe(true);
    } finally {
      release();
    }
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === runPath &&
        url.searchParams.get("live") === "false" &&
        url.searchParams.get("q") === EVAL_FIXTURE.candidate,
    );
    await expect(
      page.getByRole("link", { name: "Ambiguous role", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".bprogress")).toHaveCount(0);
    expect(requests).toBe(1);
  });
}

test("a newer navigation wins while an eval row navigation is still pending", async ({
  page,
}) => {
  await page.goto(`/experiments?live=false&q=${EVAL_FIXTURE.candidate}`);
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
      .locator('[data-table-ready="true"]')
      .locator(`[data-row-key="${EVAL_FIXTURE.candidate}"]`)
      .locator('td[data-column="results"]')
      .click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator(".bprogress .bar")).toBeVisible();
    await page
      .locator('[data-sidebar="sidebar"]')
      .getByRole("link", { name: "Datasets", exact: true })
      .click();
    await expect(page).toHaveURL(/\/datasets$/);
  } finally {
    release();
  }
  await expect(
    page.getByRole("link", { name: "E2E job conversations", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".bprogress")).toHaveCount(0);
  await expect(page).toHaveURL(/\/datasets$/);
});

test("returning to the current list cancels pending detail navigation and clears progress", async ({
  page,
}) => {
  await page.goto(`/experiments?q=${EVAL_FIXTURE.candidate}`);
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
      .locator('[data-table-ready="true"]')
      .locator(`[data-row-key="${EVAL_FIXTURE.candidate}"]`)
      .locator('td[data-column="results"]')
      .click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator(".bprogress .bar")).toBeVisible();
    await page
      .locator('[data-sidebar="sidebar"]')
      .getByRole("link", { name: "Experiments", exact: true })
      .click();
    await expect(page.locator(".bprogress")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/experiments$/);
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  await expect(page.locator("[data-row-key]").first()).toBeVisible();
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
  await expect(page).toHaveURL(/\/experiments\?live=false$/);
});
