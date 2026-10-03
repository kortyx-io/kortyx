import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@studio/auth": new URL("./src/auth/server.ts", import.meta.url).pathname,
      "@studio/auth-contracts": new URL(
        "./src/auth/contracts.ts",
        import.meta.url,
      ).pathname,
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
