import { expect, type Locator, test } from "@playwright/test";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const sessionPath = `/sessions/${DRAWER_FIXTURE.sessionId}`;
const runPath = `/runs/${DRAWER_FIXTURE.runId}`;
const interruptPath = `/interrupts/${DRAWER_FIXTURE.interruptId}`;

test.describe("Responsive detail surfaces", () => {
  test("stacks Session metadata according to its container, not the viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 760, height: 900 });
    await page.goto(`${sessionPath}?sessionTab=metadata`);

    const surface = page.locator(
      '[data-responsive-surface="session-metadata"]',
    );
    await expect(surface).toBeVisible();
    await expectNoHorizontalOverflow(surface);
    await expectStacked(
      surface.getByRole("heading", { name: "Identity" }).locator(".."),
      surface.getByRole("heading", { name: "Instrumentation" }).locator(".."),
    );
    await expectNoHorizontalOverflow(
      page.locator('[data-responsive-surface="detail-header"]'),
    );

    await page.setViewportSize({ width: 1_440, height: 900 });
    await expectSideBySide(
      surface.getByRole("heading", { name: "Identity" }).locator(".."),
      surface.getByRole("heading", { name: "Instrumentation" }).locator(".."),
    );
  });

  test("stacks the Interrupt decision and Run summary at narrow detail widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 760, height: 900 });
    await page.goto(interruptPath);

    const decision = page.locator(
      '[data-responsive-surface="interrupt-decision"]',
    );
    await expect(decision).toBeVisible();
    await expectNoHorizontalOverflow(decision);
    await expectStacked(decision.locator("section"), decision.locator("aside"));

    await page.goto(`${runPath}?tab=summary`);
    const summary = page.locator('[data-responsive-surface="run-summary"]');
    await expect(summary).toBeVisible();
    await expectNoHorizontalOverflow(summary);
    await expectStacked(
      summary.getByRole("heading", { name: "Execution" }).locator(".."),
      summary.getByRole("heading", { name: "Context" }).locator(".."),
    );
  });

  test("wraps payload controls without introducing horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${interruptPath}?interruptTab=payload`);

    const viewer = page.locator("[data-payload-viewer]").first();
    const toolbar = viewer.locator(
      '[data-responsive-surface="payload-toolbar"]',
    );
    await expect(viewer).toBeVisible();
    await expect(toolbar).toBeVisible();
    await expectNoHorizontalOverflow(viewer);
    await expectNoHorizontalOverflow(toolbar);
    await expect(
      toolbar.getByRole("button", { name: /^Payload representation:/ }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "Disable text wrapping" }),
    ).toBeVisible();
  });
});

async function expectNoHorizontalOverflow(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Math.ceil(element.scrollWidth - element.clientWidth),
      ),
    )
    .toBeLessThanOrEqual(1);
}

async function expectStacked(first: Locator, second: Locator) {
  await expect
    .poll(async () => {
      const [firstBox, secondBox] = await Promise.all([
        first.boundingBox(),
        second.boundingBox(),
      ]);
      if (!firstBox || !secondBox) return false;
      return secondBox.y >= firstBox.y + firstBox.height;
    })
    .toBe(true);
}

async function expectSideBySide(first: Locator, second: Locator) {
  await expect
    .poll(async () => {
      const [firstBox, secondBox] = await Promise.all([
        first.boundingBox(),
        second.boundingBox(),
      ]);
      if (!firstBox || !secondBox) return false;
      return (
        Math.abs(firstBox.y - secondBox.y) <= 2 &&
        secondBox.x >= firstBox.x + firstBox.width
      );
    })
    .toBe(true);
}
