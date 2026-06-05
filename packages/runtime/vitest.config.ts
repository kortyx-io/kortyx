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
        "src/framework/redis/pending-request-store.ts",
        "src/framework/redis/redis-checkpointer.ts",
        "src/framework/redis/redis-client.ts",
        "src/framework/redis/redis-store.ts",
        "src/graph/**",
        "src/node-loader.ts",
        "src/registry/file-registry.ts",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
