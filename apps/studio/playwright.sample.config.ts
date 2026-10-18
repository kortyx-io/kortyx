import { defineConfig, devices } from "@playwright/test";

const port = process.env.KORTYX_SAMPLE_TEST_PORT ?? "6327";
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["sample-project.spec.ts", "sample-tour.spec.ts"],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/sample/runs`,
    reuseExistingServer: false,
    env: {
      KORTYX_STUDIO_AUTH_MODE: "none",
      KORTYX_USAGE_TELEMETRY_DISABLED: "1",
      KORTYX_API_URL: "",
      KORTYX_STUDIO_API_KEY: "",
      KORTYX_STUDIO_PROJECT_KEYS: "[]",
    },
    timeout: 120_000,
  },
});
