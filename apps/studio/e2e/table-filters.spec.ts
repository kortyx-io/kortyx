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
    await expect(controls.getByRole("searchbox")).toHaveCount(1);
    await expect(page.getByRole("searchbox")).toHaveCount(1);
    await expect(page.locator("[data-table-footer]")).toHaveCount(1);
    await expect(
      page
        .locator("[data-table-footer]")
        .getByRole("combobox", { name: "Rows per page" }),
    ).toBeVisible();
    if (id === "runs") {
      await controls
        .getByRole("button", { name: "Filters", exact: true })
        .click();
      const drawer = page.getByRole("complementary", {
        name: "Filters",
        exact: true,
      });
      await expect(
        drawer.getByRole("textbox", { name: "Find a filter", exact: true }),
      ).toBeVisible();
      await expect(
        drawer.getByRole("combobox", { name: "Time range", exact: true }),
      ).toBeVisible();
      await expect(
        drawer.getByRole("checkbox", {
          name: "Include child workflows",
          exact: true,
        }),
      ).toBeVisible();
      const statuses = drawer.locator('[data-filter-field="status"]');
      await statuses
        .getByRole("button", { name: "Select all", exact: true })
        .click();
      await expect(
        statuses.getByRole("checkbox", {
          name: "Status: running",
          exact: true,
        }),
      ).toBeChecked();
      await expect(
        statuses.getByRole("checkbox", {
          name: "Status: cancelled",
          exact: true,
        }),
      ).toBeChecked();
      await statuses
        .getByRole("button", { name: "Deselect all", exact: true })
        .click();
      await expect(
        statuses.getByRole("checkbox", {
          name: "Status: running",
          exact: true,
        }),
      ).not.toBeChecked();
      await page.screenshot({
        path: "/tmp/kortyx-table-filters-preserved.png",
      });
      await drawer
        .getByRole("button", { name: "Close filters", exact: true })
        .click();
    }
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
  await expect(
    page.getByRole("button", { name: "Add filter", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Apply filters", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Workflow value", { exact: true })
    .fill("no-such-workflow");
  // Finish the combobox interaction before targeting controls outside its
  // suggestion list, which temporarily owns screen-reader navigation.
  await page.getByLabel("Workflow value", { exact: true }).press("Escape");
  await expect(
    page.getByRole("listbox", { name: "Workflow suggestions", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Status: completed", exact: true })
    .check();
  await expect(row).toHaveCount(0);
  await page
    .getByRole("button", { name: "Match any · OR", exact: true })
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
      await expect(controls.getByRole("searchbox")).toHaveCount(1);
      await expect(page.getByRole("searchbox")).toHaveCount(1);
      await expect(page.locator("[data-table-footer]")).toHaveCount(1);
      await expect(
        page
          .locator("[data-table-footer]")
          .getByRole("combobox", { name: "Rows per page" }),
      ).toBeVisible();
      await controls
        .getByRole("button", { name: "Views", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "View name", exact: true })
        .fill("Linked view");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page
        .getByRole("searchbox", { name: `Search prompt ${tab}`, exact: true })
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
        page.getByRole("searchbox", {
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
        page.getByRole("textbox", { name: "Find a filter", exact: true }),
      ).toBeVisible();
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
  const input = page.getByRole("combobox", {
    name: "Workflow value",
    exact: true,
  });
  await input.fill("e2e");
  const list = page.getByRole("listbox", {
    name: "Workflow suggestions",
    exact: true,
  });
  // The typed value appears immediately; wait for the remote fixture suggestion
  // before reading the option that keyboard selection will use.
  await expect(
    list.getByRole("option", { name: DRAWER_FIXTURE.workflowId, exact: true }),
  ).toBeVisible();
  const option = await list.getByRole("option").first().innerText();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue(option);
  await expect(list).toHaveCount(0);
  await input.fill("my-free-text-workflow");
  await expect(input).toHaveValue("my-free-text-workflow");
  await input.press("Escape");
  await expect(list).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search runs", exact: true })
    .click();
  await expect(input).toHaveValue("my-free-text-workflow");
  await expect(
    page.getByRole("complementary", { name: "Filters", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/kortyx-table-filters-final.png" });
});

test("response autocomplete uses the shared dropdown and accepts a selected value", async ({
  page,
}) => {
  await page.goto("/interrupts?range=All+time");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const input = page.getByRole("combobox", {
    name: "Response value",
    exact: true,
  });
  await input.click();
  const list = page.getByRole("listbox", {
    name: "Response suggestions",
    exact: true,
  });
  const option = list.getByRole("option", { name: "approve", exact: true });
  await expect(option).toBeVisible();
  await page.screenshot({ path: "/tmp/kortyx-filter-autocomplete.png" });
  await option.click();
  await expect(input).toHaveValue("approve");
  await expect(list).toHaveCount(0);
  await expect(
    page.locator(`[data-row-key="${DRAWER_FIXTURE.interruptId}"]`),
  ).toBeVisible();
});

test("embedded table search is independent of parent search, combines with filters and persists", async ({
  page,
}) => {
  await page.goto(`/evals/runs/${EVAL_FIXTURE.candidate}?q=parent-search`);
  const controls = page.locator('[data-table-controls="eval-cases"]');
  const search = controls.getByRole("searchbox");
  await search.fill("human-choice");
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("parent-search");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("tableSearch.eval-cases"))
    .toBe("human-choice");
  await page.reload();
  await expect(search).toHaveValue("human-choice");
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await controls.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByLabel("Conversation value", { exact: true })
    .fill("Ambiguous");
  await page.getByLabel("Conversation value", { exact: true }).press("Escape");
  await expect(
    page.getByRole("listbox", {
      name: "Conversation suggestions",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Match any · OR", exact: true })
    .click();
  await expect(page.locator("[data-row-key]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(search).toHaveValue("human-choice");
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
  await search.fill("no matching conversation");
  await expect(page.locator("[data-row-key]")).toHaveCount(0);
  await expect(page.locator("[data-table-footer]")).toContainText("No results");
  await search.fill("");
  await expect(page.locator("[data-row-key]")).toHaveCount(8);
  await controls.getByRole("button", { name: "Views", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Standard view", exact: true })
    .click();
  await search.fill("human-choice");
  await controls.getByRole("button", { name: "Views", exact: true }).click();
  await page
    .getByRole("textbox", { name: "View name", exact: true })
    .fill("Case search");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await search.fill("");
  await controls.getByRole("button", { name: "Views", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Case search", exact: true })
    .click();
  await expect(search).toHaveValue("human-choice");
  await expect(page.locator("[data-row-key]")).toHaveCount(1);
});

test("prompt toolbar selection has empty, mixed and checked states beside actions, with a standard paged footer", async ({
  page,
  request,
}) => {
  const prefix = "e2e-table-header/";
  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await db`delete from prompt_assets where key like ${`${prefix}%`}`;
    for (let i = 0; i < 11; i++) {
      const created = await request.post(
        `${process.env.KORTYX_API_URL}/v1/studio/prompts/actions`,
        {
          headers: {
            authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY}`,
          },
          data: {
            action: "create",
            key: `${prefix}${i}`,
            name: `Header prompt ${String(i).padStart(2, "0")}`,
            content: {
              format: "system-user",
              messages: [
                { role: "system", content: "Fixture" },
                { role: "user", content: "Fixture" },
              ],
              variablesSchema: { type: "object" },
              configSchema: { type: "object" },
              config: {},
              dependencies: [],
            },
          },
        },
      );
      expect(created.ok(), await created.text()).toBe(true);
    }
    await page.goto(`/prompts?q=${encodeURIComponent(prefix)}&pageSize=10`);
    const controls = page.locator('[data-table-controls="prompts"]');
    const all = controls.getByRole("checkbox", {
      name: "Select visible prompts",
    });
    const footer = page.locator("[data-table-footer]");
    await expect(page.locator("[data-row-key]")).toHaveCount(10);
    await expect(footer).toContainText("Showing 1–10 of 11");
    await expect(all).not.toBeChecked();
    await page
      .getByRole("checkbox", { name: "Select Header prompt 00", exact: true })
      .check();
    await expect(all).toHaveAttribute("aria-checked", "mixed");
    await expect(
      controls.getByRole("button", {
        name: "1 selected · Actions",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Clear selection", exact: true }),
    ).toHaveCount(0);
    await all.click();
    await expect(all).toBeChecked();
    await expect(
      controls.getByRole("button", {
        name: "10 selected · Actions",
        exact: true,
      }),
    ).toBeVisible();
    await all.click();
    await expect(all).not.toBeChecked();
    await expect(
      controls.getByRole("button", { name: /selected · Actions/ }),
    ).toHaveCount(0);
    await footer
      .getByRole("button", { name: "Next page", exact: true })
      .click();
    await expect(page.locator("[data-row-key]")).toHaveCount(1);
    await expect(footer).toContainText("Showing 11–11 of 11");
    await controls.getByRole("searchbox").fill("Header prompt 00");
    await expect(page.locator("[data-row-key]")).toHaveCount(1);
    await expect(footer).toContainText("Showing 1–1 of 1");
    await expect(
      footer.getByRole("button", { name: "Previous page", exact: true }),
    ).toBeDisabled();
  } finally {
    await db`delete from prompt_assets where key like ${`${prefix}%`}`;
    await db.end();
  }
});

test("listed ranges preserve zero, validate bounds, and clear missing-value filters", async ({
  page,
}) => {
  await page.goto(`/runs?range=All+time&q=${DRAWER_FIXTURE.runId}`);
  const row = page.locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`);
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();

  await page.getByLabel("Cost minimum", { exact: true }).fill("1");
  await page.getByLabel("Cost maximum", { exact: true }).fill("0");
  await expect(
    page
      .getByRole("complementary", { name: "Filters", exact: true })
      .getByRole("alert"),
  ).toContainText("minimum must not exceed maximum");
  await page.getByLabel("Cost minimum", { exact: true }).fill("0");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("tableFilters"))
    .toContain('"values":[0,0]');
  await expect(row).toHaveCount(0);
  await page
    .getByRole("complementary", { name: "Filters", exact: true })
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(row).toBeVisible();
  await page
    .getByRole("button", { name: "Run ID filter options", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Has no value", exact: true })
    .click();
  await expect(page.getByLabel("Run ID value", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear Run ID filter", exact: true })
    .click();
  await expect(page.getByLabel("Run ID value", { exact: true })).toBeVisible();
  await expect(row).toBeVisible();
});
