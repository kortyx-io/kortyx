import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  cleanupDemoShowcase,
  DEMO,
  seedDemoShowcase,
} from "./support/demo-showcase-fixture";

const output =
  process.env.KORTYX_DEMO_SCREENSHOT_DIR ?? path.resolve("demo-screens");

test("capture presentation-ready Studio screens", async ({ page, request }) => {
  await cleanupDemoShowcase();
  await seedDemoShowcase(request);
  const capture = async (
    name: string,
    url: string,
    ready?: () => Promise<void>,
  ) => {
    await page.goto(url);
    await expect(page.locator("body")).not.toContainText(
      "Internal Server Error",
    );
    if (ready) await ready();
    await page.screenshot({
      path: path.join(output, `${name}.png`),
      fullPage: false,
    });
  };

  await capture(
    "01-runs-overview",
    "/runs?env=production&range=7+days",
    async () => {
      await expect(
        page.locator(`[data-row-key="${DEMO.runId}"]`),
      ).toBeVisible();
    },
  );
  await capture("02-run-overview", `/runs/${DEMO.runId}?tab=overview`);
  await capture("03-run-execution", `/runs/${DEMO.runId}?tab=calls`);
  await capture("04-run-trace", `/runs/${DEMO.runId}?tab=trace`);
  await capture("05-run-topology", `/runs/${DEMO.runId}?tab=topology`);
  await capture("06-run-model-io", `/runs/${DEMO.runId}?tab=model-io`);
  await capture("07-run-summary", `/runs/${DEMO.runId}?tab=summary`);
  await capture("08-run-events", `/runs/${DEMO.runId}?tab=events`);
  await capture(
    "09-sessions-overview",
    "/sessions?env=production&range=7+days",
    async () => {
      await expect(
        page.locator(`[data-row-key="${DEMO.sessionId}"]`),
      ).toBeVisible();
    },
  );
  await capture(
    "10-session-activity",
    `/sessions/${DEMO.sessionId}?sessionTab=activity`,
  );
  await capture(
    "11-session-runs",
    `/sessions/${DEMO.sessionId}?sessionTab=runs`,
  );
  await capture(
    "12-session-state",
    `/sessions/${DEMO.sessionId}?sessionTab=state`,
  );
  await capture(
    "13-session-metadata",
    `/sessions/${DEMO.sessionId}?sessionTab=metadata`,
  );
  await capture(
    "14-workflows",
    `/workflows?env=production&range=7+days&workflow=${DEMO.workflowId}`,
  );
  await capture("15-interrupts", "/interrupts?env=production&range=7+days");
  await capture(
    "16-interrupt-detail",
    `/interrupts/${DEMO.interruptId}?interruptTab=payload`,
  );
});
