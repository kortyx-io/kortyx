import path from "node:path";
import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { expect, type Locator, test } from "@playwright/test";

const output =
  process.env.KORTYX_DEMO_SCREENSHOT_DIR ?? path.resolve("demo-screens");

test("capture presentation-ready Studio sample screens", async ({ page }) => {
  const capture = async (name: string, url: string, ready: Locator) => {
    await page.goto(url);
    await expect(ready).toBeVisible();
    const table = page.locator("[data-table-ready]").first();
    if (await table.count()) {
      await expect(table).toHaveAttribute("data-table-ready", "true");
    }
    const workflowMap = page.locator("[data-workflows-ready]");
    if (await workflowMap.count()) {
      await expect(workflowMap).toHaveAttribute("data-workflows-ready", "true");
      await expect(page.locator(".react-flow__node").first()).toBeVisible();
    }
    await expect(page.locator("body")).not.toContainText(
      "Internal Server Error",
    );
    await page.screenshot({
      path: path.join(output, `${name}.png`),
      animations: "disabled",
      caret: "initial",
      fullPage: false,
    });
  };
  const text = (value: string) =>
    page.getByText(value, { exact: true }).first();
  const panel = (tab: string) =>
    page.locator(`[data-detail-tab-content="${tab}"]`);
  const run = `/sample/runs/${sample.runs.success}`;
  const session = `/sample/sessions/${sample.sessions.success}`;

  await capture("01-runs-overview", "/sample/runs", text(sample.runs.failure));
  for (const [name, tab] of [
    ["02-run-overview", "overview"],
    ["03-run-execution", "calls"],
    ["04-run-trace", "trace"],
    ["05-run-topology", "topology"],
    ["06-run-model-io", "model-io"],
    ["07-run-summary", "summary"],
    ["08-run-events", "events"],
  ]) {
    await capture(name, `${run}?tab=${tab}`, panel(tab));
  }
  await capture(
    "09-sessions-overview",
    "/sample/sessions",
    text(sample.sessions.success),
  );
  for (const [name, tab] of [
    ["10-session-activity", "activity"],
    ["11-session-runs", "runs"],
    ["12-session-state", "state"],
    ["13-session-metadata", "metadata"],
  ]) {
    await capture(name, `${session}?sessionTab=${tab}`, panel(tab));
  }
  await capture("14-workflows", "/sample/workflows", text(sample.workflowId));
  await capture(
    "15-interrupts",
    "/sample/interrupts",
    page.locator(`[data-row-key="${sample.interruptId}"]`),
  );
  await capture(
    "16-interrupt-detail",
    `/sample/interrupts/${sample.interruptId}?interruptTab=payload`,
    panel("payload"),
  );
  await capture(
    "17-failed-run",
    `/sample/runs/${sample.runs.failure}?tab=trace`,
    page.getByText(/model request timed out/i).first(),
  );
  await capture("18-prompts", "/sample/prompts", text("Support assistant"));
  await capture(
    "19-prompt-detail",
    `/sample/prompts/${sample.promptId}`,
    text("Support assistant"),
  );
  await capture(
    "20-evaluations",
    "/sample/evals/runs",
    text("Support quality — recorded sample"),
  );
});
