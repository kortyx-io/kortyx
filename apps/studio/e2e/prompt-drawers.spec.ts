import { randomUUID } from "node:crypto";
import { promptHash } from "@kortyx/prompts";
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import postgres from "postgres";

const fixtureKey = "e2e-prompt-drawers/classify";
const fixtureName = "E2E prompt drawer";
const categoryName = "E2E prompt drawers";
const groupName = "E2E prompt drawer group";
const content = {
  format: "system-user" as const,
  messages: [
    {
      role: "system" as const,
      content: "Classify requests as support or sales.",
    },
    { role: "user" as const, content: "{{message}}" },
  ],
  variablesSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  configSchema: { type: "object" },
  config: {},
  dependencies: [],
};
let id: string;
let categoryId: string;
let groupId: string;
const promptDrawer = (page: Page) =>
  page.locator(`[data-detail-drawer="/prompts/${id}"]`);
const inspector = (page: Page) => page.locator("[data-detail-inspector]");
const apiUrl = process.env.KORTYX_API_URL ?? "http://localhost:6400";

async function action(request: APIRequestContext, data: unknown) {
  const response = await request.post(`${apiUrl}/v1/studio/prompts/actions`, {
    headers: {
      authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY ?? "ktyx_test_localstudio_oss-demo-studio-secret-change-me"}`,
    },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function cleanup() {
  const sql = postgres(
    process.env.DATABASE_URL ??
      "postgres://kortyx:kortyx@127.0.0.1:6543/kortyx",
    { max: 1 },
  );
  try {
    await sql`delete from prompt_groups where name=${groupName}`;
    await sql`delete from prompt_assets where key=${fixtureKey}`;
    await sql`delete from prompt_categories where name=${categoryName}`;
  } finally {
    await sql.end();
  }
}
async function openPrompt(page: Page, category = false) {
  await page.goto(category ? `/prompts/categories/${categoryId}` : "/prompts");
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  await page.getByRole("link", { name: fixtureName, exact: true }).click();
  await expect(promptDrawer(page)).toHaveAttribute(
    "data-entry-motion",
    "preserve",
  );
  await expect(promptDrawer(page).getByLabel("System Message")).toHaveValue(
    "Classify requests as support or sales. Pricing requests are sales.",
  );
}
async function renameInspector(page: Page) {
  await promptDrawer(page)
    .getByRole("button", { name: "Prompt actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Rename prompt", exact: true })
    .click();
  await expect(inspector(page)).toHaveAttribute("data-state", "open");
  await expect(inspector(page).getByLabel("Prompt name")).toBeVisible();
}
async function noOverflow(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeLessThanOrEqual(1);
}

test.describe("Prompt detail drawers", () => {
  test.beforeAll(async ({ request }) => {
    await cleanup();
    categoryId = (
      await action(request, { action: "category-create", path: categoryName })
    ).id;
    id = (
      await action(request, {
        action: "create",
        key: fixtureKey,
        name: fixtureName,
        categoryId,
        content,
        note: "Initial request classification",
      })
    ).id;
    const candidate = {
      ...content,
      messages: [
        {
          role: "system" as const,
          content:
            "Classify requests as support or sales. Pricing requests are sales.",
        },
        content.messages[1],
      ],
    };
    await action(request, {
      action: "save",
      id,
      content: candidate,
      baseVersion: 1,
      expectedHash: await promptHash(candidate),
      note: "Clarify pricing classification",
      idempotencyKey: randomUUID(),
    });
    groupId = (
      await action(request, { action: "group-create", name: groupName })
    ).id;
    await action(request, {
      action: "group-update",
      id: groupId,
      expectedRevision: 1,
      members: [{ promptId: id, version: 2 }],
    });
  });
  test.afterAll(cleanup);

  test("uses a compact history menu in a narrow drawer on a wide screen", async ({
    page,
  }) => {
    await openPrompt(page);
    const surface = promptDrawer(page);
    await expect(surface.locator("aside")).toBeHidden();
    await surface.getByRole("button", { name: "Version history · v2" }).click();
    await expect(
      page.getByRole("menuitemradio", { name: /v2/ }),
    ).toHaveAttribute("aria-checked", "true");
    await page.getByRole("menuitemradio", { name: /v1/ }).click();
    await expect(surface.getByLabel("System Message")).toHaveValue(
      content.messages[0].content,
    );
    await expect
      .poll(async () => {
        const field = await surface.getByLabel("System Message").boundingBox();
        const drawer = await surface.boundingBox();
        return (drawer?.width ?? 0) - (field?.width ?? 0);
      })
      .toBeLessThanOrEqual(48);
    await noOverflow(surface);
    await page.goBack();
    await expect(
      surface.getByRole("button", { name: "Version history · v2" }),
    ).toBeVisible();
    await page.goForward();
    await expect(
      surface.getByRole("button", { name: "Version history · v1" }),
    ).toBeVisible();
  });

  test("changes history layout with the prompt container and keeps the table shell flat", async ({
    page,
  }) => {
    await page.goto("/prompts");
    await expect(page.locator('[data-table-ready="true"]')).toHaveCSS(
      "border-top-width",
      "0px",
    );
    await expect(page.locator('[data-table-ready="true"]')).toHaveCSS(
      "border-radius",
      "0px",
    );
    await page.goto(`/prompts/${id}`);
    await expect(
      page.locator("aside").filter({ hasText: "Version history" }),
    ).toBeVisible();
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole("button", { name: "Version history · v2" }),
      ).toBeVisible();
      await expect(
        page.locator("aside").filter({ hasText: "Version history" }),
      ).toBeHidden();
      await noOverflow(page.locator("main").last());
      await noOverflow(page.locator("body"));
    }
  });

  test("reserves editor space for an inspector and repeatedly closes it without losing the drawer", async ({
    page,
  }) => {
    await openPrompt(page);
    const surfaceNode = await promptDrawer(page).elementHandle();
    for (let iteration = 0; iteration < 3; iteration++) {
      await renameInspector(page);
      await expect(inspector(page)).toHaveCount(1);
      await expect
        .poll(async () => {
          const field = await promptDrawer(page)
            .getByLabel("System Message")
            .boundingBox();
          const nested = await inspector(page).boundingBox();
          return (field?.x ?? 0) + (field?.width ?? 0) - (nested?.x ?? 0);
        })
        .toBeLessThanOrEqual(0);
      await expect(
        promptDrawer(page).getByRole("button", {
          name: "Version history · v2",
        }),
      ).toBeVisible();
      if (iteration === 1) await page.keyboard.press("Escape");
      else
        await inspector(page)
          .getByRole("button", { name: "Close prompt action" })
          .click();
      await expect(inspector(page)).toHaveCount(0);
      await expect(promptDrawer(page)).toHaveAttribute("data-state", "open");
      expect(await surfaceNode?.evaluate((node) => node.isConnected)).toBe(
        true,
      );
    }
  });

  test("Back and Forward restore the action inspector and changing tabs closes it", async ({
    page,
  }) => {
    await openPrompt(page);
    await renameInspector(page);
    await expect(page).toHaveURL(/promptAction=rename/);
    await page.goBack();
    await expect(inspector(page)).toHaveCount(0);
    await expect(promptDrawer(page)).toHaveAttribute("data-state", "open");
    await page.goForward();
    await expect(inspector(page)).toHaveAttribute("data-state", "open");
    await promptDrawer(page)
      .getByRole("button", { name: /^evals 0$/i })
      .click();
    await expect(inspector(page)).toHaveCount(0);
    await expect(promptDrawer(page)).toContainText("Evaluations for v2");
  });

  test("closes to the category list through query history and reopens with Forward", async ({
    page,
  }) => {
    await openPrompt(page, true);
    await promptDrawer(page)
      .getByRole("button", { name: "Version history · v2" })
      .click();
    await page.getByRole("menuitemradio", { name: /v1/ }).click();
    await renameInspector(page);
    await inspector(page)
      .getByRole("button", { name: "Close prompt action" })
      .click();
    await expect(inspector(page)).toHaveCount(0);
    await promptDrawer(page)
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/prompts/categories/${categoryId}$`),
    );
    await expect(promptDrawer(page)).toHaveCount(0);
    await page.goForward();
    await expect(promptDrawer(page)).toHaveAttribute("data-state", "open");
    await expect(
      promptDrawer(page).getByRole("button", { name: "Version history · v2" }),
    ).toBeVisible();
    await page.goForward();
    await expect(promptDrawer(page).getByLabel("System Message")).toHaveValue(
      content.messages[0].content,
    );
  });

  test("keeps group ancestors when opening a prompt and peels one drawer at a time", async ({
    page,
  }) => {
    await page.goto("/prompts");
    await page.getByRole("link", { name: /^Test groups/ }).click();
    const groups = page.locator('[data-detail-drawer="/prompts/groups"]');
    await expect(groups).toHaveAttribute("data-state", "open");
    await groups.getByRole("link", { name: groupName, exact: true }).click();
    const group = page.locator(
      `[data-detail-drawer="/prompts/groups/${groupId}"]`,
    );
    await expect(group).toHaveAttribute("data-state", "open");
    await group.getByRole("link", { name: fixtureName, exact: true }).click();
    await expect(promptDrawer(page)).toHaveAttribute("data-state", "open");
    await expect(group).toHaveAttribute("data-state", "open");
    await expect(groups).toHaveAttribute("data-state", "open");
    await page.keyboard.press("Escape");
    await expect(promptDrawer(page)).toHaveCount(0);
    await expect(group).toHaveAttribute("data-state", "open");
    await group
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(group).toHaveCount(0);
    await expect(groups).toHaveAttribute("data-state", "open");
    await groups
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(page).toHaveURL(/\/prompts$/);
    await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
  });

  test("keeps the group list usable beside its inspector and restores the editor with history", async ({
    page,
  }) => {
    await page.goto("/prompts");
    await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
    await page.getByRole("link", { name: /^Test groups/ }).click();
    const groups = page.locator('[data-detail-drawer="/prompts/groups"]');
    await expect(groups).toHaveAttribute("data-state", "open");
    await groups
      .getByRole("button", { name: "New group", exact: true })
      .click();
    await expect(inspector(page)).toHaveAttribute("data-state", "open");
    await expect(page).toHaveURL(/groupAction=create/);
    await expect
      .poll(async () => {
        const row = await groups
          .getByRole("link", { name: groupName, exact: true })
          .locator("..")
          .boundingBox();
        const nested = await inspector(page).boundingBox();
        return (row?.x ?? 0) + (row?.width ?? 0) - (nested?.x ?? 0);
      })
      .toBeLessThanOrEqual(0);
    await page.goBack();
    await expect(inspector(page)).toHaveCount(0);
    await expect(groups).toHaveAttribute("data-state", "open");
    await page.goForward();
    await expect(inspector(page)).toHaveAttribute("data-state", "open");
    await inspector(page)
      .getByRole("button", { name: "Close group editor", exact: true })
      .click();
    await expect(inspector(page)).toHaveCount(0);
    await expect(groups).toHaveAttribute("data-state", "open");
  });

  test("Escape closes the history menu and menu typeahead does not expand its drawer", async ({
    page,
  }) => {
    await openPrompt(page);
    const history = promptDrawer(page).getByRole("button", {
      name: "Version history · v2",
    });
    await history.click();
    await page.keyboard.press("e");
    await expect(page).not.toHaveURL(/detailView=expanded/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(
      promptDrawer(page).getByRole("button", {
        name: "Expand detail",
        exact: true,
      }),
    ).toBeVisible();

    await expect(promptDrawer(page)).toHaveAttribute("data-state", "open");
  });

  test("Escape dismisses version comparison without closing its prompt drawer", async ({
    page,
  }) => {
    await openPrompt(page);
    await promptDrawer(page)
      .getByRole("button", { name: "Version history · v2" })
      .click();
    await page.getByRole("menuitem", { name: "v2 actions" }).hover();
    await page
      .getByRole("menuitem", { name: "Compare versions", exact: true })
      .click();
    const comparison = page.getByRole("dialog", { name: "Compare versions" });
    await expect(comparison).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(comparison).toHaveCount(0);
    await expect(promptDrawer(page)).toHaveAttribute("data-state", "open");
  });
});
