import { defineConfig } from "tsup";
import { apiTsconfig } from "./scripts/profile.mjs";

export default defineConfig({
  entry: { index: "src/index.ts", updater: "src/updater.ts" },
  format: ["esm"],
  dts: false,
  tsconfig: apiTsconfig(),
  sourcemap: true,
  clean: true,
  target: "es2022",
});
