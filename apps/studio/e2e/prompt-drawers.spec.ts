import { randomUUID } from "node:crypto";
import {
  createPrompts,
  definePrompt,
  promptHash,
  studioPromptSource,
} from "@kortyx/prompts";
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import postgres from "postgres";
import { z } from "zod";
import { EVAL_FIXTURE } from "./support/eval-plan";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const fixtureKey = "e2e-prompt-drawers/classify";
const compositionKey = "e2e-prompt-drawers/composition";
const compositionName = "E2E prompt composition";

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
    await sql`delete from prompt_assets where key=${`${compositionKey}-latest`}`;
    await sql`delete from prompt_assets where key=${`${compositionKey}-conflict`}`;
    await sql`delete from prompt_assets where key=${compositionKey}`;
    await sql`delete from prompt_assets where key=${`${compositionKey}-json`}`;
    await sql`delete from prompt_assets where key=${`${compositionKey}-actions`}`;
    await sql`delete from prompt_assets where key=${fixtureKey}`;
    await sql`delete from prompt_categories where name=${`${categoryName} disposable`}`;
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
  await expect(promptDrawer(page).getByLabel("System Message")).toHaveText(
    "Classify requests as support or sales. Pricing requests are sales.",
  );
}
async function policyInspector(page: Page) {
  await promptDrawer(page)
    .getByRole("button", { name: "Prompt actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Promotion policy", exact: true })
    .click();
  await expect(inspector(page)).toHaveAttribute("data-state", "open");
  await expect(
    inspector(page).getByRole("button", { name: "Save policy" }),
  ).toBeVisible();
}
async function noOverflow(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeLessThanOrEqual(1);
}

async function expectFilledTable(table: Locator) {
  await expect
    .poll(() =>
      table.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const area = element.parentElement!.getBoundingClientRect();
        const footer = element
          .querySelector('[aria-label="Next page"]')!
          .closest(".border-t")!
          .getBoundingClientRect();
        return Math.max(
          Math.abs(bounds.width - area.width),
          Math.abs(bounds.height - area.height),
          Math.abs(footer.bottom - bounds.bottom),
        );
      }),
    )
    .toBeLessThanOrEqual(2);
}

async function expectCenteredInspectorClose(page: Page) {
  const header = inspector(page).locator('[data-slot="sheet-header"]');
  await noOverflow(header);
  await expect
    .poll(async () => {
      const bounds = await header.boundingBox();
      const close = await header
        .getByRole("button", { name: "Close prompt action" })
        .boundingBox();
      if (!bounds || !close) return Number.POSITIVE_INFINITY;
      return Math.abs(
        close.y + close.height / 2 - (bounds.y + bounds.height / 2),
      );
    })
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

  test("opens one continuous prompt drawer from the library without a floating loading frame", async ({
    page,
  }) => {
    await page.goto("/prompts");
    await expect(
      page.getByRole("link", { name: fixtureName, exact: true }),
    ).toBeVisible();
    const table = await page
      .locator('[data-table-ready="true"]')
      .elementHandle();
    const audit = await page.evaluateHandle(() => {
      const result = { added: 0, removed: 0, floating: 0 };
      const count = (node: Node, selector: string) =>
        node instanceof Element
          ? Number(node.matches(selector)) +
            node.querySelectorAll(selector).length
          : 0;
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            result.added += count(node, "[data-detail-drawer]");
            result.floating += count(
              node,
              'output[aria-label="Loading details"]',
            );
          }
          for (const node of record.removedNodes)
            result.removed += count(node, "[data-detail-drawer]");
        }
      }).observe(document.body, { childList: true, subtree: true });
      return result;
    });
    for (let iteration = 0; iteration < 2; iteration++) {
      await page.getByRole("link", { name: fixtureName, exact: true }).click();
      await expect(
        promptDrawer(page).getByLabel("System Message"),
      ).toBeVisible();
      await expect(promptDrawer(page)).toHaveAttribute(
        "data-entry-motion",
        "preserve",
      );
      expect(await table?.evaluate((node) => node.isConnected)).toBe(true);
      expect(await audit.jsonValue()).toEqual({
        added: iteration + 1,
        removed: iteration,
        floating: 0,
      });
      await promptDrawer(page)
        .getByRole("button", { name: "Close detail" })
        .click();
      await expect(promptDrawer(page)).toHaveCount(0);
    }
  });

  test("offers row actions in dialogs and confirms archive and restore before mutating", async ({
    page,
    request,
  }) => {
    const created = await action(request, {
      action: "create",
      key: `${compositionKey}-actions`,
      name: "E2E row actions",
      categoryId,
      content,
      note: "Actions fixture",
    });
    await page.goto(`/prompts?q=${compositionKey}-actions`);
    const row = page
      .getByRole("row")
      .filter({ hasText: `${compositionKey}-actions` });
    const menu = async (name: string) => {
      await row.getByRole("button", { name: /^Actions for/ }).click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    };
    const checkbox = row.getByRole("checkbox");
    const geometry = await checkbox.evaluate((el) => {
      const cell = el.closest("td")!.getBoundingClientRect(),
        bounds = el.getBoundingClientRect();
      return Math.abs(bounds.x + bounds.width / 2 - cell.x - cell.width / 2);
    });
    expect(geometry).toBeLessThan(1);
    await row.hover();
    const cells = row.getByRole("cell");
    await expect(cells.last()).not.toHaveCSS("position", "sticky");
    await expect(cells.last()).toHaveCSS(
      "background-color",
      await cells.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    await menu("Rename prompt");
    let dialog = page.getByRole("dialog", {
      name: "Rename prompt",
      exact: true,
    });
    await expect(inspector(page)).toHaveCount(0);
    await dialog.getByLabel("Prompt name").fill("E2E renamed prompt");
    await dialog
      .getByRole("button", { name: "Rename prompt", exact: true })
      .click();
    await expect(row).toContainText("E2E renamed prompt");
    await menu("Move to category");
    dialog = page.getByRole("dialog", { name: "Move prompt", exact: true });
    await dialog.getByRole("button", { name: "Destination category" }).click();
    await page
      .getByRole("menuitemradio", { name: "Root", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Move prompt", exact: true })
      .click();
    await expect(row).toContainText("Root");
    await menu("Code helper");
    dialog = page.getByRole("dialog", { name: "Use this prompt", exact: true });
    await expect(dialog).toContainText(`id: "${compositionKey}-actions"`);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(dialog);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await menu("Archive prompt");
    dialog = page.getByRole("dialog", { name: "Archive prompt?", exact: true });
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeVisible();
    await menu("Archive prompt");
    await dialog
      .getByRole("button", { name: "Archive prompt", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    await page.goto(`/prompts?q=${compositionKey}-actions&archived=true`);
    await menu("Restore prompt");
    dialog = page.getByRole("dialog", { name: "Restore prompt?", exact: true });
    await expect(dialog).toContainText("does not assign a version");
    await page.keyboard.press("Escape");
    await expect(row).toBeVisible();
    await menu("Restore prompt");
    await dialog
      .getByRole("button", { name: "Restore prompt", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    await page.goto(`/prompts/${created.id}`);
    await page
      .getByRole("button", { name: "Prompt actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Rename prompt", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Rename prompt", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(
      page.getByRole("dialog", { name: "Rename prompt", exact: true }),
    ).toBeVisible();
  });

  test("keeps the header compact and history consistent across tabs", async ({
    page,
  }) => {
    await page.goto(`/prompts/${id}`);
    const header = page.locator("[data-prompt-header]");
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(76);
    for (const name of ["Content", "Runs 0", "Evals 0", "Activity"]) {
      await page
        .getByRole("button", { name: new RegExp(`^${name}$`, "i") })
        .click();
      await expect(page.locator("aside")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Version history · v2", exact: true }),
      ).toBeHidden();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Version history · v2", exact: true }),
    ).toBeVisible();
    await noOverflow(header);
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();
  });

  test("confirms group removal, policy changes and promotion without accidental writes", async ({
    page,
  }) => {
    const mutations: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/api/studio/prompts/actions") &&
        request.method() === "POST"
      )
        mutations.push(request.postDataJSON().action);
    });
    await page.goto(`/prompts/groups/${groupId}`);
    await page
      .getByRole("button", {
        name: `Remove ${fixtureName} from group`,
        exact: true,
      })
      .click();
    let confirmation = page.getByRole("dialog", {
      name: "Remove prompt from group?",
      exact: true,
    });
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: fixtureName, exact: true }),
    ).toBeVisible();
    expect(mutations).toEqual([]);
    await page.goto(`/prompts/${id}`);
    await page
      .getByRole("button", { name: "Prompt actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Promotion policy", exact: true })
      .click();
    await inspector(page)
      .getByRole("button", { name: "Save policy", exact: true })
      .click();
    confirmation = page.getByRole("dialog", {
      name: "Save promotion policy?",
      exact: true,
    });
    await expect(confirmation).toContainText("promotion requirements");
    await page.keyboard.press("Escape");
    await expect(inspector(page)).toBeVisible();
    expect(mutations).toEqual([]);
    await inspector(page)
      .getByRole("button", { name: "Close prompt action", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Version 2 actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Promote / roll back…", exact: true })
      .click();
    await inspector(page)
      .getByRole("button", { name: "Promote v2", exact: true })
      .click();
    confirmation = page.getByRole("dialog", {
      name: "Promote prompt?",
      exact: true,
    });
    await expect(confirmation).toContainText("v2 to production");
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(mutations).toEqual([]);
    await inspector(page)
      .getByRole("button", { name: "Promote v2", exact: true })
      .click();
    // Preserve the confirmation and the action panel after server rejection.
    await page.route("**/api/studio/prompts/actions", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Assignment changed. Review the latest version.",
        }),
      }),
    );
    await confirmation
      .getByRole("button", { name: "Confirm promotion", exact: true })
      .click();
    await expect(confirmation.getByRole("alert")).toContainText(
      "Assignment changed",
    );
    await expect(inspector(page)).toBeVisible();
  });

  test("confirms bulk archive and restore and requires a category deletion destination", async ({
    page,
    request,
  }) => {
    await page.goto(`/prompts?q=${fixtureKey}`);
    await page
      .getByRole("checkbox", { name: `Select ${fixtureName}`, exact: true })
      .check();
    await page
      .getByRole("button", { name: "1 selected · Actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Archive selected prompts…", exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "Archive selected prompts?",
      exact: true,
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: fixtureName, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "1 selected · Actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Archive selected prompts…", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Archive prompts", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: fixtureName, exact: true }),
    ).toHaveCount(0);
    await page.goto(`/prompts?q=${fixtureKey}&archived=true`);
    await page
      .getByRole("checkbox", { name: `Select ${fixtureName}`, exact: true })
      .check();
    await page
      .getByRole("button", { name: "1 selected · Actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Restore selected prompts…", exact: true })
      .click();
    dialog = page.getByRole("dialog", {
      name: "Restore selected prompts?",
      exact: true,
    });
    await dialog
      .getByRole("button", { name: "Restore prompts", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: fixtureName, exact: true }),
    ).toHaveCount(0);
    await action(request, {
      action: "category-create",
      path: `${categoryName} disposable`,
    });
    await page.goto("/prompts");
    await page
      .getByRole("button", {
        name: `${categoryName} disposable category actions`,
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", { name: "Delete category…", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Delete category", exact: true });
    await expect(
      dialog.getByRole("button", {
        name: "Move prompts & delete",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Destination category", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Root", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Move prompts & delete", exact: true })
      .click();
    await expect(
      page.getByRole("link", {
        name: `${categoryName} disposable`,
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("opens categories from the left on narrow screens", async ({ page }) => {
    await page.goto("/prompts");
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const trigger = page.getByRole("button", {
        name: "Open categories",
        exact: true,
      });
      await trigger.click();
      const categories = page.getByRole("navigation", {
        name: "Prompt categories",
        exact: true,
      });
      await expect(categories).toBeVisible();
      const bounds = await categories.boundingBox();
      const body = await page
        .locator("[data-prompt-library-body]")
        .boundingBox();
      expect(bounds!.x).toBe(body!.x);
      expect(bounds!.y).toBe(body!.y);
      expect(bounds!.height).toBe(body!.height);
      expect(bounds!.y).toBeGreaterThan(0);
      expect(bounds!.width).toBeLessThan(width);
      await expect(
        categories.getByRole("link", { name: categoryName, exact: true }),
      ).toBeVisible();
      await categories
        .getByRole("button", {
          name: `${categoryName} category actions`,
          exact: true,
        })
        .click();
      await page.getByRole("menu").press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(categories).toBeVisible();
      await page
        .getByRole("button", { name: "Collapse categories", exact: true })
        .press("Escape");
      await expect(categories).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await categories
        .getByRole("link", { name: categoryName, exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/prompts/categories/${categoryId}$`),
      );
      await expect(categories).toHaveCount(0);
      await page
        .getByRole("button", { name: "Open categories", exact: true })
        .click();
      await categories
        .getByRole("button", { name: "New category", exact: true })
        .click();
      const create = page.getByRole("dialog", {
        name: "New category",
        exact: true,
      });
      await expect(create).toBeVisible();
      await create.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(create).toHaveCount(0);
      await page.goto("/prompts");
    }
  });

  test("edits highlighted JSON with native history, formatting and validation", async ({
    page,
    request,
  }) => {
    const initialConfig = {
      modelName: "fast",
      temperature: 0,
      enabled: true,
      fallback: null,
    };
    const created = await action(request, {
      action: "create",
      key: `${compositionKey}-json`,
      name: "E2E JSON editor",
      categoryId,
      content: { ...content, config: initialConfig },
      note: "JSON editor fixture",
    });
    await page.goto(`/prompts/${created.id}`);
    const config = page.getByRole("textbox", {
      name: "Configuration",
      exact: true,
    });
    await expect(config).toHaveAttribute("aria-readonly", "true");
    const keyColor = await config
      .getByText('"modelName"', { exact: true })
      .evaluate((el) => getComputedStyle(el).color);
    const stringColor = await config
      .getByText('"fast"', { exact: true })
      .evaluate((el) => getComputedStyle(el).color);
    const numberColor = await config
      .getByText("0", { exact: true })
      .evaluate((el) => getComputedStyle(el).color);
    expect(new Set([keyColor, stringColor, numberColor]).size).toBe(3);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(config).toHaveAttribute("contenteditable", "true");
    const candidate = {
      ...initialConfig,
      modelName: "accurate",
      temperature: 0.3,
    };
    const compact = JSON.stringify(candidate);
    await config.fill(compact);
    await page
      .getByRole("button", { name: "Format Configuration", exact: true })
      .click();
    await expect(config.locator(".cm-line")).toHaveCount(6);
    await config.press("ControlOrMeta+z");
    await expect(config).toHaveText(compact);
    await config.press("ControlOrMeta+Shift+z");
    await expect(config.locator(".cm-line")).toHaveCount(6);
    // Tab must leave the code field instead of trapping keyboard form navigation.
    await config.press("Tab");
    await expect(
      page
        .locator("summary")
        .filter({ hasText: "Contracts & template inputs" }),
    ).toBeFocused();
    await config.fill('{"modelName": invalid}');
    await expect(config).toHaveAttribute("aria-invalid", "true");
    await expect(config.locator(".cm-lintPoint-error")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Save version", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Format Configuration", exact: true }),
    ).toBeDisabled();
    await config.fill(compact);
    await expect(config).toHaveAttribute("aria-invalid", "false");
    await page
      .getByText("Contracts & template inputs", { exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Template input schema", exact: true }),
    ).toHaveClass(/cm-content/);
    await expect(
      page.getByRole("textbox", { name: "Configuration schema", exact: true }),
    ).toHaveClass(/cm-content/);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page.locator('[data-json-editor="true"]').first());
    }
    await page
      .getByRole("button", { name: "Save version", exact: true })
      .click();
    await page.getByLabel("Change note").fill("Try the accurate model");
    await page
      .getByRole("button", { name: "Accept & save version", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(config).toHaveAttribute("aria-readonly", "true");
    await expect
      .poll(async () => JSON.parse(await config.innerText()))
      .toEqual(candidate);
    await expect(page).toHaveURL(/\?v=2$/);
    await page.reload();
    await expect
      .poll(async () => JSON.parse(await config.innerText()))
      .toEqual(candidate);
  });

  test("cancels clean drafts directly and confirms dirty or invalid changes", async ({
    page,
    request,
  }) => {
    await openPrompt(page);
    const drawer = promptDrawer(page);
    await drawer.getByRole("button", { name: "Edit", exact: true }).click();
    await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Discard changes?" }),
    ).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();

    await drawer.getByRole("button", { name: "Edit", exact: true }).click();
    await drawer
      .getByLabel("System Message")
      .fill("Temporary draft to discard");
    await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Discard changes?" });
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByRole("button", { name: "Keep editing" }),
    ).toBeFocused();
    await confirmation.getByRole("button", { name: "Keep editing" }).click();
    await expect(drawer.getByLabel("System Message")).toHaveText(
      "Temporary draft to discard",
    );
    await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(drawer).toBeVisible();
    // Invalid JSON lives inside the field, so it must count as dirty too.
    await drawer.getByLabel("Configuration", { exact: true }).fill("{");
    await expect(
      drawer.getByRole("button", { name: "Save version" }),
    ).toBeDisabled();
    await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
    await confirmation
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();
    const response = await request.get(
      `${apiUrl}/v1/studio/prompts/assets/${id}`,
      {
        headers: {
          authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY}`,
        },
      },
    );
    const saved = await response.json();
    expect(saved.draft).toBeNull();
    expect(saved.versions).toHaveLength(2);
    await drawer.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(drawer.getByLabel("System Message")).toHaveText(
      "Classify requests as support or sales. Pricing requests are sales.",
    );
    await expect(
      drawer.getByLabel("Configuration", { exact: true }),
    ).toHaveText("{}");
    // Invalid-only changes cannot bypass confirmation when content is unchanged.
    await drawer.getByLabel("Configuration", { exact: true }).fill("{");
    await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
  });

  test("waits for an in-flight autosave before discarding and does not recreate the draft", async ({
    page,
    request,
  }) => {
    await openPrompt(page);
    const drawer = promptDrawer(page);
    await drawer.getByRole("button", { name: "Edit", exact: true }).click();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let saving = false;
    await page.route("**/api/studio/prompts/actions", async (route) => {
      if (route.request().postDataJSON()?.action !== "draft")
        return route.continue();
      const response = await route.fetch();
      saving = true;
      await gate;
      await route.fulfill({ response });
    });
    await drawer
      .getByLabel("System Message")
      .fill("In-flight draft to discard");
    await expect.poll(() => saving).toBe(true);
    await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Discard changes?" });
    await confirmation
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(
      confirmation.getByRole("button", { name: "Discarding…" }),
    ).toBeDisabled();
    release();
    await expect(confirmation).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();
    await page.reload();
    // A direct reload opens the routed page rather than an intercepted drawer.
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();
    const response = await request.get(
      `${apiUrl}/v1/studio/prompts/assets/${id}`,
      {
        headers: {
          authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY}`,
        },
      },
    );
    expect((await response.json()).draft).toBeNull();
  });

  test("fills prompt tabs with canonical run and evaluation tables and preserves nested navigation", async ({
    page,
    request,
  }) => {
    const sql = postgres(
      process.env.DATABASE_URL ??
        "postgres://kortyx:kortyx@127.0.0.1:6543/kortyx",
      { max: 1 },
    );
    const events =
      await sql`select id, payload from telemetry_events where run_id=${DRAWER_FIXTURE.runId} and type='generation.completed'`;
    const [evaluation] =
      await sql`select request from eval_runs where id=${EVAL_FIXTURE.candidate}`;
    const duplicateId = randomUUID();
    try {
      const response = await request.get(
        `${apiUrl}/v1/studio/prompts/assets/${id}`,
        {
          headers: {
            authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY ?? "ktyx_test_localstudio_oss-demo-studio-secret-change-me"}`,
          },
        },
      );
      const version = (await response.json()).versions.find(
        (item: { version: number }) => item.version === 2,
      );
      await sql`update telemetry_events set payload=jsonb_set(payload, '{prompt}', ${sql.json({ name: fixtureKey, version: 2, source: "studio", metadata: { hash: version.hash } })}) where run_id=${DRAWER_FIXTURE.runId} and type='generation.completed'`;
      // Two generation receipts from one execution must produce one run row.
      await sql`insert into telemetry_events select (jsonb_populate_record(null::telemetry_events, to_jsonb(original) || jsonb_build_object('id', ${duplicateId}::text, 'event_id', ${`e2e-prompt-receipt-${duplicateId}`}::text))).* from telemetry_events original where original.id=${events[0]!.id}`;
      await sql`update eval_runs set request=jsonb_set(request, '{promptSnapshot}', ${sql.json({ schemaVersion: 1, environment: "development", source: "eval", revision: "table-fixture", versions: { [fixtureKey]: version } })}) where id=${EVAL_FIXTURE.candidate}`;
      await page.setViewportSize({ width: 1440, height: 1000 });
      await openPrompt(page);
      await promptDrawer(page)
        .getByRole("button", { name: /^Runs \d+$/i })
        .click();
      const runs = page.locator('[data-prompt-table="runs"]');
      await expect(
        runs.locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`),
      ).toBeVisible();
      await expect(runs.locator("tbody tr")).toHaveCount(1);
      await expect(
        runs.getByRole("columnheader", { name: /^Workflows / }),
      ).toBeVisible();
      await expect(runs).toContainText(DRAWER_FIXTURE.workflowId);
      await expect(runs).toContainText("Showing 1–1 of 1");
      await expectFilledTable(runs);
      await runs
        .locator(`[data-row-key="${DRAWER_FIXTURE.runId}"]`)
        .locator("td")
        .first()
        .click();
      const runDrawer = page.locator(
        `[data-detail-drawer="/runs/${DRAWER_FIXTURE.runId}"]`,
      );
      await expect(runDrawer).toHaveAttribute("data-state", "open");
      await expect(
        runDrawer.getByRole("button", { name: "Overview", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(promptDrawer(page)).toHaveAttribute("data-state", "open");
      await expect(runs.locator("tbody tr")).toHaveCount(1);
      await promptDrawer(page)
        .getByRole("button", { name: /^Evals \d+$/i })
        .click();
      const evals = page.locator('[data-prompt-table="evals"]');
      await expect(
        evals.locator(`[data-row-key="${EVAL_FIXTURE.candidate}"]`),
      ).toBeVisible();
      await expect(
        evals.getByRole("columnheader", { name: /^Evaluation run / }),
      ).toBeVisible();
      await expect(
        evals.getByRole("columnheader", { name: /^Progress / }),
      ).toBeVisible();
      await expectFilledTable(evals);
      await evals
        .locator(`[data-row-key="${EVAL_FIXTURE.candidate}"]`)
        .locator("td")
        .nth(1)
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/evals/runs/${EVAL_FIXTURE.candidate}`),
      );
    } finally {
      await sql`delete from telemetry_events where id=${duplicateId}`;
      for (const event of events)
        await sql`update telemetry_events set payload=${sql.json(event.payload)} where id=${event.id}`;
      if (evaluation)
        await sql`update eval_runs set request=${sql.json(evaluation.request)} where id=${EVAL_FIXTURE.candidate}`;
      await sql.end();
    }
  });

  test("keeps empty version tables full height on desktop, tablet and mobile", async ({
    page,
  }) => {
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const kind of ["runs", "evals"]) {
        await page.goto(`/prompts/${id}?v=1&tab=${kind}`);
        const table = page
          .locator(`[data-prompt-table="${kind}"]`)
          .filter({ visible: true });
        await expect(
          table.getByText(
            kind === "runs"
              ? "No runs have reported this version."
              : "No evaluations for this version yet.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(table.locator("tbody tr")).toHaveCount(0);
        await expectFilledTable(table);
        await noOverflow(table);
        await expect(
          page.getByRole("button", {
            name: width === 1440 ? "Version history" : "Version history · v1",
            exact: true,
          }),
        ).toBeVisible();
      }
    }
  });

  test("highlights inputs and saves an included version using the native prompt picker", async ({
    page,
    request,
  }) => {
    const compositionId = (
      await action(request, {
        action: "create",
        key: compositionKey,
        name: compositionName,
        categoryId,
        content,
        note: "Composition fixture",
      })
    ).id;
    await page.goto(`/prompts/${compositionId}`);
    await expect(
      page.getByLabel("User Message").locator("[data-template-variable]"),
    ).toHaveText("{{message}}");
    await expect(page.getByText("Message format", { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const system = page.getByLabel("System Message");
    await system.fill("Before ");
    await system.pressSequentially("#E2E prompt drawer@v1");
    const option = page
      .getByRole("option")
      .filter({ hasText: /^E2E prompt drawer/ })
      .filter({ hasText: "v1" });
    await expect(option).toBeVisible();
    const includedDraft = page.waitForResponse((response) => {
      if (
        !response.url().endsWith("/api/studio/prompts/actions") ||
        response.request().method() !== "POST"
      )
        return false;
      const body = response.request().postDataJSON();
      return (
        body.action === "draft" &&
        body.content.dependencies.some(
          (dep: { id: string }) => dep.id === fixtureKey,
        )
      );
    });
    await option.click();
    await includedDraft;
    await expect(
      page.getByText("Editing a draft · Draft saved", { exact: true }),
    ).toBeVisible();
    await system.press("ControlOrMeta+a");
    await system.press("Backspace");
    await expect(system.locator("[data-prompt-reference]")).toHaveCount(0);
    await system.press("ControlOrMeta+z");
    await expect(system.locator("[data-prompt-reference]")).toHaveText(
      "#E2E prompt drawer@v1",
    );
    await system.press("ControlOrMeta+Shift+z");
    await expect(system.locator("[data-prompt-reference]")).toHaveCount(0);
    await system.press("ControlOrMeta+z");
    await expect(system.locator("[data-prompt-reference]")).toHaveText(
      "#E2E prompt drawer@v1",
    );
    await page
      .getByRole("button", { name: "Save version", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "[[prompt:e2e-prompt-drawers/classify]]",
    );
    await page
      .getByLabel("Change note", { exact: false })
      .fill("Include the original classifier instructions");
    await page
      .getByRole("button", { name: "Accept & save version", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("System Message").locator("[data-prompt-reference]"),
    ).toHaveText("#E2E prompt drawer@v1");
    const response = await request.get(
      `${apiUrl}/v1/studio/prompts/assets/${compositionId}`,
      {
        headers: {
          authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY}`,
        },
      },
    );
    expect(response.ok()).toBe(true);
    const detail = await response.json();
    expect(detail.versions[0].content.messages[0].content).toBe(
      "Before [[prompt:e2e-prompt-drawers/classify]] ",
    );
    expect(detail.versions[0].content.dependencies[0]).toMatchObject({
      id: fixtureKey,
      version: 1,
      hash: await promptHash(content),
    });
  });

  test("isolates picker Escape and rejects conflicting Latest references", async ({
    page,
    request,
  }) => {
    const { id: conflictId } = await action(request, {
      action: "create",
      key: `${compositionKey}-conflict`,
      name: "E2E conflicting references",
      categoryId,
      content: {
        ...content,
        messages: [
          { role: "system", content: `[[prompt:${fixtureKey}]]` },
          content.messages[1],
        ],
        dependencies: [
          { id: fixtureKey, version: 1, hash: await promptHash(content) },
        ],
      },
      note: "Pinned to v1",
    });
    await page.goto(`/prompts/${conflictId}?edit=true`);
    const user = page.getByLabel("User Message");
    await user.fill("");
    await user.pressSequentially("#E2E prompt drawer@Latest");
    await expect(
      page.getByRole("listbox", { name: "Include a prompt" }),
    ).toBeVisible();
    await user.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();
    // A parent cannot contain conflicting pins of one child. Use the already
    // pinned v1 for this parent; Latest is offered as v2 and is rejected safely.
    await user.press("ControlOrMeta+a");
    await user.press("Backspace");
    await expect(user).toHaveText("");
    await user.pressSequentially("#E2E prompt drawer@Latest");
    await page.getByRole("option").filter({ hasText: "Latest · v2" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "already included" }),
    ).toContainText("already included at another version");
    await expect(user.locator("[data-prompt-reference]")).toHaveCount(0);
  });

  test("pins Latest and serves the included text through the SDK", async ({
    page,
    request,
  }) => {
    const key = `${compositionKey}-latest`;
    const result = await action(request, {
      action: "create",
      key,
      name: "E2E latest composition",
      categoryId,
      content,
      note: "Latest composition fixture",
    });
    await page.goto(`/prompts/${result.id}?edit=true`);
    const system = page.getByLabel("System Message");
    await system.fill("");
    await system.pressSequentially("#E2E prompt drawer@Latest");
    await page.getByRole("option").filter({ hasText: "Latest · v2" }).click();
    await expect(system.locator("[data-prompt-reference]")).toHaveText(
      "#E2E prompt drawer@v2",
    );
    await page
      .getByRole("button", { name: "Save version", exact: true })
      .click();
    await page
      .getByLabel("Change note", { exact: false })
      .fill("Pin the latest classifier instructions");
    await page
      .getByRole("button", { name: "Accept & save version", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const source = studioPromptSource({
      apiUrl,
      apiKey:
        process.env.KORTYX_TELEMETRY_API_KEY ??
        "ktyx_test_localtelemetry_oss-demo-telemetry-secret-change-me",
      environment: "production",
    });
    const snapshot = await source.resolve([key], {
      environment: "production",
      versions: { [key]: 2 },
    });
    const ref = definePrompt({
      id: key,
      format: "system-user",
      variables: z.object({ message: z.string() }),
      config: z.object({}),
    });
    const compiled = await createPrompts({ definitions: [ref], source })
      .start()
      .resolve(ref, { variables: { message: "hello" }, stored: snapshot });
    expect(compiled.system).toBe(
      "Classify requests as support or sales. Pricing requests are sales. ",
    );
    expect(compiled.user).toBe("hello");
    expect(compiled.dependencies?.[0]).toMatchObject({
      id: fixtureKey,
      version: 2,
    });
  });

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
    await expect(surface.getByLabel("System Message")).toHaveText(
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
      await policyInspector(page);
      await expect(inspector(page)).toHaveCount(1);
      await expectCenteredInspectorClose(page);
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
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await policyInspector(page);
      await expectCenteredInspectorClose(page);
      await inspector(page)
        .getByRole("button", { name: "Close prompt action" })
        .click();
      await expect(inspector(page)).toHaveCount(0);
      await expect(promptDrawer(page)).toHaveAttribute("data-state", "open");
    }
  });

  test("Back and Forward restore the action inspector and changing tabs closes it", async ({
    page,
  }) => {
    await openPrompt(page);
    await policyInspector(page);
    await expect(page).toHaveURL(/promptAction=policy/);
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
    await policyInspector(page);
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
    await expect(promptDrawer(page).getByLabel("System Message")).toHaveText(
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
