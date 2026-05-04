import { resolve } from "node:path";
import { defineKortyxVitestConfig } from "../../vitest.shared";

export default defineKortyxVitestConfig({
  resolve: {
    alias: {
      "@kortyx/hooks/internal": resolve(__dirname, "../hooks/src/internal.ts"),
      "@kortyx/core": resolve(__dirname, "../core/src/index.ts"),
      "@kortyx/hooks": resolve(__dirname, "../hooks/src/index.ts"),
      "@kortyx/providers": resolve(__dirname, "../providers/src/index.ts"),
      "@kortyx/runtime": resolve(__dirname, "../runtime/src/index.ts"),
      "@kortyx/stream/browser": resolve(__dirname, "../stream/src/browser.ts"),
      "@kortyx/stream": resolve(__dirname, "../stream/src/index.ts"),
      "@kortyx/utils": resolve(__dirname, "../utils/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    coverage: {
      thresholds: {
        statements: 65,
        branches: 45,
        functions: 75,
        lines: 68,
      },
    },
  },
});
