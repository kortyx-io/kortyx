import { resolve } from "node:path";
import { defineKortyxVitestConfig } from "../../vitest.shared";

export default defineKortyxVitestConfig({
  resolve: {
    alias: {
      "@kortyx/hooks": resolve(__dirname, "../hooks/src/index.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
