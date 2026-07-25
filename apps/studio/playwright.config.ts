import { defineConfig, devices } from "@playwright/test";

const studioUrl = process.env.KORTYX_E2E_STUDIO_URL ?? "http://localhost:6300";
const apiUrl = process.env.KORTYX_API_URL ?? "http://localhost:6400";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: studioUrl,
    colorScheme: "dark",
    httpCredentials: {
      username: process.env.KORTYX_STUDIO_BASIC_AUTH_USERNAME ?? "admin",
      password: process.env.KORTYX_STUDIO_BASIC_AUTH_PASSWORD ?? "kortyx",
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      name: "Kortyx API",
      command: "pnpm --dir ../.. dev:api",
      url: `${apiUrl.replace(/\/$/, "")}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      name: "Kortyx Studio",
      command: "pnpm dev",
      url: `${studioUrl.replace(/\/$/, "")}/sessions`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
  projects: [
    {
      name: "cleanup",
      testMatch: /setup\/cleanup\.teardown\.ts/,
    },
    {
      name: "setup",
      testMatch: /setup\/seed\.setup\.ts/,
      teardown: "cleanup",
    },
    {
      name: "chromium",
      testIgnore: /setup\//,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1_440, height: 1_000 },
      },
    },
  ],
});
