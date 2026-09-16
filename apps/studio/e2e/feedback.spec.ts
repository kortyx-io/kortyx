import { expect, test } from "@playwright/test";
import { NAVIGATION_FIXTURES } from "./support/navigation-fixture";
import { DRAWER_FIXTURE } from "./support/telemetry-fixture";

const apiUrl = process.env.KORTYX_API_URL ?? "http://localhost:6400";
const telemetryKey =
  process.env.KORTYX_TELEMETRY_API_KEY ??
  "ktyx_test_localtelemetry_oss-demo-telemetry-secret-change-me";
const studioKey =
  process.env.KORTYX_STUDIO_API_KEY ??
  "ktyx_test_localstudio_oss-demo-studio-secret-change-me";
const runPath = `/runs/${DRAWER_FIXTURE.runId}`;

test.beforeEach(async ({ request }) => {
  const cleared = await request.delete(`${apiUrl}/v1/telemetry/scores`, {
    headers: { authorization: `Bearer ${telemetryKey}` },
    data: { runId: DRAWER_FIXTURE.runId, actorId: "feedback-e2e-user" },
  });
  expect(cleared.ok(), await cleared.text()).toBe(true);
});

test("filters feedback, opens the existing drawer, and keeps human review separate", async ({
  page,
  request,
}) => {
  const payload = {
    runId: DRAWER_FIXTURE.runId,
    actorId: "feedback-e2e-user",
    value: 0,
    reasons: ["incorrect"],
    comment: "It used the wrong account.",
  };
  const rated = await request.post(`${apiUrl}/v1/telemetry/scores`, {
    headers: { authorization: `Bearer ${telemetryKey}` },
    data: payload,
  });
  expect(rated.ok(), await rated.text()).toBe(true);
  await page.goto(`/runs?q=${DRAWER_FIXTURE.runId}`);
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  await page
    .getByLabel("User feedback", { exact: true })
    .selectOption("negative");
  await expect(page).toHaveURL(/feedback=negative/);
  await expect(
    page.getByRole("link", {
      name: `View feedback for run ${DRAWER_FIXTURE.runId}`,
      exact: true,
    }),
  ).toHaveAttribute("href", /feedback=negative/);
  await page
    .getByRole("link", {
      name: `View feedback for run ${DRAWER_FIXTURE.runId}`,
      exact: true,
    })
    .click();
  const drawer = page.locator(`[data-detail-drawer="${runPath}"]`);
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("heading", { name: "User feedback" }),
  ).toBeVisible();
  await expect(drawer).toContainText("It used the wrong account.");
  await expect(drawer.getByText("Negative", { exact: true })).toBeVisible();
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();

  const detailResponse = await request.get(
    `${apiUrl}/v1/studio/runs/${DRAWER_FIXTURE.runId}`,
    { headers: { authorization: `Bearer ${studioKey}` } },
  );
  const before = await detailResponse.json();
  const addReview = drawer.getByRole("button", {
    name: "Add review",
    exact: true,
  });
  if (before.canReview) {
    await addReview.click();
    await drawer
      .getByLabel("Correctness", { exact: true })
      .selectOption("incorrect");
    await drawer
      .getByLabel("Reviewer note (optional)")
      .fill("Reviewed separately from the user vote.");
    await drawer
      .getByRole("button", { name: "Save review", exact: true })
      .click();
    await expect(drawer).toContainText("Review saved.");
    await expect(drawer).toContainText(
      "Reviewed separately from the user vote.",
    );
    await expect(drawer.getByText("Negative", { exact: true })).toBeVisible();
    await drawer
      .getByRole("button", { name: "Edit review", exact: true })
      .click();
    await drawer
      .getByLabel("Correctness", { exact: true })
      .selectOption("partially-correct");
    await drawer
      .getByRole("button", { name: "Save review", exact: true })
      .click();
    await expect(
      drawer.getByText("Partially correct", { exact: true }),
    ).toBeVisible();
    await page.reload();
    const refreshed = page.getByRole("tabpanel");
    await expect(
      refreshed.getByText("Partially correct", { exact: true }),
    ).toBeVisible();
    await refreshed
      .getByRole("button", { name: "Edit review", exact: true })
      .click();
    await refreshed
      .getByRole("button", { name: "Clear review", exact: true })
      .click();
    await expect(refreshed).toContainText("Review cleared.");
  } else {
    await expect(addReview).toBeDisabled();
    await expect(drawer).toContainText("Read-only access.");
  }
  const after = await (
    await request.get(`${apiUrl}/v1/studio/runs/${DRAWER_FIXTURE.runId}`, {
      headers: { authorization: `Bearer ${studioKey}` },
    })
  ).json();
  expect(after.run.status).toBe(before.run.status);
  expect(after.run.feedback).toEqual({ positive: 0, negative: 1 });

  await page.goto(`/sessions/${DRAWER_FIXTURE.sessionId}`);
  const feedbackLink = page.getByRole("link", {
    name: `View feedback for run ${DRAWER_FIXTURE.runId}`,
    exact: true,
  });
  await expect(
    feedbackLink.getByRole("img", {
      name: "0 positive, 1 negative user ratings",
    }),
  ).toBeVisible();
  const cleared = await request.delete(`${apiUrl}/v1/telemetry/scores`, {
    headers: { authorization: `Bearer ${telemetryKey}` },
    data: { runId: payload.runId, actorId: payload.actorId },
  });
  expect(cleared.ok(), await cleared.text()).toBe(true);
  await page.goto(`/runs?q=${DRAWER_FIXTURE.runId}&feedback=unrated`);
  await expect(
    page.getByRole("link", {
      name: `View feedback for run ${DRAWER_FIXTURE.runId}`,
      exact: true,
    }),
  ).toContainText("Unrated");
});

test("renders feedback at mobile widths and shows actionable empty states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${runPath}?tab=feedback`);
  await expect(
    page.getByRole("heading", { name: "User feedback" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tabpanel").getByText("No user feedback received."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const fixture of NAVIGATION_FIXTURES.filter((item) =>
  ["percent", "delimiters"].includes(item.name),
)) {
  test(`reviews preserve opaque ${fixture.name} run IDs`, async ({
    page,
    request,
  }) => {
    const detailUrl = `${apiUrl}/v1/studio/runs/${encodeURIComponent(fixture.runId)}`;
    const headers = { authorization: `Bearer ${studioKey}` };
    const before = await (await request.get(detailUrl, { headers })).json();
    test.skip(
      !before.canReview,
      "Requires the explicitly review-capable Studio key.",
    );
    await page.goto(`/runs/${encodeURIComponent(fixture.runId)}?tab=feedback`);
    await page.getByRole("button", { name: "Add review", exact: true }).click();
    await page.getByLabel("Reviewer note (optional)").fill("Opaque ID review.");
    await page
      .getByRole("button", { name: "Save review", exact: true })
      .click();
    await expect(page.getByText("Review saved.")).toBeVisible();
    const after = await (await request.get(detailUrl, { headers })).json();
    expect(
      after.scores.find(
        (score: { source: string }) => score.source === "human-review",
      )?.target.runId,
    ).toBe(fixture.runId);
    await page
      .getByRole("button", { name: "Edit review", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Clear review", exact: true })
      .click();
    await expect(page.getByText("Review cleared.")).toBeVisible();
  });
}
