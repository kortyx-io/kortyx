import { defineKortyxVitestConfig } from "../../vitest.shared";

export default defineKortyxVitestConfig({
  test: {
    environment: "node",
    coverage: {
      include: ["src/studio/**/*.ts"],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 100,
        lines: 100,
      },
    },
  },
});
