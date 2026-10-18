import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`failed-run guide completes through the selected Trace inspector at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/sample/runs");
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "Explore Studio", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start Debug a failed run", exact: true })
      .click();
    const tooltip = page.getByRole("alertdialog");
    for (const title of [
      "Narrow the investigation",
      "Start with the failure",
      "Find the failed step",
      "Inspect the model operation",
    ]) {
      await expect(tooltip).toHaveAccessibleName(title);
      if (title === "Find the failed step") {
        await expect(page).toHaveURL(
          new RegExp(`tab=trace&trace=${sample.traceItemIds.failure}$`),
        );
        const error = page.locator(
          `[data-detail-inspector][data-state="open"] [data-trace-item-id="${sample.traceItemIds.failure}"] [data-guide-focus="trace-error"]`,
        );
        await expect(error).toBeVisible();
        await expect(error).toContainText("The model request timed out");
        await expect(error).toBeInViewport({ ratio: 1 });
        await page.screenshot({
          path: test.info().outputPath("failed-trace-guide.png"),
        });
      }
      await tooltip
        .getByRole("button", {
          name: title === "Inspect the model operation" ? "Done" : "Next",
          exact: true,
        })
        .click();
    }
    // A missing target returns to the guide hub with Resume; that must fail.
    await expect(
      page.getByRole("heading", { name: "Chapter completed", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Resume tour", exact: true }),
    ).toHaveCount(0);
  });
}

test("select, explore, hide and restore the immutable sample project", async ({
  page,
}) => {
  // This cross-feature journey includes several first-use Next dev routes.
  test.setTimeout(60_000);
  await page.goto("/runs");
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("button", { name: "Sample project Read-only" }).click();
  await expect(page).toHaveURL(/\/sample\/runs$/);
  await expect(
    page.getByRole("button", { name: "Project", exact: true }),
  ).toContainText(sample.name);
  await expect(
    page.getByText(sample.runs.failure, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Live refresh:/ }),
  ).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath("sample-runs-desktop.png"),
  });
  await page
    .getByRole("link", { name: "Sessions", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/sample\/sessions$/);
  await page.getByRole("link", { name: "Runs", exact: true }).first().click();
  await expect(page).toHaveURL(/\/sample\/runs$/);
  await page.goto(`/sample/runs/${sample.runs.failure}`);
  await expect(
    page.getByText(/model request timed out/i).first(),
  ).toBeVisible();
  await page.goto(`/sample/sessions/${sample.sessions.success}`);
  await expect(
    page.getByText(sample.runs.success, { exact: true }).first(),
  ).toBeVisible();
  await page.goto(`/sample/interrupts/${sample.interruptId}`);
  await expect(
    page
      .getByText("Approve the $24 credit for SAMPLE-81?", { exact: true })
      .first(),
  ).toBeVisible();
  await page.goto("/sample/prompts");
  await expect(
    page.getByText("Support assistant", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New prompt", exact: true }),
  ).toBeDisabled();
  await page.goto(`/sample/prompts/${sample.promptId}`);
  await expect(
    page.getByText("Support assistant", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/sample/evals/runs");
  await expect(
    page
      .getByText("Support quality — recorded sample", { exact: true })
      .first(),
  ).toBeVisible();
  await page.goto("/sample/settings/sample-project");
  await page.getByRole("switch", { name: "Show sample project" }).click();
  await expect(page).toHaveURL(/(?<!sample)\/(runs|onboarding)$/);
  await expect(
    page.getByRole("button", { name: "Project", exact: true }),
  ).toHaveCount(0);
  await page.goto("/sample/runs");
  await expect(page).toHaveURL(/(?<!sample)\/(runs|onboarding)$/);
  await page.goto("/settings/sample-project");
  await expect(
    page.getByRole("switch", { name: "Show sample project" }),
  ).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch", { name: "Show sample project" }).click();
  await expect(
    page.getByRole("button", { name: "Project", exact: true }),
  ).toBeVisible();
});

test("sample API requests reject writes and cannot fetch a real record", async ({
  request,
}) => {
  const headers = {
    "x-kortyx-studio-request-path": "/sample/runs",
    origin: "http://127.0.0.1:6327",
  };
  for (const [url, method] of [
    ["/api/studio/prompts/actions", "POST"],
    ["/api/studio/evals/runs", "POST"],
    [`/api/studio/runs/${sample.runs.success}/review`, "DELETE"],
  ]) {
    const response = await request.fetch(url ?? "/", {
      method,
      headers,
      data: {},
    });
    expect(response.status()).toBe(403);
  }
  const prompt = await request.get(
    `/api/studio/prompts/assets/${sample.promptId}`,
    { headers },
  );
  expect(prompt.status()).toBe(200);
  const outside = await request.get(
    "/api/studio/prompts/assets/99999999-0000-4000-8000-000000000000",
    { headers },
  );
  expect(outside.status()).toBe(404);
});

test("sample navigation remains scoped and works on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sample/runs");
  await expect(
    page.getByRole("button", { name: "Project", exact: true }),
  ).toContainText(sample.name);
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sample project Read-only" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: test.info().outputPath("sample-runs-mobile.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
