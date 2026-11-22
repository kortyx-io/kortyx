import { expect, test } from "@playwright/test";

test("sample evaluator opens with visible selected values and a read-only saved assessment", async ({
  page,
}) => {
  await page.goto("/sample/evaluators");
  await expect(
    page.getByRole("heading", { name: "Evaluators", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "New evaluator", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Support response review", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Judge model", exact: true }),
  ).toHaveText("sample/judge");
  await expect(
    page.getByRole("combobox", { name: "Score group", exact: true }),
  ).toHaveText("Assessment · v1");
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Executions", exact: true }).click();
  await page
    .getByRole("button")
    .filter({ hasText: "manual · completed · production" })
    .click();
  await expect(
    page.getByRole("region", { name: "Judge result" }),
  ).toContainText("fictional example demonstrates a saved text assessment");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("region", { name: "Judge result" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("authors a judge prompt and score group in Studio before saving an evaluator draft", async ({
  page,
}) => {
  await page.goto("/evaluators/new");
  const name = `E2E evaluator ${Date.now()}`;
  await page.getByLabel("Evaluator name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create judge prompt", exact: true })
    .click();
  await page
    .getByLabel("Prompt key", { exact: true })
    .fill(`e2e/evaluator-${Date.now()}`);
  await page
    .getByLabel("Rubric", { exact: true })
    .fill(
      "Explain whether the recorded response follows the user's request. Disclose missing evidence.",
    );
  await page
    .getByRole("button", { name: "Save prompt version", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Prompt version", exact: true }),
  ).toContainText("Version 1");
  const unconfiguredModel = page.getByRole("textbox", {
    name: "Judge model",
    exact: true,
  });
  if (await unconfiguredModel.isVisible())
    await unconfiguredModel.fill("configure-before-preview");
  await page
    .getByRole("button", { name: "Create score group", exact: true })
    .click();
  await page.getByLabel("Group name", { exact: true }).fill(`${name} fields`);
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await page
    .getByLabel("Grading guidance", { exact: true })
    .last()
    .fill("Whether the answer is supported by the supplied evidence.");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Score group", exact: true }),
  ).toContainText(`${name} fields`);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/evaluators\/[a-f0-9-]{36}$/);
  await page.reload();
  await expect(page.getByLabel("Evaluator name", { exact: true })).toHaveValue(
    name,
  );
  await expect(
    page.getByRole("combobox", { name: "Score group", exact: true }),
  ).toContainText(`${name} fields`);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Preview against recorded evidence",
      exact: true,
    }),
  ).toBeVisible();
});
