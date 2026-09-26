import { defineConfig, devices } from "@playwright/test";

const studioUrl = process.env.KORTYX_E2E_STUDIO_URL ?? "http://localhost:6300";
const apiUrl = process.env.KORTYX_API_URL ?? "http://localhost:6400";

export default defineConfig({
  tsconfig: "./tsconfig.tools-e2e.json",
  testDir: "./e2e",
  testMatch: /demo-showcase\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: studioUrl,
    colorScheme: "dark",
    httpCredentials: {
      username: process.env.KORTYX_STUDIO_BASIC_AUTH_USERNAME ?? "admin",
      password: process.env.KORTYX_STUDIO_BASIC_AUTH_PASSWORD ?? "kortyx",
    },
    ...devices["Desktop Chrome"],
    viewport: { width: 1_600, height: 1_050 },
  },
  webServer: [
    {
      name: "Kortyx API",
      command: "pnpm --dir ../.. dev:api",
      url: `${apiUrl.replace(/\/$/, "")}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      name: "Kortyx Studio",
      command: "pnpm dev",
      url: `${studioUrl.replace(/\/$/, "")}/sessions`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
