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
  await expect(
    page.getByText("Evaluation timed out after 30m", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/63 of 107 attempts have recorded outcomes/),
  ).toBeVisible();
  await expect(page.getByText(/36 not started/)).toBeVisible();
  await expect(page.getByText("Timed out", { exact: true })).toHaveCount(5);
  await expect(
    page.getByText("6 affected attempts", { exact: true }),
  ).toBeVisible();
  await capture(page, "evaluation-timeout");
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
    await page.getByLabel("Evaluation timeout (minutes)").fill("45");
    await page.getByLabel("Concurrent attempts across suites").fill("2");
    await page
      .getByRole("button", { name: "Save evaluation defaults" })
      .click();
    await expect(
      page.getByText("Evaluation defaults saved.", { exact: true }),
    ).toBeVisible();
    await capture(page, "project-evaluation-defaults");
    await page.goto(
      `/evals/runs?launch=true&launchApplication=${EVAL_FIXTURE.targetId}`,
    );
    await expect(page.getByLabel("Evaluation timeout (minutes)")).toHaveValue(
      "45",
    );
    await expect(
      page.getByLabel("Concurrent attempts across suites"),
    ).toHaveValue("2");
    await page.getByLabel("Evaluation timeout (minutes)").fill("90");
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
