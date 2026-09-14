import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", updater: "src/updater.ts" },
  format: ["esm"],
  dts: false,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  clean: true,
  target: "es2022",
});
