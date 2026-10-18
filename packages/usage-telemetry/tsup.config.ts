import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts", "src/node.ts", "src/browser-node.ts"],
  format: ["cjs"],
  dts: true,
  tsconfig: "tsconfig.build.json",
  sourcemap: true,
  clean: true,
  target: "es2022",
});
