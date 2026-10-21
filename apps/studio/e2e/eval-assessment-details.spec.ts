import { expect, test } from "@playwright/test";

const evaluation =
  "/sample/evals/evaluations/10000000-0000-4000-8000-000000000003";

test("conversation assessment has one flat disclosure with readable recorded checks", async ({
  page,
}) => {
  await page.goto(evaluation);
  await page
    .getByRole("link", {
      name: "Keep estimates distinct from promises",
      exact: true,
    })
    .click();
  const drawer = page.locator("[data-detail-drawer]").last();
  const assessment = drawer.locator("[data-eval-assessment]");
  await expect(assessment).toContainText(
    "Distinguishes a carrier estimate from a guaranteed delivery appointment.",
  );
  const trigger = assessment.getByRole("button", {
    name: "Assessment details",
    exact: true,
  });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const details = assessment.locator("[data-assessment-details]");
  await expect(
    details.getByRole("region", { name: "Criterion", exact: true }),
  ).toBeVisible();
  await expect(
    details.getByRole("heading", { name: "Evidence", exact: true }),
  ).toBeVisible();
  await expect(
    details.getByRole("region", { name: "Automatic checks", exact: true }),
  ).toContainText("Answer contains text");
  await expect(details.locator("[data-guide-focus=eval-checks]")).toContainText(
    "Passed",
  );
  await expect(details.getByRole("button")).toHaveCount(0);
  await expect(assessment.getByRole("button")).toHaveCount(1);
  await page.reload();
  const restored = page.locator(
    "[data-eval-assessment] [data-assessment-details]",
  );
  await expect(restored).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(restored).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("comparison uses the same flat assessment details on both sides and opens failures", async ({
  page,
}) => {
  await page.goto("/sample/evals/runs");
  await page
    .getByRole("button", {
      name: "Inspect changes for Support quality — recorded sample",
      exact: true,
    })
    .click();
  const modal = page.locator("[data-eval-comparison-modal]");
  const earlier = modal.locator(
    '[data-comparison-side="Earlier"] [data-eval-assessment]',
  );
  const current = modal.locator(
    '[data-comparison-side="This run"] [data-eval-assessment]',
  );
  await expect(
    earlier.getByRole("button", { name: "Assessment details", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await current
    .getByRole("button", { name: "Assessment details", exact: true })
    .click();
  for (const side of [earlier, current]) {
    const details = side.locator("[data-assessment-details]");
    await expect(
      details.getByRole("region", { name: "Criterion", exact: true }),
    ).toBeVisible();
    await expect(
      details.getByRole("heading", { name: "Evidence", exact: true }),
    ).toBeVisible();
    await expect(
      details.getByRole("region", { name: "Automatic checks", exact: true }),
    ).toBeVisible();
    await expect(details.getByRole("button")).toHaveCount(0);
  }
  await expect(
    modal.getByRole("button", {
      name: "Expected behavior and evidence",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await expect(current.locator("[data-assessment-details]")).toBeVisible();
});

test("definition drawer shares the reading hierarchy without inventing recorded outcomes", async ({
  page,
}) => {
  await page.goto(
    "/sample/evals/suites/sample-support/sample-support-quality?suiteCase=order-status",
  );
  const definition = page.getByRole("dialog", {
    name: "Shipment status and a follow-up",
    exact: true,
  });
  await expect(
    definition.locator('[data-slot="sheet-description"]'),
  ).toHaveText("order-status");
  await expect(
    definition.getByText("order-status", { exact: true }),
  ).toHaveCount(1);
  await expect(
    definition.getByRole("region", { name: "Expected behavior", exact: true }),
  ).toBeVisible();
  await expect(
    definition.getByRole("heading", { name: "Criterion", exact: true }),
  ).toBeVisible();
  await expect(
    definition.getByRole("link", { name: "Judge instructions", exact: true }),
  ).toBeVisible();
  await expect(
    definition.getByText("Not assessed", { exact: true }),
  ).toHaveCount(0);
  await expect(definition.getByText("Passed", { exact: true })).toHaveCount(0);
  await definition
    .getByRole("button", { name: "Next step", exact: true })
    .click();
  await expect(definition).toContainText("Will it need a signature?");
  await page.reload();
  await expect(definition).toContainText("Will it need a signature?");
  const footer = definition.getByRole("navigation", {
    name: "Conversation navigation",
  });
  await footer.getByRole("button", { name: "Next", exact: true }).click();
  await expect(definition).toHaveCount(0);
  const next = page.getByRole("dialog", {
    name: "Keep estimates distinct from promises",
    exact: true,
  });
  await expect(
    next.getByRole("region", { name: "Automatic checks", exact: true }),
  ).toContainText("Answer contains text");
  await expect(
    next.getByRole("button", {
      name: "Check definition and evidence",
      exact: true,
    }),
  ).toHaveCount(0);
  await next
    .getByRole("button", { name: "Case definition", exact: true })
    .click();
  await expect(next.locator("[data-payload-viewer]")).not.toContainText(
    '"cases"',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("definition header and footer dividers align with the main table", async ({
  page,
}) => {
  await page.goto(
    "/sample/evals/suites/sample-support/sample-support-quality?suiteCase=order-status",
  );
  const drawer = page.getByRole("dialog", {
    name: "Shipment status and a follow-up",
    exact: true,
  });
  await expect(drawer).toBeInViewport();
  const edges = await page.evaluate(() => {
    const header = document.querySelector('[data-tour-surface="eval-summary"]');
    const drawerHeader = document.querySelector(
      '[data-detail-inspector] [data-slot="sheet-header"]',
    );
    const footer = document.querySelector("[data-table-footer]");
    const drawerFooter = document.querySelector(
      '[data-detail-inspector] [data-slot="sheet-footer"]',
    );
    return {
      header: header?.getBoundingClientRect().bottom,
      drawerHeader: drawerHeader?.getBoundingClientRect().bottom,
      footer: footer?.getBoundingClientRect().top,
      drawerFooter: drawerFooter?.getBoundingClientRect().top,
    };
  });
  expect(edges.header).toBeDefined();
  expect(edges.drawerHeader).toBe(edges.header);
  expect(edges.footer).toBeDefined();
  expect(edges.drawerFooter).toBe(edges.footer);
  await page.goto(evaluation);
  await page
    .getByRole("link", { name: "Shipment status and a follow-up", exact: true })
    .click();
  await expect(
    page.locator("[data-detail-drawer]").last().locator("header"),
  ).toHaveCSS("height", "64px");
});

test("definition workflow action opens topology with the configured workflow selected", async ({
  page,
}) => {
  await page.goto(
    "/sample/evals/suites/sample-support/sample-support-quality?suiteCase=order-status",
  );
  await page
    .getByRole("dialog", {
      name: "Shipment status and a follow-up",
      exact: true,
    })
    .getByRole("link", { name: "View workflow", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/sample/workflows" &&
      url.searchParams.get("workflow") === "sample-support-assistant",
  );
  await expect(page.locator(".react-flow")).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("dialog", {
      name: "Shipment status and a follow-up",
      exact: true,
    }),
  ).toBeVisible();
});

test("comparison shares attached stats expansion and returns from judge instructions to the same comparison", async ({
  page,
}) => {
  const query = new URLSearchParams({
    changeRun: "10000000-0000-4000-8000-000000000130",
    changeCase: JSON.stringify(["sample-support-quality", "order-status"]),
    changeBaseline: "10000000-0000-4000-8000-000000000003",
  });
  await page.goto(`/sample/evals/runs?${query}`);
  const modal = page.locator("[data-eval-comparison-modal]");
  const earlier = modal.locator('[data-comparison-side="Earlier"]');
  const current = modal.locator('[data-comparison-side="This run"]');
  const a = earlier.getByRole("button", {
    name: "See more stats",
    exact: true,
  });
  const b = current.getByRole("button", {
    name: "See more stats",
    exact: true,
  });
  await expect(a).toHaveAttribute("aria-expanded", "false");
  await expect(b).toHaveAttribute("aria-expanded", "false");
  await a.click();
  await expect(b).toHaveAttribute("aria-expanded", "true");
  await expect(
    modal.getByRole("region", { name: "All repetitions stats", exact: true }),
  ).toHaveCount(2);
  await expect(
    earlier.getByRole("region", { name: "This repetition stats", exact: true }),
  ).toBeVisible();
  await expect(
    current.getByRole("region", { name: "This repetition stats", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(a).toHaveAttribute("aria-expanded", "true");
  await expect(b).toHaveAttribute("aria-expanded", "true");
  await b.click();
  await expect(a).toHaveAttribute("aria-expanded", "false");
  const selection = await current
    .getByRole("button", { name: "This run repetition", exact: true })
    .innerText();
  const actions = current.locator("[data-eval-inspection-actions]");
  await expect(
    actions.getByRole("link", { name: "Inspect workflow", exact: true }),
  ).toHaveCount(1);
  await actions
    .getByRole("link", { name: "Judge instructions", exact: true })
    .click();
  const instructions = page.getByRole("dialog", {
    name: "Judge instructions",
    exact: true,
  });
  await expect(instructions).toBeInViewport();
  await expect(modal).toBeHidden();
  await instructions
    .getByRole("button", { name: "Close detail", exact: true })
    .click();
  await expect(modal).toBeVisible();
  await expect(
    current.getByRole("button", { name: "This run repetition", exact: true }),
  ).toHaveText(selection);
  await actions
    .getByRole("link", { name: "Judge instructions", exact: true })
    .click();
  await expect(instructions).toBeInViewport();
  await page.reload();
  await page
    .getByRole("link", { name: "Back to conversation", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/sample/evals/runs" &&
      url.searchParams.get("changeCase") ===
        JSON.stringify(["sample-support-quality", "order-status"]),
  );
  await expect(modal).toBeVisible();
});
