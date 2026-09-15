import type { StudioUpdateStatus } from "@kortyx/telemetry-contracts";
import { expect, test } from "@playwright/test";

test("checks a release, saves a schedule, and reports a failed update", async ({
  page,
}) => {
  const release = {
    format: 1 as const,
    installer: 1 as const,
    version: "0.3.0",
    api: `ghcr.io/kortyx-io/kortyx-api@sha256:${"a".repeat(64)}`,
    studio: `ghcr.io/kortyx-io/kortyx-studio@sha256:${"b".repeat(64)}`,
    deployment: { strategy: "recreate" as const },
  };
  let status: StudioUpdateStatus = {
    current: "0.2.0",
    available: null,
    checkedAt: null,
    checkError: null,
    operation: null,
    settings: { automatic: false, hourUtc: 0 },
  };
  const actions: string[] = [];
  await page.route("**/api/studio/updates", async (route) => {
    const data = route.request().postDataJSON();
    if (data) {
      actions.push(data.action);
      if (data.action === "check")
        status = {
          ...status,
          available: release,
          checkedAt: new Date().toISOString(),
        };
      if (data.action === "settings")
        status = {
          ...status,
          settings: { automatic: data.automatic, hourUtc: data.hourUtc },
        };
      if (data.action === "update") {
        expect(data.version).toBe("0.3.0");
        status = {
          ...status,
          settings: { ...status.settings, automatic: false },
          operation: {
            id: "58bdb2ef-f24b-44c0-ae4f-bcf3408747bd",
            from: "0.2.0",
            release,
            phase: "failed",
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            backup: "/example/studio/.updates/backups/example",
            messages: [
              "Migration failed.",
              "Automatic updates are paused. Recover manually before enabling them again.",
            ],
          },
        };
      }
    }
    await route.fulfill({ json: status });
  });
  await page.goto("/settings");
  const updates = page.locator("#updates");
  await expect(
    updates.getByRole("heading", { name: "Updates", exact: true }),
  ).toBeVisible();
  const automatic = updates.getByRole("checkbox", {
    name: "Install updates automatically",
  });
  await expect(automatic).not.toBeChecked();
  await updates.getByRole("button", { name: "Check for updates" }).click();
  await expect(updates.getByText("Version 0.3.0 is available.")).toBeVisible();
  await expect(
    updates.getByRole("link", { name: "Release notes" }),
  ).toHaveAttribute("href", /studio-v0.3.0$/);
  await updates.getByRole("combobox").selectOption("4");
  await expect(updates.getByRole("combobox")).toHaveValue("4");
  await automatic.check();
  await expect(automatic).toBeChecked();
  await updates.getByRole("button", { name: "Update to v0.3.0" }).click();
  await expect(
    updates.getByText("Update failed — manual recovery required"),
  ).toBeVisible();
  await expect(automatic).not.toBeChecked();
  await expect(
    updates.getByText("Migration failed.", { exact: true }),
  ).toBeVisible();
  expect(actions).toEqual(["check", "settings", "settings", "update"]);
});

test("keeps an in-progress update visible while Studio restarts", async ({
  page,
}) => {
  await page.route("**/api/studio/updates", async (route) =>
    route.fulfill({
      json: {
        current: "0.2.0",
        available: null,
        checkedAt: null,
        checkError: null,
        settings: { automatic: false, hourUtc: 0 },
        operation: {
          id: "58bdb2ef-f24b-44c0-ae4f-bcf3408747bd",
          from: "0.2.0",
          release: {
            format: 1,
            installer: 1,
            version: "0.3.0",
            api: `ghcr.io/kortyx-io/kortyx-api@sha256:${"a".repeat(64)}`,
            studio: `ghcr.io/kortyx-io/kortyx-studio@sha256:${"b".repeat(64)}`,
            deployment: { strategy: "recreate" },
          },
          phase: "installing",
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          backup: "/example/backup",
          messages: ["Starting the published release."],
        },
      },
    }),
  );
  await page.goto("/settings");
  await expect(
    page.getByText("Update in progress", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/studio/updates");
  await page.route("**/api/studio/updates", (route) => route.abort());
  await expect(
    page.getByText("Studio is restarting. Reconnecting to the updater…"),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: "Check for updates" }),
  ).toBeDisabled();
});
