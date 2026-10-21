import { expect, test } from "@playwright/test";
import { EVAL_FIXTURE } from "./support/eval-plan";
import {
  EVAL_SETTINGS_FIXTURE,
  seedEvalSettingsFixture,
} from "./support/eval-settings-fixture";

const capture = async (page: import("@playwright/test").Page, name: string) => {
  if (process.env.KORTYX_CAPTURE_SCREENSHOTS === "1")
    await page.screenshot({
      path: `${process.env.KORTYX_SCREENSHOT_DIR ?? "/tmp/kortyx-eval-settings-screenshots"}/${name}.png`,
      fullPage: true,
    });
};
test("shows the evaluation timeout and incomplete work without investigation", async ({
  page,
}) => {
  await seedEvalSettingsFixture();
  await page.goto(`/evals/evaluations/${EVAL_SETTINGS_FIXTURE.id}`);
  const timeout = page.getByRole("button", {
    name: /Timed out after 30m · 44 unfinished attempts/,
  });
  const errors = page.getByRole("button", {
    name: /OpenRouter returned HTTP 429.*6 errors/,
  });
  await expect(timeout).toBeVisible();
  await expect(errors).toBeVisible();
  const table = page.getByRole("table").first();
  await expect(table).toBeVisible();
  expect((await table.boundingBox())!.y).toBeLessThan(400);
  await capture(page, "evaluation-timeout");
  await timeout.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(/63 of 107 attempts have recorded outcomes/),
  ).toBeVisible();
  await expect(dialog.getByText(/36 not started/)).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.has("error"))
    .toBe(true);
  const timeoutBounds = await dialog.boundingBox();
  await capture(page, "timeout-error-dialog");
  await page.keyboard.press("Escape");
  await expect(timeout).toBeFocused();
  await errors.click();
  await expect(
    dialog.getByRole("heading", { name: "Stack trace" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Caused by" }),
  ).toBeVisible();
  const occurrences = dialog
    .getByRole("navigation", { name: "Error occurrences" })
    .getByRole("button");
  await expect(occurrences).toHaveCount(7);
  const firstSelection = new URL(page.url()).searchParams.get("error");
  const firstBounds = await dialog.boundingBox();
  expect(firstBounds?.height).toBe(timeoutBounds?.height);
  await occurrences.last().click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("error"))
    .not.toBe(firstSelection);
  await expect(
    dialog.getByRole("link", { name: "View affected execution" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Stack trace" }),
  ).toBeVisible();
  const lastSelection = new URL(page.url()).searchParams.get("error");
  expect((await dialog.boundingBox())?.height).toBe(firstBounds?.height);
  await page.goBack();
  await expect(occurrences.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(
    dialog.getByRole("heading", { name: "Stack trace" }),
  ).toBeVisible();
  await page.goForward();
  await expect(occurrences.last()).toHaveAttribute("aria-current", "true");
  await expect(
    dialog.getByRole("heading", { name: "Stack trace" }),
  ).toBeVisible();
  expect((await dialog.boundingBox())?.height).toBe(firstBounds?.height);
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(occurrences.last()).toHaveAttribute("aria-current", "true");
  await expect(
    dialog.getByRole("heading", { name: "Stack trace" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("error")).toBe(lastSelection);
  await capture(page, "evaluation-error-dialog");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => new URL(page.url()).searchParams.has("error"))
    .toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await errors.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});
test("shows original provider errors, stacks, causes and response details automatically", async ({
  page,
}) => {
  await seedEvalSettingsFixture();
  await page.goto(`/evals/cases/${EVAL_SETTINGS_FIXTURE.errorSuite}/case-0/1`);
  await expect(
    page
      .getByText(
        "OpenRouter returned HTTP 429: Rate limit exceeded for the evaluation model.",
        { exact: true },
      )
      .last(),
  ).toBeVisible();
  await expect(page.getByText("Caused by", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Provider concurrency quota exceeded/).first(),
  ).toBeVisible();
  await capture(page, "original-error-details");
});
test("saves project defaults and submits only settings explicitly changed for a run", async ({
  page,
  request,
}) => {
  const original = await (
    await request.get("/api/studio/evals/settings")
  ).json();
  const headers = {
    origin: new URL(
      page.url() === "about:blank"
        ? (process.env.KORTYX_E2E_STUDIO_URL ?? "http://localhost:6300")
        : page.url(),
    ).origin,
    "x-kortyx-eval": "1",
  };
  try {
    await page.goto("/settings/evaluations");
    await page
      .getByLabel("Evaluation timeout (minutes)", { exact: true })
      .fill("45");
    await page
      .getByLabel("Concurrent attempts across suites", { exact: true })
      .fill("2");
    await page
      .getByRole("button", { name: "Save evaluation defaults" })
      .click();
    await expect(
      page.getByText("Evaluation defaults saved.", { exact: true }),
    ).toBeVisible();
    const save = await page
      .getByRole("button", { name: "Save evaluation defaults" })
      .boundingBox();
    const configuration = await page
      .getByText("Evaluation configuration", { exact: true })
      .boundingBox();
    expect(configuration!.y - (save!.y + save!.height)).toBeGreaterThan(40);
    await capture(page, "project-evaluation-defaults");
    await page.goto(
      `/evals/runs?launch=true&launchApplication=${EVAL_FIXTURE.targetId}`,
    );
    await expect(
      page.getByLabel("Evaluation timeout (minutes)", { exact: true }),
    ).toHaveValue("45");
    await expect(
      page.getByLabel("Concurrent attempts across suites", { exact: true }),
    ).toHaveValue("2");
    await page
      .getByRole("dialog")
      .getByText("Execution settings", { exact: true })
      .click();
    await page
      .getByLabel("Evaluation timeout (minutes)", { exact: true })
      .fill("90");
    await capture(page, "run-setting-overrides");
    let submitted: Record<string, unknown> | undefined;
    await page.route("**/api/studio/evals/evaluations", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitted = route.request().postDataJSON();
      await route.fulfill({
        json: { id: EVAL_SETTINGS_FIXTURE.id },
        status: 202,
      });
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Run evaluations", exact: true })
      .click();
    await expect.poll(() => submitted?.runTimeoutMs).toBe(5_400_000);
    expect(submitted).not.toHaveProperty("concurrency");
    expect(submitted).not.toHaveProperty("repetitions");
    expect(submitted).not.toHaveProperty("caseTimeoutMs");
  } finally {
    await request.post("/api/studio/evals/settings", {
      data: original.defaults,
      headers,
    });
  }
});

test("allows a run override to satisfy an application ceiling below the project default", async ({
  page,
  request,
}) => {
  const original = await (
    await request.get("/api/studio/evals/settings")
  ).json();
  const headers = {
    origin: new URL(
      process.env.KORTYX_E2E_STUDIO_URL ?? "http://localhost:6300",
    ).origin,
    "x-kortyx-eval": "1",
  };
  try {
    await request.post("/api/studio/evals/settings", {
      data: { ...original.defaults, concurrency: 2 },
      headers,
    });
    await page.route("**/api/studio/evals/targets", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      const target = data.targets.find(
        (item: { id: string }) => item.id === EVAL_FIXTURE.targetId,
      );
      target.manifest.execution.limits = { concurrency: 1 };
      await route.fulfill({ response, json: data });
    });
    await page.goto("/evals/runs");
    await page
      .getByRole("button", { name: "Refresh evaluations", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Run evaluations", exact: true })
      .click();
    const drawer = page.getByRole("dialog");
    await drawer.getByText("Execution settings", { exact: true }).click();
    const start = drawer.getByRole("button", {
      name: "Run evaluations",
      exact: true,
    });
    await expect(
      page.getByLabel("Concurrent attempts across suites", { exact: true }),
    ).toHaveValue("2");
    await expect(
      page.getByText("concurrency exceeds the application maximum of 1.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(start).toBeDisabled();
    await page
      .getByLabel("Concurrent attempts across suites", { exact: true })
      .fill("1");
    await expect(start).toBeEnabled();
    let submitted: Record<string, unknown> | undefined;
    await page.route("**/api/studio/evals/evaluations", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitted = route.request().postDataJSON();
      await route.fulfill({
        status: 202,
        json: { id: EVAL_SETTINGS_FIXTURE.id },
      });
    });
    await start.click();
    await expect.poll(() => submitted?.concurrency).toBe(1);
  } finally {
    await request.post("/api/studio/evals/settings", {
      data: original.defaults,
      headers,
    });
  }
});
