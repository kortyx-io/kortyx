import { expect, test } from "@playwright/test";
import { EVAL_OPAQUE_SUITE, EVAL_SUITE } from "./support/eval-plan";

for (const scope of ["all", "selected"] as const) {
  test(`launches ${scope} suites as one evaluation and drills into suite results`, async ({
    page,
  }) => {
    await page.goto("/evals/runs");
    await page
      .getByRole("button", { name: "Run evaluations", exact: true })
      .click();
    const drawer = page.getByRole("dialog", { name: "Run evaluations" });
    await expect(
      drawer.getByRole("button", { name: "Judge", exact: true }),
    ).toContainText("App judge");
    await expect
      .poll(() =>
        drawer.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            right: window.innerWidth - rect.right,
            bottom: window.innerHeight - rect.bottom,
          };
        }),
      )
      .toEqual({ right: 4, bottom: 4 });
    await expect(
      drawer.getByRole("radio", { name: "All suites (3)", exact: true }),
    ).toBeChecked();
    await expect(
      drawer.getByRole("button", { name: "Review conversation definitions" }),
    ).toHaveCount(0);
    if (scope === "selected") {
      await drawer
        .getByRole("radio", { name: "Selected suites", exact: true })
        .check();
      await expect(
        drawer.getByRole("button", { name: "Run evaluations", exact: true }),
      ).toBeDisabled();
      await drawer
        .getByRole("checkbox", { name: /E2E job conversations/ })
        .check();
      await drawer
        .getByRole("button", { name: `Expand ${EVAL_SUITE.name}`, exact: true })
        .click();
      await expect(
        drawer.getByRole("group", {
          name: `Conversations in ${EVAL_SUITE.name}`,
          exact: true,
        }),
      ).toBeVisible();
      await drawer
        .getByRole("checkbox", { name: /Opaque suite identifiers/ })
        .check();
      await expect(
        drawer.getByRole("group", {
          name: `Conversations in ${EVAL_SUITE.name}`,
          exact: true,
        }),
      ).toBeVisible();
      await page.reload();
      await expect(
        drawer.getByRole("checkbox", { name: /Opaque suite identifiers/ }),
      ).toBeChecked();
    }
    await drawer.getByRole("button", { name: "Judge", exact: true }).click();
    await expect(
      page.getByRole("menuitemradio", { name: /Studio judge/ }),
    ).toBeDisabled();
    await page
      .getByRole("menuitemradio", { name: "App judge", exact: true })
      .click();
    await drawer
      .getByRole("button", { name: "Run evaluations", exact: true })
      .click();
    await expect(page).toHaveURL(/\/evals\/evaluations\/[0-9a-f-]+$/);
    const parentPath = new URL(page.url()).pathname;
    const suiteCount = scope === "all" ? 3 : 2;
    await expect(page.locator("[data-row-key]")).toHaveCount(suiteCount);
    await expect(
      page.getByRole("button", { name: EVAL_OPAQUE_SUITE.name!, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${suiteCount}/${suiteCount}`, { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await page.reload();
    await page
      .getByRole("button", { name: EVAL_SUITE.name!, exact: true })
      .click();
    await expect(page).toHaveURL(/\/evals\/runs\/[0-9a-f-]+$/);

    await page
      .getByRole("button", { name: "Ambiguous role", exact: true })
      .click();
    await expect(page.getByText("Step 1 evaluation")).toBeVisible();
    await page.goto(parentPath);
    await page
      .getByRole("button", { name: "Back to evaluation runs", exact: true })
      .click();
    const id = parentPath.split("/").at(-1)!;
    await expect(page.locator(`[data-row-key="${id}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-row-key="${id}"]`)).toContainText(
      `${suiteCount} suites`,
    );
    await page.locator(`[data-row-key="${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(parentPath));
  });
}

test("selects conversations independently across suites and persists mixed checkbox states", async ({
  page,
}) => {
  await page.goto("/evals/runs");
  await page
    .getByRole("button", { name: "Run evaluations", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Run evaluations" });
  await drawer
    .getByRole("radio", { name: "Selected suites", exact: true })
    .check();
  for (const suite of [EVAL_SUITE, EVAL_OPAQUE_SUITE]) {
    await drawer
      .getByRole("button", { name: `Expand ${suite.name}`, exact: true })
      .click();
    const conversations = drawer.getByRole("group", {
      name: `Conversations in ${suite.name}`,
      exact: true,
    });
    await conversations
      .getByRole("checkbox", { name: "Ambiguous role", exact: true })
      .check();
    await expect(
      drawer.getByRole("checkbox", {
        name: `Select all conversations in ${suite.name}`,
        exact: true,
      }),
    ).toBeChecked({ indeterminate: true });
  }
  const firstSuite = drawer.getByRole("checkbox", {
    name: `Select all conversations in ${EVAL_SUITE.name}`,
    exact: true,
  });
  await firstSuite.check();
  await expect(
    drawer
      .getByRole("group", {
        name: `Conversations in ${EVAL_SUITE.name}`,
        exact: true,
      })
      .getByRole("checkbox"),
  ).toHaveCount(8);
  await expect(
    drawer.getByText("8 of 8 conversations selected", { exact: true }),
  ).toBeVisible();
  await firstSuite.uncheck();
  await expect(
    drawer.getByText("0 of 8 conversations selected", { exact: true }),
  ).toBeVisible();
  await drawer
    .getByRole("group", {
      name: `Conversations in ${EVAL_SUITE.name}`,
      exact: true,
    })
    .getByRole("checkbox", { name: "Ambiguous role", exact: true })
    .check();
  await expect(firstSuite).toBeChecked({ indeterminate: true });
  await expect(page).toHaveURL((url) => {
    const selections = JSON.parse(
      url.searchParams.get("launchSuiteCases") ?? "[]",
    );
    return (
      selections.length === 2 &&
      selections.every(
        (item: { caseIds: string[] }) => item.caseIds.length === 1,
      )
    );
  });
  await page.reload();
  for (const suite of [EVAL_SUITE, EVAL_OPAQUE_SUITE]) {
    await expect(
      drawer.getByRole("checkbox", {
        name: `Select all conversations in ${suite.name}`,
        exact: true,
      }),
    ).toBeChecked({ indeterminate: true });
    await expect(
      drawer
        .getByRole("group", {
          name: `Conversations in ${suite.name}`,
          exact: true,
        })
        .getByRole("checkbox", { name: "Ambiguous role", exact: true }),
    ).toBeChecked();
  }
  await expect(
    drawer.getByText("2 suites · 2 conversations · 2 attempts", {
      exact: true,
    }),
  ).toBeVisible();
  await drawer
    .getByRole("button", { name: "Run evaluations", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) => /^\/evals\/evaluations\/[0-9a-f-]+$/.test(url.pathname),
    { timeout: 15000 },
  );
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/studio/evals/evaluations/${id}`)
          ).json()
        ).run.completedAttempts,
    )
    .toBe(2);
  const { run } = await (
    await page.request.get(`/api/studio/evals/evaluations/${id}/results`)
  ).json();
  expect(run.suites).toHaveLength(2);
  for (const suite of run.suites)
    expect(
      suite.result.cases.map((item: { caseId: string }) => item.caseId),
    ).toEqual(["ambiguity"]);
});

test("defaults to an available judge and permits switching back when both are available", async ({
  page,
}) => {
  await page.route("**/api/studio/evals/targets", async (route) => {
    const payload = await (await route.fetch()).json();
    const original = payload.targets[0];
    await route.fulfill({
      json: {
        ...payload,
        studioJudge: { id: "fixture-studio", version: "1" },
        targets: [
          original,
          {
            ...original,
            id: "app-only-demo",
            name: "App-only demo",
            manifest: { ...original.manifest, studioJudging: undefined },
          },
          {
            ...original,
            id: "no-judge-demo",
            name: "No-judge demo",
            manifest: {
              ...original.manifest,
              studioJudging: undefined,
              judge: undefined,
            },
          },
        ],
      },
    });
  });
  await page.goto("/evals/runs");
  await Promise.all([
    page.waitForResponse("**/api/studio/evals/targets"),
    page
      .getByRole("button", { name: "Refresh evaluations", exact: true })
      .click(),
  ]);
  await page
    .getByRole("button", { name: "Run evaluations", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Run evaluations" });
  const judge = drawer.getByRole("button", { name: "Judge", exact: true });
  await expect(judge).toContainText("Studio judge");
  await judge.click();
  await page
    .getByRole("menuitemradio", { name: "App judge", exact: true })
    .click();
  await judge.click();
  await expect(
    page.getByRole("menuitemradio", { name: "Studio judge", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("menuitemradio", { name: "Studio judge", exact: true })
    .click();
  await expect(judge).toContainText("Studio judge");
  await drawer
    .getByRole("button", { name: "Application", exact: true })
    .click();
  await page
    .getByRole("menuitemradio", {
      name: "App-only demo · development",
      exact: true,
    })
    .click();
  await expect(judge).toContainText("App judge");
  await drawer
    .getByRole("button", { name: "Application", exact: true })
    .click();
  await page
    .getByRole("menuitemradio", {
      name: "No-judge demo · development",
      exact: true,
    })
    .click();
  await expect(judge).toContainText("Choose judge");
  await expect(
    drawer.getByText(
      "No judge is available for this application environment.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Run evaluations", exact: true }),
  ).toBeDisabled();
});
