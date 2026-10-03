import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createStudioEditionConfig } from "./next.config";

const studio = fileURLToPath(new URL(".", import.meta.url));
const fixture = fileURLToPath(
  new URL("../../test/studio/edition-fixture.ts", import.meta.url),
);

it("does not change ordinary OSS build configuration", () => {
  expect(createStudioEditionConfig(studio, "")).toEqual({});
});
it("selects a local compiled edition consistently for Turbopack and webpack", () => {
  const config = createStudioEditionConfig(studio, fixture);
  expect(config.turbopack?.resolveAlias?.["@/edition"]).toBe(
    "./../../test/studio/edition-fixture.ts",
  );
  expect(config.outputFileTracingRoot).toBe(config.turbopack?.root);
});
it("rejects relative, missing, directory, and outside-workspace modules instead of falling back", () => {
  for (const path of [
    "./private.ts",
    `${studio}/missing.ts`,
    studio,
    "/etc/hosts",
  ]) {
    expect(() => createStudioEditionConfig(studio, path)).toThrow();
  }
});
