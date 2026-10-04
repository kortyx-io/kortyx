import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests exercise OSS defaults; selected profiles have a real build/dev smoke test.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
  resolve: {
    alias: {
      "@api/auth": fileURLToPath(
        new URL("./src/auth/server.ts", import.meta.url),
      ),
      "@api/authorization": fileURLToPath(
        new URL("./src/authorization/server.ts", import.meta.url),
      ),
      "@api/tenant-database": fileURLToPath(
        new URL("./src/database/server.ts", import.meta.url),
      ),
    },
  },
});
