import { defineConfig, mergeConfig, type UserConfig } from "vitest/config";

const DEFAULT_COVERAGE_THRESHOLDS = {
  statements: 80,
  branches: 70,
  functions: 80,
  lines: 80,
};

export function defineKortyxVitestConfig(config: UserConfig = {}) {
  return mergeConfig(
    defineConfig({
      test: {
        environment: "node",
        coverage: {
          provider: "v8",
          reporter: ["text", "lcov"],
          all: true,
          include: ["src/**/*.{ts,tsx}"],
          exclude: [
            "src/**/*.d.ts",
            "src/**/*types.ts",
            "src/types/**",
            "src/**/types.ts",
            "src/**/types/*.ts",
            "src/index.ts",
            "src/browser.ts",
          ],
          thresholds: DEFAULT_COVERAGE_THRESHOLDS,
        },
      },
    }),
    config,
  );
}
