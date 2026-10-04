import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { apiDirectory, apiTsconfig } from "./profile.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const config = apiTsconfig();
const command = process.argv[2];
const args = process.argv.slice(3);
const invocation =
  command === "type-check"
    ? [
        require.resolve("typescript/bin/tsc"),
        "--noEmit",
        "--project",
        config,
        ...args,
      ]
    : command === "dev"
      ? [
          require.resolve("tsx/cli"),
          "watch",
          "--tsconfig",
          config,
          "src/index.ts",
          ...args,
        ]
      : undefined;
if (!invocation) throw new Error("Expected dev or type-check command.");
const child = spawn(process.execPath, invocation, {
  cwd: apiDirectory,
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
