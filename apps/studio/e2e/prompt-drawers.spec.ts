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
    await sql`delete from prompt_groups where name in (${`${groupName} continuity`}, ${`${groupName} continuity renamed`})`;
    await sql`delete from prompt_assets where key=${`${compositionKey}-latest`}`;
    await sql`delete from prompt_assets where key=${`${compositionKey}-conflict`}`;
    await sql`delete from prompt_assets where key=${compositionKey}`;
    await sql`delete from prompt_assets where key=${`${compositionKey}-json`}`;
    await sql`delete from prompt_assets where key=${`${compositionKey}-actions`}`;
    await sql`delete from prompt_assets where key=${`${compositionKey}-draft`}`;
    await sql`delete from prompt_assets where key=${`${compositionKey}-continuity`}`;
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
  await expect(
    promptDrawer(page).getByLabel("System Message").filter({ visible: true }),
  ).toHaveText(
    "Classify requests as support or sales. Pricing requests are sales.",
  );
}
async function requestDeleteDraft(page: Page, surface: Locator) {
  await surface
    .getByRole("button", { name: "Prompt actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete draft", exact: true })
    .click();
}
async function groupInspector(page: Page) {
  const version = new URL(page.url()).searchParams.get("v") ?? "2";
  const button = page.getByRole("button", {
    name: `Version ${version} actions`,
    exact: true,
  });
  if (await button.isVisible()) await button.click();
  else {
    await page
      .getByRole("button", {
        name: `Version history · v${version}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", { name: `v${version} actions`, exact: true })
      .hover();
  }
  await page
    .getByRole("menuitem", { name: "Add to test group", exact: true })
    .click();
  await expect(inspector(page)).toHaveAttribute("data-state", "open");
  await expect(
    inspector(page).getByLabel("Or create a group", { exact: true }),
  ).toBeVisible();
}
const policyModal = (page: Page) =>
  page.getByRole("dialog", { name: "Promotion policy", exact: true });
async function noOverflow(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeLessThanOrEqual(1);
}

// Observe every animation frame and removal, not just the final settled UI.
async function monitorPromptSurface(page: Page, selectors: string[]) {
  await page.evaluate((selectors) => {
    const nodes = selectors.map((selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement))
        throw new Error(`Missing ${selector}`);
      return node;
    });
    const failures: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records)
        for (const removed of record.removedNodes)
          if (nodes.some((node) => removed === node || removed.contains(node)))
            failures.push("Mounted surface removed");
    });
    observer.observe(document.body, { childList: true, subtree: true });
    let frame = 0;
    const sample = () => {
      if (
        nodes.some(
          (node) =>
            !node.isConnected ||
            node.getBoundingClientRect().height === 0 ||
            getComputedStyle(node).visibility === "hidden",
        )
      )
        failures.push("Surface disappeared for a frame");
      frame = requestAnimationFrame(sample);
    };
    sample();
    Object.assign(window, {
      promptContinuity: {
        failures,
        stop: () => {
          observer.disconnect();
          cancelAnimationFrame(frame);
        },
      },
    });
  }, selectors);
  const routeRequests: string[] = [];
  const requestListener = (request: import("@playwright/test").Request) => {
    if (
      request.isNavigationRequest() ||
      (request.headers().rsc === "1" &&
        request.headers()["next-router-prefetch"] !== "1" &&
        request.headers().purpose !== "prefetch")
    )
      routeRequests.push(request.url());
  };
  page.on("request", requestListener);
  return async () => {
    // Cover a delayed refresh/exit animation after the success modal closes.
    await page.waitForTimeout(400);
    const failures = await page.evaluate(() => {
      const monitor = (
        window as unknown as {
          promptContinuity: { failures: string[]; stop: () => void };
        }
      ).promptContinuity;
      monitor.stop();
      return monitor.failures;
    });
    page.off("request", requestListener);
    expect(failures).toEqual([]);
    expect(
      routeRequests,
      "Saving should not request a new route payload",
    ).toEqual([]);
  };
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
        promptDrawer(page)
          .getByLabel("System Message")
          .filter({ visible: true }),
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
    await expect(dialog).toContainText("does not make a version live");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
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

  test("keeps one compact header through drawer expansion with inline history and overflow actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPrompt(page);
    const surface = promptDrawer(page);
    const header = surface.locator("[data-prompt-header]");
    const tabs = surface.locator("[data-prompt-tabs-row]");
    const picker = tabs.getByRole("button", {
      name: "Version history · v2",
      exact: true,
    });
    const node = await header.elementHandle();
    await expect(surface.locator("header")).toHaveCount(1);
    await expect(picker).toBeVisible();
    expect((await header.boundingBox())!.height).toBe(64);
    expect((await tabs.boundingBox())!.height).toBeLessThanOrEqual(45);
    const menu = header.getByRole("button", {
      name: "Prompt actions",
      exact: true,
    });
    const close = header.getByRole("button", {
      name: "Close detail",
      exact: true,
    });
    expect((await menu.boundingBox())!.x).toBeLessThan(
      (await close.boundingBox())!.x,
    );
    await expect(
      header.getByRole("button", { name: "Test version", exact: true }),
    ).toBeHidden();
    await menu.click();
    await expect(
      page.getByRole("menuitem", { name: "Test version", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await header
      .getByRole("button", { name: "Expand detail", exact: true })
      .click();
    await expect(surface).toHaveAttribute("data-detail-expanded", "true");
    await expect(surface).toHaveCSS("box-shadow", "none");
    await expect(
      header.getByRole("button", {
        name: "Back to prompt library",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Expand detail", exact: true }),
    ).toHaveCount(0);
    await expect(
      header.getByRole("button", { name: "Test version", exact: true }),
    ).toBeVisible();
    expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
    expect((await header.boundingBox())!.height).toBe(64);
    await menu.click();
    await expect(
      page.getByRole("menuitem", { name: "Test version", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await header
      .getByRole("button", { name: "Back to prompt library", exact: true })
      .click();
    await expect(surface).toHaveCount(0);
    await expect(page).toHaveURL(/\/prompts$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await openPrompt(page);
    await expect(picker).toBeVisible();
    await noOverflow(header);
    await noOverflow(tabs);
    expect((await header.boundingBox())!.height).toBe(64);
    expect((await tabs.boundingBox())!.height).toBeLessThanOrEqual(45);
    await surface
      .getByRole("button", { name: "New version", exact: true })
      .click();
    await expect(
      header.getByRole("button", { name: "Save version", exact: true }),
    ).toBeVisible();
    await noOverflow(header);
    await requestDeleteDraft(page, surface);
    await page
      .getByRole("dialog", { name: "Delete draft?" })
      .getByRole("button", { name: "Delete draft", exact: true })
      .click();
    await expect(
      header.getByRole("button", { name: "New version", exact: true }),
    ).toBeVisible();
  });

  test("keeps the header compact and history consistent across tabs", async ({
    page,
  }) => {
    await page.goto(`/prompts/${id}`);
    const header = page.locator("[data-prompt-header]");
    await expect(header).toBeVisible();
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
      page.getByRole("button", { name: "New version", exact: true }),
    ).toBeVisible();
  });

  test("saves version reviews in a modal and makes them discoverable after reload", async ({
    page,
  }) => {
    await openPrompt(page);
    const surface = promptDrawer(page);
    await surface.getByRole("button", { name: /^reviews 0$/i }).click();
    await expect(
      surface.getByRole("region", { name: "Reviews for v2" }),
    ).toContainText("No reviews yet");
    await surface
      .getByRole("button", { name: "Review this version", exact: true })
      .click();
    const modal = page.getByRole("dialog", {
      name: "Review version",
      exact: true,
    });
    await expect(modal).toBeVisible();
    await expect(inspector(page)).toHaveCount(0);
    await expect(
      modal.getByRole("button", { name: "Submit review" }),
    ).toBeDisabled();
    await modal
      .getByLabel("Review note", { exact: true })
      .fill("Unsaved review");
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(surface).toBeVisible();
    await expect(
      surface.getByRole("button", { name: /^reviews 0$/i }),
    ).toBeVisible();
    await surface
      .getByRole("button", { name: "Review this version", exact: true })
      .click();
    await modal
      .getByLabel("Review note", { exact: true })
      .fill("Checked pricing examples.\nReady for evaluation.");
    await modal.getByRole("button", { name: "Submit review" }).click();
    await expect(modal).toHaveCount(0);
    await expect(
      surface.getByRole("button", { name: /^reviews 1$/i }),
    ).toHaveAttribute("aria-current", "page");
    const reviews = page.getByRole("region", { name: "Reviews for v2" });
    await expect(reviews).toContainText("Checked pricing examples.");
    await expect(reviews.locator("article time")).toHaveAttribute(
      "datetime",
      /T/,
    );
    await expect(reviews).toContainText(
      "Does not count toward independent reviews",
    );
    await expect(page).not.toHaveURL(/promptAction=/);
    await page.reload();
    await expect(reviews).toContainText("Ready for evaluation.");
    // Older versions must fetch and retain their own reviews, not the newest version's.
    await page.goto(`/prompts/${id}?v=1&tab=reviews`);
    const older = page.getByRole("region", { name: "Reviews for v1" });
    await expect(older).toContainText("No reviews yet");
    await older.getByRole("button", { name: "Review this version" }).click();
    await modal
      .getByLabel("Review note", { exact: true })
      .fill("Reviewed the initial version.");
    await modal.getByRole("button", { name: "Submit review" }).click();
    await expect(older).toContainText("Reviewed the initial version.");
    await expect(older).not.toContainText("Checked pricing examples.");
    await older.getByRole("button", { name: "Review this version" }).click();
    await modal
      .getByLabel("Review note", { exact: true })
      .fill("Updated initial version review.");
    await modal.getByRole("button", { name: "Submit review" }).click();
    await expect(older.locator("article")).toHaveCount(1);
    await expect(older).toContainText("Updated initial version review.");
    await expect(page).not.toHaveURL(/promptAction=/);
    await page.reload();
    await expect(older).toContainText("Updated initial version review.");
    await page.setViewportSize({ width: 390, height: 844 });
    await older.getByRole("button", { name: "Review this version" }).click();
    await noOverflow(modal);
    await expect(
      modal.getByRole("button", { name: "Submit review" }),
    ).toBeVisible();
    await page.screenshot({
      path: "../../docs/qa/studio-prompts/mobile-review-modal.png",
    });
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    await noOverflow(older);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/prompts/${id}?v=2&tab=reviews`);
    await expect(reviews).toContainText("Checked pricing examples.");
    await expect(reviews).not.toContainText("Updated initial version review.");
    await page.screenshot({
      path: "../../docs/qa/studio-prompts/saved-version-reviews.png",
    });
  });

  test("saves and makes versions live without remounting the drawer or library", async ({
    page,
    request,
  }) => {
    const name = "E2E continuous prompt";
    const promptId = (
      await action(request, {
        action: "create",
        key: `${compositionKey}-continuity`,
        name,
        content,
        note: "Initial continuity fixture",
      })
    ).id;
    await page.goto("/prompts");
    await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
    await page.getByRole("link", { name, exact: true }).click();
    const surface = page.locator(`[data-detail-drawer="/prompts/${promptId}"]`);
    await expect(surface.locator("[data-prompt-header]")).toBeVisible();
    // Keep an actual delayed response in flight: the existing surface must
    // remain mounted throughout server work, modal dismissal and revalidation.
    let rejectNextSave = false;
    await page.route("**/api/studio/prompts/actions", async (route) => {
      if (rejectNextSave) {
        rejectNextSave = false;
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ message: "Concurrent update; try again." }),
        });
        return;
      }
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ response });
    });
    const selectors = [
      `[data-detail-drawer="/prompts/${promptId}"]`,
      `[data-detail-drawer="/prompts/${promptId}"] [data-prompt-header]`,
      '[data-table-ready="true"]',
    ];
    const actions = surface.getByRole("button", {
      name: "Prompt actions",
      exact: true,
    });
    await actions.click();
    await page
      .getByRole("menuitem", { name: "Rename prompt", exact: true })
      .click();
    const rename = page.getByRole("dialog", {
      name: "Rename prompt",
      exact: true,
    });
    await rename.getByRole("textbox").fill(`${name} renamed`);
    let assertStable = await monitorPromptSurface(page, selectors);
    await rename
      .getByRole("button", { name: "Rename prompt", exact: true })
      .click();
    await expect(rename).toHaveCount(0);
    await expect(
      surface.getByRole("heading", { name: `${name} renamed`, exact: true }),
    ).toBeVisible();
    await assertStable();
    await actions.click();
    await page
      .getByRole("menuitem", { name: "Promotion policy", exact: true })
      .click();
    await policyModal(page)
      .getByLabel("Require a passing full suite with verified prompt usage")
      .uncheck();
    assertStable = await monitorPromptSurface(page, selectors);
    await policyModal(page)
      .getByRole("button", { name: "Save policy", exact: true })
      .click();
    await expect(policyModal(page)).toHaveCount(0);
    await assertStable();
    await surface
      .getByRole("button", { name: "New version", exact: true })
      .click();
    await surface
      .getByLabel("System Message")
      .filter({ visible: true })
      .fill("Updated classification without reloads.");
    await surface
      .getByRole("button", { name: "Save version", exact: true })
      .click();
    const diff = page.getByRole("dialog", { name: "Review & save version" });
    await diff
      .getByLabel("Change note")
      .fill("Verify uninterrupted version save");
    assertStable = await monitorPromptSurface(page, selectors);
    await diff
      .getByRole("button", { name: "Accept & save version", exact: true })
      .click();
    await expect(diff).toHaveCount(0);
    await expect(
      surface.getByRole("button", { name: "New version", exact: true }),
    ).toBeVisible();
    await assertStable();
    await surface.getByRole("button", { name: "Version history · v2" }).click();
    await page
      .getByRole("menuitem", { name: "v2 actions", exact: true })
      .hover();
    await page
      .getByRole("menuitem", { name: "Make this live", exact: true })
      .click();
    const promotion = page.getByRole("dialog", {
      name: "Promote version",
      exact: true,
    });
    assertStable = await monitorPromptSurface(page, selectors);
    await promotion
      .getByRole("button", { name: "Promote v2", exact: true })
      .click();
    await expect(promotion).toHaveCount(0);
    await expect(surface.locator("[data-prompt-header]")).toContainText("Live");
    await assertStable();
    await page.screenshot({
      path: "../../docs/qa/studio-prompts/continuous-promotion.png",
    });
    await surface
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(surface).toHaveCount(0);
    const row = page.getByRole("row").filter({
      has: page.getByRole("link", { name: `${name} renamed`, exact: true }),
    });
    await expect(row).toContainText("v2");
    await expect(row).not.toContainText("Not live");
    // Row actions must update in place as well, without opening a detail route.
    await row
      .getByRole("button", { name: `Actions for ${name} renamed`, exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Rename prompt", exact: true })
      .click();
    await rename.getByRole("textbox").fill(name);
    assertStable = await monitorPromptSurface(page, [
      '[data-table-ready="true"]',
    ]);
    rejectNextSave = true;
    await rename
      .getByRole("button", { name: "Rename prompt", exact: true })
      .click();
    await expect(rename.getByRole("alert")).toContainText("Concurrent update");
    await expect(rename.getByRole("textbox")).toHaveValue(name);
    await rename
      .getByRole("button", { name: "Rename prompt", exact: true })
      .click();
    await expect(rename).toHaveCount(0);
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    await assertStable();
  });

  test("keeps loaded older history while the prompt revalidates in place", async ({
    page,
  }) => {
    let reads = 0;
    let template: Record<string, unknown> | undefined;
    await page.route(`**/api/studio/prompts/assets/${id}*`, async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      template ??= data.versions[0];
      const older = new URL(route.request().url()).searchParams.has(
        "versionsCursor",
      );
      if (!older) reads++;
      const versions = Array.from({ length: older ? 4 : 100 }, (_, index) => ({
        ...template,
        version: (older ? 4 : 104) - index,
        note: `History v${(older ? 4 : 104) - index}`,
      }));
      await route.fulfill({
        json: {
          ...data,
          asset: {
            ...data.asset,
            latestVersion: 104,
            name: `History read ${reads}`,
          },
          versions,
          versionsNextCursor: older ? null : "5",
        },
      });
    });
    await page.goto(`/prompts/${id}`);
    const history = page.locator("[data-prompt-version-history]");
    await expect(
      history.getByRole("button", { name: "Version 104 actions", exact: true }),
    ).toBeAttached();
    await history
      .getByRole("button", { name: "Load older versions", exact: true })
      .click();
    await expect(
      history.getByRole("button", { name: "Version 1 actions", exact: true }),
    ).toBeAttached();
    await expect(
      history.getByRole("button", { name: "Version 3 actions", exact: true }),
    ).toBeAttached();
    await expect(
      history.getByRole("button", { name: "Load older versions", exact: true }),
    ).toHaveCount(0);
    const before = reads;
    await expect.poll(() => reads, { timeout: 10000 }).toBeGreaterThan(before);
    await expect(
      page.locator("[data-prompt-header]").getByRole("heading", {
        name: `History read ${before + 1}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      history.getByRole("button", { name: "Version 1 actions", exact: true }),
    ).toBeAttached();
    await expect(
      history.getByRole("button", { name: "Load older versions", exact: true }),
    ).toHaveCount(0);
  });

  test("saves groups without refreshing their drawer or the parent library", async ({
    page,
  }) => {
    await page.goto("/prompts");
    await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
    await page.getByRole("link", { name: /^Test groups/ }).click();
    const groups = page.locator('[data-detail-drawer="/prompts/groups"]');
    await groups
      .getByRole("button", { name: "New group", exact: true })
      .click();
    await inspector(page)
      .getByLabel("Group name")
      .fill(`${groupName} continuity`);
    let assertStable = await monitorPromptSurface(page, [
      '[data-detail-drawer="/prompts/groups"]',
      '[data-table-ready="true"]',
    ]);
    await inspector(page)
      .getByRole("button", { name: "Save group", exact: true })
      .click();
    await expect(inspector(page)).toHaveCount(0);
    await expect(
      groups.getByRole("link", {
        name: `${groupName} continuity`,
        exact: true,
      }),
    ).toBeVisible();
    await assertStable();
    await groups
      .getByRole("button", {
        name: `${groupName} continuity group actions`,
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", { name: "Rename group", exact: true })
      .click();
    await inspector(page)
      .getByLabel("Group name")
      .fill(`${groupName} continuity renamed`);
    assertStable = await monitorPromptSurface(page, [
      '[data-detail-drawer="/prompts/groups"]',
      '[data-table-ready="true"]',
    ]);
    await inspector(page)
      .getByRole("button", { name: "Save group", exact: true })
      .click();
    await expect(inspector(page)).toHaveCount(0);
    await expect(
      groups.getByRole("link", {
        name: `${groupName} continuity renamed`,
        exact: true,
      }),
    ).toBeVisible();
    await assertStable();
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
    const confirmation = page.getByRole("dialog", {
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
    await expect(policyModal(page)).toContainText(
      "Other prompts keep their own policies.",
    );
    await policyModal(page).getByLabel("Independent human reviews").fill("2");
    await page.keyboard.press("Escape");
    await expect(policyModal(page)).toHaveCount(0);
    await expect(inspector(page)).toHaveCount(0);
    expect(mutations).toEqual([]);
    await page
      .getByRole("button", { name: "Version 2 actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Make this live", exact: true })
      .click();
    const promotion = page.getByRole("dialog", {
      name: "Promote version",
      exact: true,
    });
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(
      promotion.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await expect(promotion).toContainText("A passing full suite is required");
    await expect(
      promotion.getByRole("button", { name: "Promote v2", exact: true }),
    ).toBeDisabled();
    await promotion
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(promotion).toHaveCount(0);
    expect(mutations).toEqual([]);
    await page
      .getByRole("button", { name: "Version 2 actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Make this live", exact: true })
      .click();
    await promotion
      .getByRole("checkbox", { name: "Request an audited policy exception" })
      .check();
    await promotion
      .getByLabel("Exception reason", { exact: true })
      .fill("Test");
    await expect(promotion).toContainText(
      "At least 10 characters required (4/10)",
    );
    await expect(
      promotion.getByRole("button", { name: "Promote v2", exact: true }),
    ).toBeDisabled();
    await promotion
      .getByLabel("Exception reason", { exact: true })
      .fill("Reviewed bootstrap release");
    await expect(
      promotion.getByRole("button", { name: "Promote v2", exact: true }),
    ).toBeEnabled();
    // A server conflict stays in the one promotion dialog, without losing the reason.
    await page.route("**/api/studio/prompts/actions", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Assignment changed. Review the latest version.",
        }),
      }),
    );
    await promotion
      .getByRole("button", { name: "Promote v2", exact: true })
      .click();
    await expect(promotion.getByRole("alert")).toContainText(
      "Assignment changed",
    );
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(
      promotion.getByLabel("Exception reason", { exact: true }),
    ).toHaveValue("Reviewed bootstrap release");
    expect(mutations).toEqual(["promote"]);
    await promotion
      .getByLabel("Exception reason", { exact: true })
      .fill("Updated bootstrap release");
    await expect(promotion.getByRole("alert")).toHaveCount(0);
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
      const body = await page
        .locator("[data-prompt-library-body]:visible")
        .boundingBox();
      await expect
        .poll(async () => (await categories.boundingBox())?.x)
        .toBe(body!.x);
      const bounds = await categories.boundingBox();
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
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .getByRole("button", { name: "Open categories", exact: true })
      .click();
    await expect(
      page.getByRole("navigation", { name: "Prompt categories" }),
    ).toHaveCSS("animation-name", "none");
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
    await page
      .getByRole("button", { name: "New version", exact: true })
      .click();
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

  test("creates a persistent draft from newest content, browses versions, and saves the exact diff", async ({
    page,
    request,
  }) => {
    const draftId = (
      await action(request, {
        action: "create",
        key: `${compositionKey}-draft`,
        name: "E2E persistent draft",
        content,
        note: "No configuration in v1",
      })
    ).id;
    const latestContent = {
      ...content,
      config: { modelName: "accurate", temperature: 0.3, enabled: true },
    };
    await action(request, {
      action: "save",
      id: draftId,
      content: latestContent,
      baseVersion: 1,
      expectedHash: await promptHash(latestContent),
      note: "Add configuration in v2",
      idempotencyKey: randomUUID(),
    });
    await page.goto(`/prompts/${draftId}?v=1`);
    const config = page
      .getByLabel("Configuration", { exact: true })
      .filter({ visible: true });
    const system = page.getByLabel("System Message").filter({ visible: true });
    await expect(config).toHaveText("{}");
    await page
      .getByRole("button", { name: "Version 1 actions", exact: true })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Edit", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "New version", exact: true })
      .click();
    await expect(config).toContainText('"modelName": "accurate"');
    await expect(
      page.getByRole("button", { name: "Open draft in history" }),
    ).toBeVisible();
    await system.fill(
      "Keep the latest configuration and improve classification.",
    );
    // Navigate immediately, before the normal autosave debounce.
    await page
      .getByRole("button", { name: /v1 No configuration in v1/ })
      .click();
    await expect(config).toHaveText("{}");
    await expect(system).toHaveAttribute("contenteditable", "false");
    await page.getByRole("button", { name: "Open draft in history" }).click();
    await expect(system).toHaveText(
      "Keep the latest configuration and improve classification.",
    );
    await expect(config).toContainText('"modelName": "accurate"');
    // Invalid editor text must survive visiting another immutable version too.
    await expect(config).toHaveAttribute("contenteditable", "true");
    await config.fill('{"unfinished":');
    await expect(config).toHaveText('{"unfinished":');
    await page
      .getByRole("button", { name: /v2 Add configuration in v2/ })
      .click();
    await page.getByRole("button", { name: "Open draft in history" }).click();
    await expect(config).toHaveText('{"unfinished":');
    await expect(
      page.getByRole("button", { name: "Save version", exact: true }),
    ).toBeDisabled();
    await config.fill(JSON.stringify(latestContent.config));
    await page.getByRole("button", { name: /^reviews 0$/i }).click();
    await expect(
      page.getByRole("region", { name: "Reviews for v2" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open draft in history" }).click();
    // Leaving the prompt immediately must flush valid changes.
    await system.fill(
      "Persist across navigation without losing configuration.",
    );
    await page.getByRole("button", { name: "Back to prompt library" }).click();
    await expect(page).toHaveURL(/\/prompts$/);
    await page
      .getByRole("link", { name: "E2E persistent draft", exact: true })
      .click();
    const surface = page.locator(`[data-detail-drawer="/prompts/${draftId}"]`);
    await surface
      .getByRole("button", { name: "Open draft", exact: true })
      .click();
    await expect(system).toHaveText(
      "Persist across navigation without losing configuration.",
    );
    await expect(config).toContainText('"modelName": "accurate"');
    await page.setViewportSize({ width: 390, height: 844 });
    await surface
      .getByRole("button", { name: "Version history · Draft", exact: true })
      .click();
    await page.getByRole("menuitemradio", { name: /v1/ }).click();
    await expect(config).toHaveText("{}");
    await surface
      .getByRole("button", { name: "Version history · v1", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: /Based on v2.*Draft/ })
      .click();
    await expect(system).toHaveText(
      "Persist across navigation without losing configuration.",
    );
    await page.screenshot({
      path: "../../docs/qa/studio-prompts/mobile-persistent-draft.png",
    });
    await surface
      .getByRole("button", { name: "Save version", exact: true })
      .click();
    const diff = page.getByRole("dialog", { name: "Review & save version" });
    await expect(diff).toContainText("v2");
    await expect(diff).toContainText("Draft → v3");
    await expect(
      diff
        .locator('[data-diff-change="removed"], [data-diff-change="added"]')
        .filter({ hasText: /modelName|temperature|enabled/ }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "../../docs/qa/studio-prompts/draft-config-diff.png",
    });
    // Capture the submitted candidate as well as reading back its persisted config.
    let savedContent: unknown;
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        req.url().endsWith("/api/studio/prompts/actions") &&
        req.postDataJSON()?.action === "save"
      )
        savedContent = req.postDataJSON().content;
    });
    await diff
      .getByLabel("Change note", { exact: false })
      .fill("Preserve config while refining system message");
    await diff
      .getByRole("button", { name: "Accept & save version", exact: true })
      .click();
    await expect(diff).toHaveCount(0);
    expect(savedContent).toMatchObject({ config: latestContent.config });
    await expect(
      surface.getByRole("button", { name: "New version", exact: true }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/edit=true/);
    await page.reload();
    await expect(config).toContainText('"modelName": "accurate"');
    const response = await request.get(
      `${apiUrl}/v1/studio/prompts/assets/${draftId}`,
      {
        headers: {
          authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY}`,
        },
      },
    );
    const result = await response.json();
    expect(result.draft).toBeNull();
    expect(
      result.versions.find((v: { version: number }) => v.version === 3).content
        .config,
    ).toEqual(latestContent.config);
    expect(
      result.versions.find((v: { version: number }) => v.version === 1).content
        .config,
    ).toEqual({});
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "../../docs/qa/studio-prompts/saved-draft-version.png",
    });
    await page.goBack();
    await expect(
      page.getByRole("button", { name: "Save version", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New version", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open draft in history" }),
    ).toHaveCount(0);
  });

  test("confirms deletion of clean, dirty and invalid drafts", async ({
    page,
    request,
  }) => {
    await openPrompt(page);
    const drawer = promptDrawer(page);
    await drawer
      .getByRole("button", { name: "New version", exact: true })
      .click();
    await requestDeleteDraft(page, drawer);
    await page
      .getByRole("dialog", { name: "Delete draft?" })
      .getByRole("button", { name: "Delete draft", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Delete draft?" }),
    ).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "New version", exact: true }),
    ).toBeVisible();

    await drawer
      .getByRole("button", { name: "New version", exact: true })
      .click();
    await drawer
      .getByLabel("System Message")
      .filter({ visible: true })
      .fill("Temporary draft to discard");
    await requestDeleteDraft(page, drawer);
    const confirmation = page.getByRole("dialog", { name: "Delete draft?" });
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByRole("button", { name: "Keep draft" }),
    ).toBeFocused();
    await confirmation.getByRole("button", { name: "Keep draft" }).click();
    await expect(
      drawer.getByLabel("System Message").filter({ visible: true }),
    ).toHaveText("Temporary draft to discard");
    await requestDeleteDraft(page, drawer);
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(drawer).toBeVisible();
    // Invalid JSON lives inside the field, so it must count as dirty too.
    await drawer
      .getByLabel("Configuration", { exact: true })
      .filter({ visible: true })
      .fill("{");
    await expect(
      drawer.getByRole("button", { name: "Save version" }),
    ).toBeDisabled();
    await requestDeleteDraft(page, drawer);
    await confirmation
      .getByRole("button", { name: "Delete draft", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "New version", exact: true }),
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
    await drawer
      .getByRole("button", { name: "New version", exact: true })
      .click();
    await expect(
      drawer.getByLabel("System Message").filter({ visible: true }),
    ).toHaveText(
      "Classify requests as support or sales. Pricing requests are sales.",
    );
    await expect(
      drawer
        .getByLabel("Configuration", { exact: true })
        .filter({ visible: true }),
    ).toHaveText("{}");
    // Invalid-only changes cannot bypass confirmation when content is unchanged.
    await drawer
      .getByLabel("Configuration", { exact: true })
      .filter({ visible: true })
      .fill("{");
    await requestDeleteDraft(page, drawer);
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole("button", { name: "Delete draft", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
  });

  test("waits for an in-flight autosave before discarding and does not recreate the draft", async ({
    page,
    request,
  }) => {
    await openPrompt(page);
    const drawer = promptDrawer(page);
    await drawer
      .getByRole("button", { name: "New version", exact: true })
      .click();
    await expect(
      drawer.getByRole("button", { name: "Save version", exact: true }),
    ).toBeEnabled();
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
      .filter({ visible: true })
      .fill("In-flight draft to discard");
    await expect.poll(() => saving).toBe(true);
    await requestDeleteDraft(page, drawer);
    const confirmation = page.getByRole("dialog", { name: "Delete draft?" });
    await confirmation
      .getByRole("button", { name: "Delete draft", exact: true })
      .click();
    await expect(
      confirmation.getByRole("button", { name: "Deleting…" }),
    ).toBeDisabled();
    release();
    await expect(confirmation).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "New version", exact: true }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/edit=true/);
    await page.reload();
    // A direct reload opens the routed page rather than an intercepted drawer.
    await expect(
      page.getByRole("button", { name: "New version", exact: true }),
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
      page
        .getByLabel("User Message")
        .filter({ visible: true })
        .locator("[data-template-variable]"),
    ).toHaveText("{{message}}");
    await expect(page.getByText("Message format", { exact: true })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "New version", exact: true })
      .click();
    const system = page.getByLabel("System Message").filter({ visible: true });
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
    await expect(page.getByText(/Based on v1 · Draft saved/)).toBeVisible();
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
      page.getByRole("button", { name: "New version", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByLabel("System Message")
        .filter({ visible: true })
        .locator("[data-prompt-reference]"),
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
    await page.goto(`/prompts/${conflictId}`);
    await page
      .getByRole("button", { name: "New version", exact: true })
      .click();
    const user = page.getByLabel("User Message").filter({ visible: true });
    await user.fill("");
    await user.pressSequentially("#E2E prompt drawer@Latest");
    await expect(
      page.getByRole("listbox", { name: "Include a prompt" }),
    ).toBeVisible();
    await user.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save version", exact: true }),
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
    await page.goto(`/prompts/${result.id}`);
    await page
      .getByRole("button", { name: "New version", exact: true })
      .click();
    const system = page.getByLabel("System Message").filter({ visible: true });
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
    await expect(
      surface.getByLabel("System Message").filter({ visible: true }),
    ).toHaveText(content.messages[0].content);
    await expect
      .poll(async () => {
        const field = await surface
          .getByLabel("System Message")
          .filter({ visible: true })
          .boundingBox();
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
      await groupInspector(page);
      await expect(inspector(page)).toHaveCount(1);
      await expectCenteredInspectorClose(page);
      await expect
        .poll(async () => {
          const field = await promptDrawer(page)
            .getByLabel("System Message")
            .filter({ visible: true })
            .boundingBox();
          const nested = await inspector(page).boundingBox();
          return (field?.x ?? 0) + (field?.width ?? 0) - (nested?.x ?? 0);
        })
        .toBeLessThanOrEqual(0);
      await expect(
        promptDrawer(page).getByRole("button", {
          name: /^Version history(?: · v2)?$/,
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
      await groupInspector(page);
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
    await groupInspector(page);
    await expect(page).toHaveURL(/promptAction=group/);
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
    await groupInspector(page);
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
    await expect(
      promptDrawer(page).getByLabel("System Message").filter({ visible: true }),
    ).toHaveText(content.messages[0].content);
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
  test("keeps history visible while opening inspectors from an expanded prompt page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/prompts/${id}?detailView=expanded&v=2`);
    const history = page.locator("[data-prompt-version-history]");
    await expect(history).toBeVisible();
    await groupInspector(page);
    await expect(inspector(page)).toBeVisible();
    await expect(history).toBeVisible();
    await expect(
      history.getByRole("button", { name: "Version 2 actions", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(inspector(page)).toHaveCount(0);
    await expect(history).toBeVisible();
    await expect(page).toHaveURL(/v=2/);
    await page.setViewportSize({ width: 1024, height: 800 });
    await groupInspector(page);
    await expect(page.locator("[data-prompt-version-picker]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(inspector(page)).toHaveCount(0);
  });

  test("saves promotion policies independently for each prompt", async ({
    page,
    request,
  }) => {
    const created: string[] = [];
    const openPolicy = async (promptId: string) => {
      await page.goto(`/prompts/${promptId}`);
      await page
        .getByRole("button", { name: "Prompt actions", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Promotion policy", exact: true })
        .click();
      await expect(policyModal(page)).toBeVisible();
      await expect(policyModal(page)).toContainText(
        "Other prompts keep their own policies.",
      );
    };
    const save = async () => {
      await policyModal(page)
        .getByRole("button", { name: "Save policy", exact: true })
        .click();
      await expect(policyModal(page)).toHaveCount(0);
    };
    try {
      for (const name of [
        "First independent policy",
        "Second independent policy",
      ]) {
        const result = await action(request, {
          action: "create",
          key: `${fixtureKey}-policy-${randomUUID()}`,
          name,
          categoryId,
          content,
          note: "Initial",
        });
        created.push(result.id);
      }
      const first = created[0]!,
        second = created[1]!;
      await page.goto("/prompts");
      await page
        .getByRole("button", {
          name: "Actions for First independent policy",
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitem", { name: "Promotion policy", exact: true })
        .click();
      await expect(policyModal(page)).toContainText(
        "Other prompts keep their own policies.",
      );
      await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
      await expect(inspector(page)).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe("/prompts");
      await policyModal(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Actions for First independent policy",
          exact: true,
        }),
      ).toBeFocused();
      await page
        .getByRole("button", {
          name: "Actions for First independent policy",
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitem", { name: "Promotion policy", exact: true })
        .click();
      await expect(policyModal(page)).toBeVisible();
      await page.goBack();
      await expect(policyModal(page)).toHaveCount(0);
      await page.goForward();
      await expect(policyModal(page)).toBeVisible();
      for (const width of [768, 390]) {
        await page.setViewportSize({ width, height: 800 });
        await noOverflow(policyModal(page));
        const box = await policyModal(page).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await expect(
          policyModal(page).getByRole("button", {
            name: "Save policy",
            exact: true,
          }),
        ).toBeInViewport();
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await policyModal(page)
        .getByLabel("Require a passing full suite with verified prompt usage")
        .uncheck();
      await policyModal(page).getByLabel("Independent human reviews").fill("2");
      await policyModal(page)
        .getByLabel("Allow explicit, audited exceptions")
        .uncheck();
      await save();
      await openPolicy(second);
      await expect(
        policyModal(page).getByLabel(
          "Require a passing full suite with verified prompt usage",
        ),
      ).toBeChecked();
      await expect(
        policyModal(page).getByLabel("Independent human reviews"),
      ).toHaveValue("0");
      await expect(
        policyModal(page).getByLabel("Allow explicit, audited exceptions"),
      ).toBeChecked();
      await policyModal(page).getByLabel("Independent human reviews").fill("1");
      await save();
      await openPolicy(first);
      await expect(
        policyModal(page).getByLabel(
          "Require a passing full suite with verified prompt usage",
        ),
      ).not.toBeChecked();
      await expect(
        policyModal(page).getByLabel("Independent human reviews"),
      ).toHaveValue("2");
      await expect(
        policyModal(page).getByLabel("Allow explicit, audited exceptions"),
      ).not.toBeChecked();
      await policyModal(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await page.getByRole("button", { name: /^activity$/i }).click();
      await expect(page.getByText("policy", { exact: true })).toBeVisible();
      await page.goto("/prompts");
      await page
        .getByRole("link", { name: "First independent policy", exact: true })
        .click();
      const drawer = page.locator(`[data-detail-drawer="/prompts/${first}"]`);
      await expect(drawer).toBeVisible();
      await drawer
        .getByRole("button", { name: "Prompt actions", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Promotion policy", exact: true })
        .click();
      await expect(
        policyModal(page).getByLabel("Independent human reviews"),
      ).toHaveValue("2");
      await expect(inspector(page)).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(policyModal(page)).toHaveCount(0);
      await expect(drawer).toHaveAttribute("data-state", "open");
      await expect(
        drawer.getByRole("button", { name: "Prompt actions", exact: true }),
      ).toBeFocused();
    } finally {
      const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
      try {
        for (const promptId of created)
          await sql`DELETE FROM prompt_assets WHERE id=${promptId}`;
      } finally {
        await sql.end();
      }
    }
  });

  test("promotes and rolls back live in a modal independently of manual tags", async ({
    page,
    request,
  }) => {
    const key = `${fixtureKey}-tags-${randomUUID()}`;
    const created = await action(request, {
      action: "create",
      key,
      name: "E2E live tags",
      categoryId,
      content,
      note: "Initial",
    });
    const candidate = { ...content, config: { mode: "candidate" } };
    try {
      await action(request, {
        action: "save",
        id: created.id,
        content: candidate,
        baseVersion: 1,
        expectedHash: await promptHash(candidate),
        note: "Candidate",
        idempotencyKey: randomUUID(),
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/prompts/${created.id}?v=2`);
      const versionMenu = async (version: number) => {
        await page
          .getByRole("button", {
            name: `Version ${version} actions`,
            exact: true,
          })
          .click();
        await expect(page.getByRole("menuitem").first()).toHaveText(
          "Make this live",
        );
      };
      await versionMenu(2);
      await page
        .getByRole("menuitem", { name: "Manage tags", exact: true })
        .click();
      const tags = page.getByRole("dialog", {
        name: "Manage tags",
        exact: true,
      });
      await tags.getByLabel("Tag name", { exact: true }).fill("staging");
      await tags
        .getByRole("button", { name: "Assign tag", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const source = studioPromptSource({
        apiUrl,
        apiKey: process.env.KORTYX_TELEMETRY_API_KEY!,
        tag: "staging",
      });
      expect(
        (await source.resolve([key], { environment: "production" })).versions[
          key
        ]?.version,
      ).toBe(2);
      const makeLive = async (version: number, rollback: boolean) => {
        await versionMenu(version);
        await page
          .getByRole("menuitem", { name: "Make this live", exact: true })
          .click();
        const modal = page.getByRole("dialog", {
          name: rollback ? "Roll back version" : "Promote version",
          exact: true,
        });
        await expect(modal).toBeVisible();
        await expect(modal.locator("[data-detail-inspector]")).toHaveCount(0);
        await expect(
          modal.getByText("Destination environment", { exact: true }),
        ).toHaveCount(0);
        await modal
          .getByRole("checkbox", {
            name: "Request an audited policy exception",
          })
          .check();
        await modal
          .getByLabel("Exception reason", { exact: true })
          .fill("Disposable end-to-end release verification");
        await modal
          .getByRole("button", {
            name: `${rollback ? "Roll back to" : "Promote"} v${version}`,
            exact: true,
          })
          .click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
      };
      await makeLive(2, false);
      await makeLive(1, true);
      const liveSource = studioPromptSource({
        apiUrl,
        apiKey: process.env.KORTYX_TELEMETRY_API_KEY!,
      });
      expect(
        (await liveSource.resolve([key], { environment: "production" }))
          .versions[key]?.version,
      ).toBe(1);
      expect(
        (await source.resolve([key], { environment: "production" })).versions[
          key
        ]?.version,
      ).toBe(2);
      await versionMenu(2);
      await page
        .getByRole("menuitem", { name: "Manage tags", exact: true })
        .click();
      await tags
        .getByRole("button", { name: "Remove tag staging", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Remove tag?", exact: true })
        .getByRole("button", { name: "Remove tag", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        source.resolve([key], { environment: "production" }),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        (await liveSource.resolve([key], { environment: "production" }))
          .versions[key]?.version,
      ).toBe(1);
    } finally {
      const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
      try {
        await sql`delete from prompt_assets where key=${key}`;
      } finally {
        await sql.end();
      }
    }
  });
});
