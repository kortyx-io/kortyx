import { expect, test } from "@playwright/test";
import { OUTPUT_SUITE } from "./support/eval-output-plan";
import { EVAL_FIXTURE, EVAL_SUITE } from "./support/eval-plan";

test("shows assessed mixed outcomes and reruns the failed case as a fresh evaluation", async ({
  page,
}, testInfo) => {
  let fullResultReads = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname ===
      `/api/studio/evals/runs/${EVAL_FIXTURE.repeatedCandidate}`
    )
      fullResultReads++;
  });
  await page.goto(`/evals/runs/${EVAL_FIXTURE.repeatedCandidate}`);
  const original = await (
    await page.request.get(
      `/api/studio/evals/runs/${EVAL_FIXTURE.repeatedCandidate}`,
    )
  ).json();
  const rows = page.locator('[data-row-key="repeated-role"]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Mixed results");
  await expect(rows.first()).toContainText("1 of 2 passed");
  await rows
    .first()
    .getByRole("button", { name: "About Mixed results" })
    .click();
  await expect(
    page.getByText("A finished case has at least one assessed pass", {
      exact: false,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(fullResultReads).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("mixed-results.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Rerun failed cases", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Run evaluations" });
  await expect(drawer).toBeVisible();
  // Live case summaries already contain failed-case identities; no full result fetch.
  expect(fullResultReads).toBe(0);
  await expect(
    drawer.getByText(
      "This creates a new run using current deployed suite definitions",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    drawer.getByRole("spinbutton", { name: "Repetitions per conversation" }),
  ).toHaveValue("2");
  const conversations = drawer.getByRole("group", {
    name: `Conversations in ${EVAL_SUITE.name}`,
    exact: true,
  });
  await expect(
    conversations.getByRole("checkbox", { name: "Repeated role", exact: true }),
  ).toBeChecked();
  await expect(
    conversations.getByRole("checkbox", {
      name: "Ambiguous role",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    drawer.getByText("1 suites · 1 conversations · 2 executions", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("launchRerun") === "true",
  );
  await page.screenshot({
    path: testInfo.outputPath("rerun-failed-cases.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await expect(
    conversations.getByRole("checkbox", { name: "Repeated role", exact: true }),
  ).toBeChecked();
  await drawer
    .getByRole("button", { name: "Run evaluations", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) => /^\/evals\/evaluations\/[0-9a-f-]+$/.test(url.pathname),
    { timeout: 20000 },
  );
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/studio/evals/evaluations/${id}`)
          ).json()
        ).run.status,
    )
    .toBe("passed");
  const { run } = await (
    await page.request.get(`/api/studio/evals/evaluations/${id}/results`)
  ).json();
  expect(run.suites).toHaveLength(1);
  expect(run.suites[0].request.caseIds).toEqual(["repeated-role"]);
  expect(run.suites[0].result.cases).toHaveLength(2);
  expect(run.suites[0].result.cases[0].steps[0].checks[0]).toMatchObject({
    passed: true,
    check: { type: "text-contains" },
  });
  expect(run.suites[0].result.cases[0].steps[0].checks[1]).toMatchObject({
    passed: true,
    check: { type: "text-equals", ignoreCase: true },
  });
  const after = await (
    await page.request.get(
      `/api/studio/evals/runs/${EVAL_FIXTURE.repeatedCandidate}`,
    )
  ).json();
  expect(after.run.result).toEqual(original.run.result);
  await page.getByRole("button", { name: /^E2E job conversations/ }).click();
  await expect(page.getByText("Mixed results", { exact: true })).toHaveCount(0);
  await page
    .getByRole("link", { name: "Repeated role", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Assessment details", exact: true })
    .click();
  const checks = page.locator('[data-guide-focus="eval-checks"]').first();
  await expect(checks).toContainText("Passed");
  await expect(checks).toContainText('Answer contains "Software Engineer"');
  await expect(checks).toContainText(
    'Answer equals "software engineer role description" (ignoring case)',
  );
  await page.setViewportSize({ width: 760, height: 900 });
  await page.reload();
  await expect(checks).toBeVisible();
  await expect(checks).toContainText("Passed");
  await page.screenshot({
    path: testInfo.outputPath("deterministic-checks.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("renders completed-output check verdicts and prepares grouped failures without selecting passing cases", async ({
  page,
}, testInfo) => {
  await page.goto(`/evals/suites/${EVAL_FIXTURE.targetId}/${OUTPUT_SUITE.id}`);
  await expect(page.locator("[data-row-key]")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Product list version two", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Automatic checks", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Close conversation definition" })
    .click();
  await page.getByRole("button", { name: "Run suite", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Run evaluations" });
  await drawer
    .getByRole("button", { name: "Run evaluations", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) => /^\/evals\/evaluations\/[0-9a-f-]+$/.test(url.pathname),
    { timeout: 20000 },
  );
  const path = new URL(page.url()).pathname;
  const id = path.split("/").at(-1)!;
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/studio/evals/evaluations/${id}`)
          ).json()
        ).run.status,
    )
    .toBe("failed");
  await page
    .getByRole("button", { name: "Rerun failed cases", exact: true })
    .click();
  const selected = drawer.getByRole("group", {
    name: `Conversations in ${OUTPUT_SUITE.name}`,
    exact: true,
  });
  await expect(
    selected.getByRole("checkbox", {
      name: "Obsolete product list contract",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    selected.getByRole("checkbox", {
      name: "Receipt was never returned",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    selected.getByRole("checkbox", {
      name: "Unfinished product list",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    selected.getByRole("checkbox", {
      name: "Product list version two",
      exact: true,
    }),
  ).not.toBeChecked();
  await page.goto(path);
  await page.getByRole("button", { name: /^Product output contracts/ }).click();
  await expect(page).toHaveURL((url) =>
    Boolean(url.searchParams.get("suiteRun")),
  );
  await page
    .getByRole("button", { name: "Rerun failed cases", exact: true })
    .click();
  await expect(drawer).toHaveCount(1);
  await expect(drawer).toBeVisible();
  await expect(
    selected.getByRole("checkbox", {
      name: "Obsolete product list contract",
      exact: true,
    }),
  ).toBeChecked();
  await page.reload();
  await expect(drawer).toHaveCount(1);
  await expect(drawer).toBeVisible();
  await drawer
    .getByRole("button", { name: "Close run setup", exact: true })
    .click();

  await page
    .getByRole("link", {
      name: "Obsolete product list contract",
      exact: true,
    })
    .click();
  const checks = page.locator('[data-guide-focus="eval-checks"]').first();
  await expect(checks).toContainText("Failed");
  await expect(checks).toContainText(
    "No matching completed structured output contains the expected value",
  );
  await expect(
    checks.getByRole("button", {
      name: "Check definition and evidence",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("failed-output-check.png"),
    fullPage: true,
    animations: "disabled",
  });
});
