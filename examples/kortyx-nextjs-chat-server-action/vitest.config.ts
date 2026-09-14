import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@": `${root}src`,
      "server-only": `${root}node_modules/next/dist/compiled/server-only/empty.js`,
    },
  },
  test: { include: ["test/**/*.test.ts"] },
});
