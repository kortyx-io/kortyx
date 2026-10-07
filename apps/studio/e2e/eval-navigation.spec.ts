import { expect, type Page, test } from "@playwright/test";
import { EVAL_FIXTURE } from "./support/eval-fixture";
import { EVAL_OPAQUE_CASES, EVAL_SUITE } from "./support/eval-plan";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const runPath = `/evals/runs/${EVAL_FIXTURE.candidate}`;
const comparePath = `${runPath}/compare?baseline=${EVAL_FIXTURE.baseline}`;
const repeatComparePath = `/evals/runs/${EVAL_FIXTURE.repeatedCandidate}/compare?baseline=${EVAL_FIXTURE.repeatedBaseline}`;
const casePath = `/evals/cases/${EVAL_FIXTURE.candidate}/${EVAL_FIXTURE.caseId}/1`;
const comparisonCasePath = `/evals/cases/${EVAL_FIXTURE.candidate}/${EVAL_FIXTURE.caseId}/compare`;
const workflowPath = `/runs/${DRAWER_FIXTURE.runId}`;
test.describe("Eval route and drawer navigation", () => {
  test("opens Runs by default, reaches Suites, and restores history navigation", async ({
    page,
  }) => {
    await page.goto("/evals");
    await expect(page).toHaveURL(/\/evals\/runs$/);
    await page
      .getByRole("navigation", { name: "Eval navigation" })
      .getByRole("link", { name: "Suites", exact: true })
      .click();
    await expect(page).toHaveURL(/\/evals\/suites$/);
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Suites", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(page).toHaveURL(/\/evals\/runs$/);
  });
  test("restores case selection and keeps evaluation above debugging", async ({
    page,
  }) => {
    await page.goto(runPath);
    await page
      .getByRole("button", { name: "Ambiguous role", exact: true })
      .click();
    await expect(page).toHaveURL(/case=ambiguity%3A1/);
    await page.reload();
    const inspector = page.locator("main").last();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(inspector.getByText("Step 1 evaluation")).toBeVisible();
    await expect(
      inspector.getByRole("button", {
        name: "Conversation and debugging",
        exact: true,
      }),
    ).toHaveAttribute("aria-expanded", "false");
    await inspector
      .getByRole("button", { name: "Conversation and debugging", exact: true })
      .click();
    await expect(page).toHaveURL(/expand\./);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await inspector
      .getByRole("link", { name: "Eval run", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/evals/runs/${EVAL_FIXTURE.candidate}`),
    );
    await page.goBack();
    await expect(page.getByText("Step 1 evaluation")).toBeVisible();
  });
  test("keeps comparison mounted through workflow inspection, close, Back and Forward", async ({
    page,
  }) => {
    await page.goto(comparePath);
    await page
      .getByRole("link", { name: "Ambiguous role", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`${comparisonCasePath}.*baseline=`),
    );
    const comparisonDrawer = page.locator(
      `[data-detail-drawer="${comparisonCasePath}"]`,
    );
    const comparison = comparisonDrawer.getByRole("heading", {
      name: "Ambiguous role",
      exact: true,
    });
    await expect(comparisonDrawer).toBeVisible();
    const node = await comparison.elementHandle();
    await page.getByRole("link", { name: "Inspect workflow" }).last().click();
    const drawer = page.locator(`[data-detail-drawer="${workflowPath}"]`);
    await expect(
      drawer.getByRole("button", { name: "Overview", exact: true }),
    ).toBeVisible();
    expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
    await expect(page).toHaveURL(/baseline=/);
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await drawer
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(comparisonCasePath));
    await expect(comparison).toBeVisible();
    await page.goForward();
    await expect(drawer).toHaveCount(1);
    await page.goBack();
    await expect(comparison).toBeVisible();
    await comparisonDrawer
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(comparisonDrawer).toHaveCount(0);
    await expect(page).toHaveURL(
      new RegExp(`/evals/runs/${EVAL_FIXTURE.candidate}/compare`),
    );
  });
  test("restores the selected case after workflow inspection and reopen", async ({
    page,
  }) => {
    await page.goto(runPath);
    await page
      .getByRole("button", { name: "Ambiguous role", exact: true })
      .click();
    const inspector = page.locator(`[data-detail-drawer="${casePath}"]`);
    await inspector.getByRole("link", { name: "Inspect workflow" }).click();
    const workflow = page.locator(`[data-detail-drawer="${workflowPath}"]`);
    await expect(
      workflow.getByRole("button", { name: "Overview", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await expect(inspector).toHaveAttribute("data-state", "open");
    await workflow
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(workflow).toHaveCount(0);
    await expect(inspector.getByText("Step 1 evaluation")).toBeVisible();
    await inspector.getByRole("button", { name: "Close detail" }).click();
    await expect(inspector).toHaveCount(0);
    await page
      .getByRole("button", { name: "Ambiguous role", exact: true })
      .click();
    await expect(inspector.getByText("Step 1 evaluation")).toBeVisible();
  });
  test("persists comparison filters and attempts in URL", async ({ page }) => {
    await page.goto(comparePath);
    await page.getByRole("button", { name: "Improved", exact: true }).click();
    await expect(page).toHaveURL(/change=improved/);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Improved", exact: true }),
    ).toHaveClass(/secondary/);
    await page
      .getByRole("link", { name: "Ambiguous role", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Candidate attempt", exact: true })
      .click();
    await expect(
      page.getByRole("menuitemradio", { name: "Attempt 1" }),
    ).toBeVisible();
  });
});

test.describe("Eval drawer hardening", () => {
  const suitePath = `/evals/suites/${EVAL_FIXTURE.targetId}/${encodeURIComponent(EVAL_FIXTURE.suiteId)}`;
  const surface = (page: Page, path: string) =>
    page.locator(`[data-detail-drawer="${path}"]`);
  const openSuite = async (page: Page, name = "E2E job conversations") => {
    await page.goto(`/evals/suites?q=${encodeURIComponent(name)}`);
    await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
    await page.getByRole("link", { name, exact: true }).click();
  };

  test("suite drawer preserves its list, expands to route bounds and restores Back/Forward", async ({
    page,
  }) => {
    await openSuite(page);
    const suite = surface(page, suitePath);
    await expect(
      suite.getByRole("heading", { name: "Conversation plan" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("dialog")).toHaveCount(1);
    const list = await page
      .locator('[data-table-ready="true"]')
      .elementHandle();
    await suite
      .getByRole("button", { name: "Expand detail", exact: true })
      .click();
    await expect(page).toHaveURL(/detailView=expanded/);
    await expect
      .poll(async () => {
        const a = await suite.boundingBox();
        const b = await page
          .locator('main[data-slot="sidebar-inset"]')
          .boundingBox();
        return a && b ? Math.abs(a.x - b.x) : Infinity;
      })
      .toBeLessThanOrEqual(2);
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/evals/suites");
    await expect(suite).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(/detailView=expanded/);
    await expect(suite).toHaveAttribute("data-state", "open");
    // Expanded surfaces hide the compact drawer header; Escape dismisses them.
    await page.keyboard.press("Escape");
    await expect(suite).toHaveCount(0);
    expect(await list?.evaluate((node) => node.isConnected)).toBe(true);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/evals/suites" &&
        url.searchParams.get("q") === "E2E job conversations",
    );
  });

  test("suite definition details and payload preferences survive reload as a full page", async ({
    page,
  }) => {
    await openSuite(page);
    const suite = surface(page, suitePath);
    const details = suite.getByRole("button", {
      name: "Details for Ambiguous role",
      exact: true,
    });
    await details.click();
    await expect(details).toHaveAttribute("aria-expanded", "true");
    await suite
      .getByRole("button", { name: "Raw suite definition", exact: true })
      .click();
    await expect(page).toHaveURL(/expand\.suite-definition-raw=true/);
    const viewer = suite.locator("[data-payload-viewer]").last();
    await viewer
      .getByRole("button", { name: /Payload representation/ })
      .click();
    await page
      .getByRole("menuitemradio", { name: "YAML", exact: true })
      .click();
    await expect(page).toHaveURL(/payload\.suite-definition-raw\.mode=yaml/);
    await page.reload();
    await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Details for Ambiguous role",
        exact: true,
      }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-payload-viewer]").last()).toHaveAttribute(
      "data-mode",
      "yaml",
    );
    await expect(
      page.getByRole("heading", {
        name: "Step 2 Respond to human input",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("launch from suite drawer restores selection and app judge through URL history", async ({
    page,
  }) => {
    await openSuite(page);
    const suite = surface(page, suitePath);
    await suite.getByRole("button", { name: "Run suite", exact: true }).click();
    const launch = page.getByRole("dialog", { name: "Run evaluations" });
    await expect(launch).toBeVisible();
    await launch.getByRole("button", { name: "Judge", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: "App judge", exact: true })
      .click();
    await expect(
      launch.getByRole("button", {
        name: "Review conversation definitions",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/launchJudge=app/);
    await page.reload();
    await expect(
      page.getByRole("dialog", { name: "Run evaluations" }),
    ).toBeVisible();
    await expect(
      launch.getByRole("button", { name: "Judge", exact: true }),
    ).toContainText("App judge");
    await expect(
      launch.getByRole("radio", { name: "Selected suites", exact: true }),
    ).toBeChecked();
    await page
      .getByRole("button", { name: "Close run setup", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(
      (url) =>
        !url.searchParams.has("launch") && !url.searchParams.has("launchJudge"),
    );
    await page.goBack();
    await expect(
      page.getByRole("dialog", { name: "Run evaluations" }),
    ).toBeVisible();
  });

  test("launches only a selected conversation with an app judge and shows the persisted result", async ({
    page,
  }) => {
    await openSuite(page);
    await surface(page, suitePath)
      .getByRole("button", { name: "Run suite", exact: true })
      .click();
    const launch = page.getByRole("dialog", { name: "Run evaluations" });
    await launch.getByRole("button", { name: "Judge", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: "App judge", exact: true })
      .click();
    await expect(
      launch
        .getByRole("group", { name: "Conversations", exact: true })
        .getByRole("checkbox"),
    ).toHaveCount(EVAL_SUITE.cases.length);
    for (const [index, checkbox] of (
      await launch
        .getByRole("group", { name: "Conversations", exact: true })
        .getByRole("checkbox")
        .all()
    ).entries()) {
      await checkbox.uncheck();
      await expect(
        launch.getByText(
          `Conversations · ${EVAL_SUITE.cases.length - 1 - index} selected`,
          {
            exact: true,
          },
        ),
      ).toBeVisible();
    }
    await expect(
      launch.getByRole("button", { name: "Run evaluations", exact: true }),
    ).toBeDisabled();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("launchCases") === "[]",
    );
    await page.reload();
    await expect(
      launch.getByText("Conversations · 0 selected", { exact: true }),
    ).toBeVisible();
    await launch.getByRole("checkbox", { name: /Ambiguous role/ }).check();
    await expect(
      launch.getByText("Conversations · 1 selected", { exact: true }),
    ).toBeVisible();
    await launch
      .getByRole("button", { name: "Run evaluations", exact: true })
      .click();
    await expect(page).toHaveURL((url) =>
      /^\/evals\/evaluations\/[0-9a-f-]+$/.test(url.pathname),
    );
    await page
      .getByRole("button", { name: EVAL_SUITE.name!, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Ambiguous role", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("1 / 1", { exact: false }).first(),
    ).toBeVisible();
    await expect(page.locator('[data-row-key="ambiguity:1"]')).toContainText(
      "Passed",
      { timeout: 15000 },
    );
    await expect(page.locator('[data-row-key="repeated-role:1"]')).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "Configuration", exact: true })
      .click();
    await expect(
      page.getByText("fixture-judge · 1", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("fixture-judge · 1", { exact: true }),
    ).toBeVisible();
  });

  for (const origin of ["case", "comparison"] as const) {
    for (const dismissal of ["Escape", "backdrop"] as const) {
      test(`${origin} nested workflow ${dismissal} peels only the top drawer and retains filters`, async ({
        page,
      }) => {
        await page.goto(
          origin === "case"
            ? `${runPath}?outcome=passed`
            : `${comparePath}&change=improved`,
        );
        await page
          .getByRole(origin === "case" ? "button" : "link", {
            name: "Ambiguous role",
            exact: true,
          })
          .click();
        const parentPath = origin === "case" ? casePath : comparisonCasePath;
        const parent = surface(page, parentPath);
        await expect(parent).toHaveAttribute("data-state", "open");
        const parentUrl = page.url();
        const handle = await parent.elementHandle();
        await parent
          .getByRole("link", { name: "Inspect workflow", exact: true })
          .last()
          .click();
        const child = surface(page, workflowPath);
        await expect(
          child.getByRole("button", { name: "Overview", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(2);
        await expect(page.locator("[data-detail-backdrop]")).toHaveCount(1);
        if (dismissal === "Escape") await page.keyboard.press("Escape");
        else {
          await expect
            .poll(async () =>
              child.evaluate((el) =>
                el.getAnimations().some((a) => a.playState === "running"),
              ),
            )
            .toBe(false);
          const bounds = await child.boundingBox();
          if (!bounds) throw Error("Missing workflow bounds");
          await page.mouse.click(
            Math.max(8, bounds.x / 2),
            bounds.y + bounds.height / 2,
          );
        }
        await expect(child).toHaveCount(0);
        await expect(parent).toHaveAttribute("data-state", "open");
        expect(await handle?.evaluate((el) => el.isConnected)).toBe(true);
        await expect(page).toHaveURL(parentUrl);
        await page.goForward();
        await expect(child).toHaveAttribute("data-state", "open");
        await page.goBack();
        await expect(child).toHaveCount(0);
        await parent
          .getByRole("button", { name: "Close detail", exact: true })
          .click();
        await expect(parent).toHaveCount(0);
        await expect(page).toHaveURL(
          (url) =>
            url.searchParams.get(origin === "case" ? "outcome" : "change") ===
            (origin === "case" ? "passed" : "improved"),
        );
      });
    }
  }

  test("expanded evaluation remains expanded after workflow close without losing the document", async ({
    page,
  }) => {
    await page.goto(runPath);
    await page
      .getByRole("button", { name: "Ambiguous role", exact: true })
      .click();
    const parent = surface(page, casePath);
    await parent
      .getByRole("button", { name: "Expand detail", exact: true })
      .click();
    await expect
      .poll(async () => {
        const box = await parent.boundingBox();
        const inset = await page
          .locator('main[data-slot="sidebar-inset"]')
          .boundingBox();
        return box && inset ? Math.abs(box.x - inset.x) : Infinity;
      })
      .toBeLessThanOrEqual(2);
    const bounds = await parent.boundingBox();
    const node = await parent.elementHandle();
    await parent
      .getByRole("link", { name: "Inspect workflow", exact: true })
      .click();
    const child = surface(page, workflowPath);
    await expect(
      child.getByRole("button", { name: "Overview", exact: true }),
    ).toBeVisible();
    await child
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(child).toHaveCount(0);
    await expect(page).toHaveURL(/detailView=expanded/);
    await expect
      .poll(async () => {
        const box = await parent.boundingBox();
        return box && bounds ? Math.abs(box.x - bounds.x) : Infinity;
      })
      .toBeLessThanOrEqual(2);
    expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
  });

  test("comparison attempts and side tabs restore through Back/Forward and full-page reload", async ({
    page,
  }) => {
    await page.goto(repeatComparePath);
    await page
      .getByRole("link", { name: "Repeated role", exact: true })
      .click();
    const path = `/evals/cases/${EVAL_FIXTURE.repeatedCandidate}/repeated-role/compare`;
    const comparison = surface(page, path);
    await comparison
      .getByRole("button", { name: "Candidate", exact: true })
      .click();
    await comparison
      .getByRole("button", { name: "Candidate attempt", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Attempt 2", exact: true })
      .click();
    await expect(page).toHaveURL(/candidateAttempt=1/);
    await expect(comparison).toContainText("missing");
    await page.goBack();
    await expect(page).toHaveURL(
      (url) => !url.searchParams.has("candidateAttempt"),
    );
    await page.goForward();
    await expect(page).toHaveURL(/candidateAttempt=1/);
    await page.reload();
    await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Candidate attempt", exact: true }),
    ).toContainText("Attempt 2");
    await expect(
      page.getByText("The selected role description is missing.", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("full-page eval tabs stay full page through history and preserve the original run list filters", async ({
    page,
  }) => {
    const original = `/evals/runs?q=E2E&application=${EVAL_FIXTURE.targetId}&status=passed`;
    await page.goto(original);
    await page
      .locator(`[data-row-key="${EVAL_FIXTURE.candidate}"]`)
      .getByRole("button", { name: "E2E job conversations", exact: true })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === runPath);
    await page
      .getByRole("button", { name: "Suite definition", exact: true })
      .click();
    await expect(page).toHaveURL(/evalTab=definition/);
    await page
      .getByRole("button", { name: "Configuration", exact: true })
      .click();
    await expect(page).toHaveURL(/evalTab=context/);
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Conversation plan", exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Run history", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/evals/runs" &&
        url.searchParams.get("q") === "E2E" &&
        url.searchParams.get("status") === "passed" &&
        url.searchParams.get("application") === EVAL_FIXTURE.targetId &&
        !url.searchParams.has("evalTab"),
    );
  });
});

test.describe("Eval opaque IDs and shareable links", () => {
  for (const item of EVAL_OPAQUE_CASES) {
    for (const kind of ["result", "comparison"] as const) {
      test(`${item.name} ${kind} URL resolves after drawer navigation and direct reload`, async ({
        page,
      }) => {
        await page.goto(kind === "result" ? runPath : comparePath);
        const expected = `/evals/cases/${EVAL_FIXTURE.candidate}/${encodeURIComponent(item.id)}/${kind === "result" ? "1" : "compare"}`;
        const control = page.getByRole(kind === "result" ? "button" : "link", {
          name: item.name,
          exact: true,
        });
        if (kind === "comparison")
          await expect(control).toHaveAttribute(
            "href",
            `${expected}?baseline=${EVAL_FIXTURE.baseline}`,
          );
        await control.click();
        await expect(page).toHaveURL((url) => url.pathname === expected);
        const surface = page.locator(`[data-detail-drawer="${expected}"]`);
        await expect(
          surface.getByRole("heading", { name: item.name, exact: true }),
        ).toBeVisible();
        await surface
          .getByRole("button", { name: "Close detail", exact: true })
          .click();
        await expect(surface).toHaveCount(0);
        await page.goForward();
        await expect(surface).toHaveAttribute("data-state", "open");
        await page.reload();
        await expect(
          page.getByRole("heading", { name: item.name, exact: true, level: 1 }),
        ).toBeVisible();
        await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
        await expect(page).toHaveURL((url) => url.pathname === expected);
      });
    }
  }
  test("opaque suite ID survives row links, expanded drawer and direct reload", async ({
    page,
  }) => {
    await page.goto("/evals/suites?q=Opaque");
    const href = `/evals/suites/${EVAL_FIXTURE.targetId}/${encodeURIComponent(EVAL_FIXTURE.opaqueSuiteId)}`;
    const link = page.getByRole("link", {
      name: "Opaque suite identifiers",
      exact: true,
    });
    await expect(link).toHaveAttribute("href", `${href}?q=Opaque`);
    await link.click();
    const drawer = page.locator(`[data-detail-drawer="${href}"]`);
    await expect(
      drawer.getByRole("heading", {
        name: "Opaque suite identifiers",
        exact: true,
      }),
    ).toBeVisible();
    await drawer
      .getByRole("button", { name: "Expand detail", exact: true })
      .click();
    await page.reload();
    await expect(page.locator("[data-detail-drawer]")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Opaque suite identifiers",
        exact: true,
        level: 1,
      }),
    ).toBeVisible();
  });
  test("modified workflow link opens a full page while retaining the source evaluation drawer", async ({
    page,
    context,
  }) => {
    await page.goto(runPath);
    await page
      .getByRole("button", { name: "Ambiguous role", exact: true })
      .click();
    const parent = page.locator(`[data-detail-drawer="${casePath}"]`);
    await expect(page).toHaveURL((url) => url.pathname === casePath);
    const original = page.url();
    const popupPromise = context.waitForEvent("page");
    await parent
      .getByRole("link", { name: "Inspect workflow", exact: true })
      .click({ modifiers: ["ControlOrMeta"] });
    const popup = await popupPromise;
    await expect(popup).toHaveURL((url) => url.pathname === workflowPath);
    await expect(
      popup.getByRole("button", { name: "Overview", exact: true }),
    ).toBeVisible();
    await expect(popup.locator("[data-detail-drawer]")).toHaveCount(0);
    await expect(page).toHaveURL(original);
    await expect(parent).toHaveAttribute("data-state", "open");
    await popup.close();
  });
  test("legacy eval URLs redirect to canonical case and comparison routes without dropping filters", async ({
    page,
  }) => {
    await page.goto(
      `/evals?run=${EVAL_FIXTURE.candidate}&case=ambiguity%3A1&outcome=passed`,
    );
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === casePath &&
        url.searchParams.get("outcome") === "passed",
    );
    await expect(page.getByText("Step 1 evaluation")).toBeVisible();
    await page.goto(
      `/evals?run=${EVAL_FIXTURE.candidate}&compare=${EVAL_FIXTURE.baseline}&case=ambiguity&change=improved`,
    );
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === comparisonCasePath &&
        url.searchParams.get("baseline") === EVAL_FIXTURE.baseline &&
        url.searchParams.get("change") === "improved",
    );
    await expect(
      page.getByRole("button", { name: "Both runs", exact: true }),
    ).toBeVisible();
  });
  test("missing case and missing suite use not-found pages", async ({
    page,
  }) => {
    await page.goto(`/evals/cases/${EVAL_FIXTURE.candidate}/missing-case/1`);
    await expect(page.getByText("404", { exact: true })).toBeVisible();
    await page.goto(`/evals/suites/${EVAL_FIXTURE.targetId}/missing-suite`);
    await expect(page.getByText("404", { exact: true })).toBeVisible();
  });
  test("multi-step suite remains readable at a half-screen viewport without horizontal page overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 760, height: 900 });
    await page.goto(
      `/evals/suites/${EVAL_FIXTURE.targetId}/${EVAL_FIXTURE.suiteId}`,
    );
    const conversation = page.getByRole("region", {
      name: "Choose between cities",
      exact: true,
    });
    await expect(
      conversation.getByRole("heading", { name: /Step 1 User message/ }),
    ).toBeVisible();
    await expect(
      conversation.getByRole("heading", {
        name: /Step 2 Respond to human input/,
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
  });
});

test.describe("Eval adversarial state transitions", () => {
  test("Escape closes an attempt dropdown without closing its comparison drawer or changing selection", async ({
    page,
  }) => {
    await page.goto(repeatComparePath);
    await page
      .getByRole("link", { name: "Repeated role", exact: true })
      .click();
    const parent = page.locator(
      `[data-detail-drawer="/evals/cases/${EVAL_FIXTURE.repeatedCandidate}/repeated-role/compare"]`,
    );
    await parent
      .getByRole("button", { name: "Candidate attempt", exact: true })
      .click();
    await expect(
      page.getByRole("menuitemradio", { name: "Attempt 2", exact: true }),
    ).toBeVisible();
    const original = page.url();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("menuitemradio", { name: "Attempt 2", exact: true }),
    ).toHaveCount(0);
    await expect(parent).toHaveAttribute("data-state", "open");
    await expect(page).toHaveURL(original);
    await parent
      .getByRole("button", { name: "Candidate attempt", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Attempt 2", exact: true })
      .click();
    await expect(parent).toContainText(
      "The selected role description is missing.",
    );
  });

  test("switching baseline and revisiting the same comparison case replaces its evidence and restores both history visits", async ({
    page,
  }) => {
    await page.goto(comparePath);
    await page
      .getByRole("link", { name: "Ambiguous role", exact: true })
      .click();
    const parent = page.locator(`[data-detail-drawer="${comparisonCasePath}"]`);
    await expect(parent).toContainText(
      "The selected role description is missing.",
    );
    await parent
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(parent).toHaveCount(0);
    await page.getByLabel("Baseline", { exact: true }).click();
    await page
      .getByRole("menuitemradio")
      .filter({ hasText: /00:01:00.*passed/ })
      .click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("baseline") === EVAL_FIXTURE.alternate,
    );
    await page
      .getByRole("link", { name: "Ambiguous role", exact: true })
      .click();
    await expect(parent).toContainText("Alternate baseline role description");
    await expect(parent).not.toContainText(
      "The selected role description is missing.",
    );
    const selected = page.url();
    await page.goBack();
    await expect(parent).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(selected);
    await expect(parent).toContainText("Alternate baseline role description");
  });

  test("Forward during a nested workflow exit revives the workflow without a stale close navigating to its parent", async ({
    page,
  }) => {
    await page.goto(`${comparePath}&change=improved`);
    await page
      .getByRole("link", { name: "Ambiguous role", exact: true })
      .click();
    const parent = page.locator(`[data-detail-drawer="${comparisonCasePath}"]`);
    await parent
      .getByRole("link", { name: "Inspect workflow", exact: true })
      .last()
      .click();
    const child = page.locator(`[data-detail-drawer="${workflowPath}"]`);
    await expect(
      child.getByRole("button", { name: "Overview", exact: true }),
    ).toBeVisible();
    // Trigger Forward on the first closing mutation in the browser, before
    // Presence removes the workflow. Runner-side waits can miss this race.
    await child.evaluate((el) => {
      document.documentElement.dataset.e2eNestedExit = "false";
      const audit = new MutationObserver(() => {
        if (el.getAttribute("data-state") === "closed") {
          document.documentElement.dataset.e2eNestedExit = "true";
          audit.disconnect();
          window.history.forward();
        }
      });
      audit.observe(el, { attributes: true, attributeFilter: ["data-state"] });
    });
    await page.evaluate(() => window.history.back());
    await expect(page.locator("html")).toHaveAttribute(
      "data-e2e-nested-exit",
      "true",
    );
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === workflowPath &&
        url.searchParams.get("baseline") === EVAL_FIXTURE.baseline,
    );
    await expect(child).toHaveAttribute("data-state", "open");
    await expect(parent).toHaveAttribute("data-state", "open");
    // Wait for exit/entry animations to settle, then sample consecutive paints.
    await expect
      .poll(() =>
        child.evaluate((el) =>
          el.getAnimations().some((a) => a.playState === "running"),
        ),
      )
      .toBe(false);
    const states = await child.evaluate(async (el) => {
      const values = [];
      for (let frame = 0; frame < 8; frame++) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        values.push(el.isConnected && el.getAttribute("data-state") === "open");
      }
      return values;
    });
    expect(states).toEqual(Array(8).fill(true));
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await child
      .getByRole("button", { name: "Close detail", exact: true })
      .click();
    await expect(child).toHaveCount(0);
    await expect(parent).toHaveAttribute("data-state", "open");
  });
});
