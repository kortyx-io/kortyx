import { defineConfig } from "@playwright/test";
import sampleConfig from "./playwright.sample.config";

// A dedicated local server serves immutable sample data without API credentials.
export default defineConfig({
  ...sampleConfig,
  testMatch: "demo-showcase.spec.ts",
  timeout: 180_000,
  retries: 0,
  reporter: "list",
  use: {
    ...sampleConfig.use,
    colorScheme: "dark",
    viewport: { width: 1600, height: 1050 },
  },
});
