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
  await expect(promptDrawer(page).getByLabel("System Message")).toHaveText(
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
            name: "Version history · v1",
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
    await page
      .getByRole("button", { name: "Edit as draft", exact: true })
      .click();
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
      page.getByRole("button", { name: "Edit as draft", exact: true }),
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
      page.getByRole("button", { name: "Close editor", exact: true }),
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
      await renameInspector(page);
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
      await renameInspector(page);
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
