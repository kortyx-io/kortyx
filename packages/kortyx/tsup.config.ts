import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/browser.ts", "src/cli.ts"],
  format: ["cjs"],
  dts: true,
  tsconfig: "tsconfig.build.json",
  sourcemap: true,
  clean: true,
  target: "es2022",
});
