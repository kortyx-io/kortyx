import { resolve } from "node:path";
import { defineKortyxVitestConfig } from "../../vitest.shared";

export default defineKortyxVitestConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      kortyx: resolve(__dirname, "../../packages/kortyx/src/index.ts"),
      "@kortyx/stream/browser": resolve(
        __dirname,
        "../../packages/stream/src/browser.ts",
      ),
      "@kortyx/hooks/internal": resolve(
        __dirname,
        "../../packages/hooks/src/internal.ts",
      ),
      ...Object.fromEntries(
        [
          "core",
          "hooks",
          "providers",
          "runtime",
          "agent",
          "stream",
          "utils",
        ].map((name) => [
          `@kortyx/${name}`,
          resolve(__dirname, `../../packages/${name}/src/index.ts`),
        ]),
      ),
    },
  },
});
