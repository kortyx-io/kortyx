import { resolve } from "node:path";
import { defineKortyxVitestConfig } from "../../vitest.shared";

const root = resolve(__dirname, "../..");

export default defineKortyxVitestConfig({
  resolve: {
    alias: {
      "@kortyx/hooks/internal": resolve(root, "packages/hooks/src/internal.ts"),
      "@kortyx/core/errors": resolve(root, "packages/core/src/errors.ts"),
      "@kortyx/stream/browser": resolve(root, "packages/stream/src/browser.ts"),
      ...Object.fromEntries(
        [
          "agent",
          "core",
          "hooks",
          "providers",
          "runtime",
          "stream",
          "utils",
          "mcp",
          "telemetry",
          "telemetry-contracts",
          "telemetry-db",
        ].map((name) => [
          `@kortyx/${name}`,
          resolve(root, `packages/${name}/src/index.ts`),
        ]),
      ),
      kortyx: resolve(root, "packages/kortyx/src/index.ts"),
      "@": resolve(root, "apps/studio/src"),
      "react-dom/server": resolve(
        root,
        "apps/studio/node_modules/react-dom/server.node.js",
      ),
      react: resolve(root, "apps/studio/node_modules/react"),
    },
  },
  test: { include: ["test/observability/*.test.ts"], testTimeout: 15_000 },
});
