import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@studio/styles": new URL("./src/app/globals.css", import.meta.url)
        .pathname,
      "@studio/settings": new URL("./src/settings/server.ts", import.meta.url)
        .pathname,
      "@studio/settings-contracts": new URL(
        "./src/settings/contracts.ts",
        import.meta.url,
      ).pathname,
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
