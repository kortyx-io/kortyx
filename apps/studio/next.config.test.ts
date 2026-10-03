import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createStudioConfig } from "./next.config";

const studio = fileURLToPath(new URL(".", import.meta.url));
const fixture = fileURLToPath(new URL("./tsconfig.json", import.meta.url));

it("does not change ordinary OSS build configuration", () => {
  expect(createStudioConfig(studio, "")).toEqual({});
});
it("selects an app-local config through native Next TypeScript configuration", () => {
  for (const path of [fixture, "tsconfig.json"]) {
    const config = createStudioConfig(studio, path);
    expect(config.typescript?.tsconfigPath).toBe("tsconfig.json");
    expect(config.outputFileTracingRoot).toBe(config.turbopack?.root);
    expect(config.turbopack?.resolveAlias).toBeUndefined();
    expect(config.webpack).toBeUndefined();
  }
});
it("rejects missing, directory, and outside-workspace configs", () => {
  for (const path of [
    "./missing.json",
    `${studio}/missing.ts`,
    studio,
    "/etc/hosts",
  ]) {
    expect(() => createStudioConfig(studio, path)).toThrow();
  }
});

it("rejects an in-workspace symlink to an outside config", () => {
  const directory = mkdtempSync(join(studio, ".auth-config-test-"));
  try {
    const link = join(directory, "tsconfig.json");
    symlinkSync("/etc/hosts", link);
    expect(() => createStudioConfig(studio, link)).toThrow("same workspace");
  } finally {
    rmSync(directory, { recursive: true });
  }
});
