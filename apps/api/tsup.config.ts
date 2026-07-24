import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  tsconfig: "tsconfig.json",
  sourcemap: true,
  clean: true,
  target: "es2022",
});
