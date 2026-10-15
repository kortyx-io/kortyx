import { expect, type Locator, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

async function rowColors(row: Locator) {
  return row.locator("td").evaluateAll(async (cells) => {
    await Promise.all(
      cells.flatMap((cell) =>
        cell.getAnimations().map((animation) => animation.finished),
      ),
    );
    return cells.map((cell) => getComputedStyle(cell).backgroundColor);
  });
}

async function pin(page: Page, label: string, side: "left" | "right") {
  const menu = page.getByRole("button", {
    name: `${label} column menu`,
    exact: true,
  });
  await menu.locator("..").hover();
  await menu.click();
  await page.getByRole("button", { name: `Pin ${side}`, exact: true }).click();
}

async function expectSyncedHover(page: Page, row: Locator, pinned: string) {
  await page.getByRole("searchbox").hover();
  const base = await rowColors(row);
  expect(new Set(base).size).toBe(1);
  const unpinned = row.locator("td:not(.sticky)").first();
  await unpinned.hover();
  await expect.poll(async () => new Set(await rowColors(row)).size).toBe(1);
  await expect.poll(async () => (await rowColors(row))[0]).not.toBe(base[0]);
  const highlighted = await rowColors(row);
  await row.locator(`td[data-column="${pinned}"]`).hover();
  await expect.poll(() => rowColors(row)).toEqual(highlighted);
}

test("root hover synchronizes pinned cells on clickable runs and exposes identity columns", async ({
  page,
}) => {
  await page.goto(`/runs?range=All+time&q=${DRAWER_FIXTURE.runId}`);
  const row = page.locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('[data-column="userId"]')).toBeVisible();
  await expect(row.locator('[data-column="tenantId"]')).toBeVisible();
  await pin(page, "Workflows", "left");
  await expectSyncedHover(page, row, "workflow");
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  for (const label of ["Environment", "Run ID", "Ended", "Pricing status"])
    await expect(
      page.getByRole("menuitemcheckbox", { name: label, exact: true }),
    ).toBeVisible();
});

test("root hover also applies to prompt rows without a row click handler, including right pins", async ({
  page,
  request,
}) => {
  const key = "e2e-table-columns/hover";
  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await db`delete from prompt_assets where key=${key}`;
    const response = await request.post(
      `${process.env.KORTYX_API_URL}/v1/studio/prompts/actions`,
      {
        headers: {
          authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY}`,
        },
        data: {
          action: "create",
          key,
          name: "Shared hover prompt",
          content: {
            format: "system-user",
            messages: [
              { role: "system", content: "Test" },
              { role: "user", content: "Test" },
            ],
            variablesSchema: { type: "object" },
            configSchema: { type: "object" },
            config: {},
            dependencies: [],
          },
        },
      },
    );
    expect(response.ok(), await response.text()).toBe(true);
    const { id } = await response.json();
    await page.goto(`/prompts?q=${encodeURIComponent(key)}`);
    const row = page.locator(`[data-row-key="${id}"]`);
    await expect(row).toBeVisible();
    await pin(page, "Prompt", "left");
    await pin(page, "Actions", "right");
    await expectSyncedHover(page, row, "name");
    await row.locator('[data-column="actions"]').hover();
    await expect.poll(async () => new Set(await rowColors(row)).size).toBe(1);
  } finally {
    await db`delete from prompt_assets where key=${key}`;
    await db.end();
  }
});
