import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/postgres.integration.ts"],
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/framework/postgres/**/*.ts"],
      thresholds: { statements: 85, branches: 75, functions: 85, lines: 85 },
    },
  },
});
