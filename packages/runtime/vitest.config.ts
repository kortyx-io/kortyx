import { defineKortyxVitestConfig } from "../../vitest.shared";

export default defineKortyxVitestConfig({
  test: {
    coverage: {
      exclude: [
        "src/**/*.d.ts",
        "src/**/*types.ts",
        "src/types/**",
        "src/**/types.ts",
        "src/**/types/*.ts",
        "src/index.ts",
        "src/browser.ts",
        "src/framework/redis/**",
        "src/graph/**",
        "src/node-loader.ts",
        "src/registry/file-registry.ts",
      ],
      thresholds: {
        statements: 79,
        branches: 58,
        functions: 74,
        lines: 80,
      },
    },
  },
});
