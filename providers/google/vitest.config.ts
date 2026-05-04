import { defineKortyxVitestConfig } from "../../vitest.shared";

export default defineKortyxVitestConfig({
  test: {
    coverage: {
      thresholds: {
        statements: 74,
        branches: 58,
        functions: 80,
        lines: 75,
      },
    },
  },
});
