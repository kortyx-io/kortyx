import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  tsconfig: "./tsconfig.tools-e2e.json",
  testDir: "./e2e",
  testMatch: "tool-observability.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.KORTYX_E2E_STUDIO_URL ?? "http://localhost:6318",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
