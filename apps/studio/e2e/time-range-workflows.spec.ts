import { expect, test } from "@playwright/test";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

test.describe("Studio time ranges and workflow cohorts", () => {
  test("keeps unexecuted catalog calls visible and preserves caller context through selection and reload", async ({
    page,
  }) => {
    await page.goto(
      `/workflows?workflow=${DRAWER_FIXTURE.workflowId}&range=All+time`,
    );
    await expect(page.locator('[data-workflows-ready="true"]')).toBeVisible();
    const callId = `catalog-call:${DRAWER_FIXTURE.workflowId}:chat:${DRAWER_FIXTURE.workflowId}`;
    const edge = page.locator(`[data-id="${callId}"]`);
    await expect(edge).toHaveCount(1);
    await page.getByRole("checkbox", { name: /Observed calls/ }).uncheck();
    await expect(edge).toHaveCount(1);
    const inspector = page.getByRole("complementary", {
      name: "Selection inspector",
    });
    // There is also a handoff to this workflow. Select the source-discovered
    // call by its transition query rather than depending on graph coordinates.
    await page.goto(
      `/workflows?workflow=${DRAWER_FIXTURE.workflowId}&transition=${encodeURIComponent(callId)}&range=All+time`,
    );
    await expect(
      inspector.getByRole("heading", { name: "Child workflow call" }),
    ).toBeVisible();
    await expect(
      inspector.getByText("Discovered in source · returns to caller", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      inspector.getByRole("link", { name: "View runs" }),
    ).toHaveAttribute("href", /includeChildren=true/);
    await page.reload();
    await expect(
      inspector.getByRole("heading", { name: "Child workflow call" }),
    ).toBeVisible();
    await inspector
      .getByRole("button", { name: `Back to ${DRAWER_FIXTURE.workflowId}` })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`workflow=${DRAWER_FIXTURE.workflowId}.*node=chat`),
    );
  });

  test("keeps range and version filters URL-backed and preserves the exact View runs cohort", async ({
    page,
  }) => {
    await page.goto(
      `/workflows?workflow=${DRAWER_FIXTURE.workflowId}&range=All+time`,
    );
    await expect(
      page.getByRole("heading", { name: "Workflows" }),
    ).toBeVisible();
    await expect(page.locator('[data-workflows-ready="true"]')).toBeVisible();

    const range = page.getByRole("combobox", { name: "Time range" });
    const version = page.getByRole("combobox", {
      name: "Workflow version",
    });
    await expect(range).toHaveValue("All time");
    await version.selectOption("1.0.0-e2e");
    await expect(page).toHaveURL(/version=1\.0\.0-e2e/);

    const allTimeRuns = page.getByRole("link", { name: "View runs" });
    await expect(allTimeRuns).toHaveAttribute(
      "href",
      new RegExp(
        `workflow=${DRAWER_FIXTURE.workflowId}.*version=1\\.0\\.0-e2e.*range=All\\+time`,
      ),
    );

    await range.selectOption("7 days");
    await expect(page).toHaveURL(/range=7\+days/);
    await expect(allTimeRuns).toHaveAttribute(
      "href",
      /range=Custom\+range.*startedAfter=.*startedBefore=/,
    );

    await page.goBack();
    await expect(range).toHaveValue("All time");
    await page.goForward();
    await expect(range).toHaveValue("7 days");
  });

  test("round-trips custom UTC bounds through reload and reports partial ranges", async ({
    page,
  }) => {
    const after = "2026-07-20T00:00:00.000Z";
    const before = "2026-07-26T23:59:59.999Z";
    await page.goto(
      `/workflows?workflow=${DRAWER_FIXTURE.workflowId}&range=Custom+range&startedAfter=${encodeURIComponent(after)}&startedBefore=${encodeURIComponent(before)}`,
    );

    const range = page.getByRole("combobox", { name: "Time range" });
    await expect(range).toHaveValue("Custom range");
    await expect(
      page.getByRole("button", { name: "Jul 20, 2026 – Jul 26, 2026" }),
    ).toBeVisible();
    await page.reload();
    await expect(range).toHaveValue("Custom range");
    await expect(page.getByRole("link", { name: "View runs" })).toHaveAttribute(
      "href",
      new RegExp(
        `startedAfter=${encodeURIComponent(after)}.*startedBefore=${encodeURIComponent(before)}`,
      ),
    );

    await page.goto(
      `/workflows?range=Custom+range&startedAfter=${encodeURIComponent(after)}`,
    );
    await expect(
      page.getByText("End time is required for a custom range."),
    ).toBeVisible();
  });
});

for (const width of [1440, 700]) {
  test(`restores graph nodes, edges, and viewport through Back/Forward at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      `/workflows?workflow=${DRAWER_FIXTURE.workflowId}&range=All+time`,
    );
    const graph = page.locator(".react-flow");
    const viewport = page.locator(".react-flow__viewport");
    const transform = () =>
      viewport.evaluate((e) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(e).transform);
        return { zoom: matrix.a, x: matrix.e, y: matrix.f };
      });
    const selected = page.locator(`[data-id="${DRAWER_FIXTURE.workflowId}"]`);
    await expect(selected).toBeVisible();
    await expect
      .poll(async () => (await transform()).zoom)
      .toBeGreaterThan(0.25);
    const nodes = await graph.locator(".react-flow__node:visible").count();
    const edges = await graph.locator(".react-flow__edge").count();
    const initial = await transform();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await expect
      .poll(async () => (await transform()).zoom)
      .toBeCloseTo(initial.zoom / 1.2, 3);
    const saved = await transform();
    if (width < 1024)
      await page
        .getByRole("button", { name: "Open selected item panel", exact: true })
        .click();
    await page.getByRole("link", { name: "View runs", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Runs", exact: true }),
    ).toBeVisible();
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goBack();
      await expect(graph).toBeVisible();
      await expect(graph.locator(".react-flow__node:visible")).toHaveCount(
        nodes,
      );
      await expect(graph.locator(".react-flow__edge")).toHaveCount(edges);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect
        .poll(async () => (await transform()).zoom)
        .toBeCloseTo(saved.zoom, 3);
      await expect
        .poll(async () => (await transform()).x)
        .toBeCloseTo(saved.x, 1);
      await expect
        .poll(async () => (await transform()).y)
        .toBeCloseTo(saved.y, 1);
      await page.goForward();
      await expect(
        page.getByRole("heading", { name: "Runs", exact: true }),
      ).toBeVisible();
    }
    await page.goBack();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect
      .poll(async () => (await transform()).zoom)
      .toBeGreaterThan(saved.zoom);
  });
}
