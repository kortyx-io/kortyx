import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { EVAL_FIXTURE } from "./support/eval-plan";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

for (const [path, id] of [
  ["/runs?range=All+time", "runs"],
  ["/sessions?range=All+time", "sessions"],
  ["/interrupts?range=All+time", "interrupts"],
  ["/evals/runs", "evaluations"],
  ["/evals/suites", "eval-suites"],
  [`/evals/runs/${EVAL_FIXTURE.candidate}`, "eval-cases"],
  [
    `/evals/runs/${EVAL_FIXTURE.candidate}/compare?baseline=${EVAL_FIXTURE.baseline}`,
    "eval-comparison",
  ],
  ["/prompts", "prompts"],
  ["/prompts/groups", "prompt-groups"],
] as const) {
  test(`always supplies exactly three shared controls on ${id}`, async ({
    page,
  }) => {
    await page.goto(path);
    const controls = page.locator(`[data-table-controls="${id}"]`);
    await expect(controls).toBeVisible();
    await expect(controls.getByRole("button")).toHaveCount(3);
    for (const name of ["Filters", "Columns", "Views"])
      await expect(
        controls.getByRole("button", { name, exact: true }),
      ).toBeVisible();
  });
}
for (const resource of ["runs", "sessions", "interrupts"]) {
  test(`opens, applies and restores a custom range on ${resource}`, async ({
    page,
  }) => {
    await page.goto(`/${resource}?range=All+time`);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Time range", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Custom range", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Apply range", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Apply range", exact: true })
      .click();
    await expect(page).toHaveURL(
      /range=Custom\+range.*startedAfter=.*startedBefore=/,
    );
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(
      page.getByRole("combobox", { name: "Time range", exact: true }),
    ).toHaveText("Custom range");
  });
}
test("combines filters, restores a saved view, and keeps search outside Match any", async ({
  page,
}) => {
  await page.goto(`/runs?range=All+time&q=${DRAWER_FIXTURE.runId}`);
  const row = page.locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`);
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Add filter", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Filter 1 field", exact: true })
    .click();
  await page.getByRole("option", { name: "Workflow", exact: true }).click();
  await page
    .getByLabel("Workflow value", { exact: true })
    .fill("no-such-workflow");
  await page.getByRole("button", { name: "Add filter", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Filter 2 field", exact: true })
    .click();
  await page.getByRole("option", { name: "Status", exact: true }).click();
  await page.getByLabel("Status value", { exact: true }).fill("completed");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("button", { name: "Match any · OR", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(row).toBeVisible();
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await page.getByRole("button", { name: "Views", exact: true }).click();
  await page
    .getByRole("textbox", { name: "View name", exact: true })
    .fill("Any condition");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Views", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Standard view", exact: true })
    .click();
  await page.getByRole("button", { name: "Views", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Any condition", exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("tableFilters"))
    .toContain('"match":"any"');
  await expect(row).toBeVisible();
});

test("prompt-linked tables always expose controls and filter empty datasets", async ({
  page,
  request,
}) => {
  const key = "e2e-table-filters/linked";
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
          name: "Table filters linked prompt",
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
    for (const [tab, tableId] of [
      ["runs", "prompt-runs"],
      ["evals", "prompt-evals"],
    ]) {
      await page.goto(
        `/prompts/${id}?tab=${tab}&q=parent-search&prompt${tab}Search=linked-search&prompt${tab}Page=20`,
      );
      const controls = page.locator(`[data-table-controls="${tableId}"]`);
      await expect(controls).toBeVisible();
      await expect(controls.getByRole("button")).toHaveCount(3);
      await controls
        .getByRole("button", { name: "Views", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "View name", exact: true })
        .fill("Linked view");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page
        .getByRole("textbox", { name: `Search prompt ${tab}`, exact: true })
        .fill("changed-search");
      await expect
        .poll(() => new URL(page.url()).searchParams.get(`prompt${tab}Search`))
        .toBe("changed-search");
      await controls
        .getByRole("button", { name: "Views", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Linked view", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", {
          name: `Search prompt ${tab}`,
          exact: true,
        }),
      ).toHaveValue("linked-search");
      await controls
        .getByRole("button", { name: "Filters", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Clear filters", exact: true })
        .last()
        .click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get(`prompt${tab}Page`))
        .toBeNull();
      await expect(
        page.getByRole("button", { name: "Add filter", exact: true }),
      ).toBeEnabled();
    }
  } finally {
    await db`delete from prompt_assets where key=${key}`;
    await db.end();
  }
});

test("suggests workflows outside the search results and keeps typed values usable", async ({
  page,
}) => {
  await page.goto(`/runs?range=All+time&q=no-such-run`);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Add filter", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Filter 1 field", exact: true })
    .click();
  await page.getByRole("option", { name: "Workflow", exact: true }).click();
  await page.getByLabel("Workflow value", { exact: true }).fill("e2e");
  await expect(page.locator("datalist option").first()).toBeAttached();
  await expect(page.locator("datalist option").first()).toHaveAttribute(
    "value",
    /e2e/,
  );
  await page.screenshot({ path: "/tmp/kortyx-table-filters-final.png" });
});
