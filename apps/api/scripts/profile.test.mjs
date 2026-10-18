import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { apiDirectory, apiTsconfig } from "./profile.mjs";

test("accepts relative and absolute public profiles", () => {
  assert.equal(
    apiTsconfig("tsconfig.json"),
    join(apiDirectory, "tsconfig.json"),
  );
  assert.equal(
    apiTsconfig(join(apiDirectory, "tsconfig.json")),
    join(apiDirectory, "tsconfig.json"),
  );
});

test("rejects missing, directory, outside-workspace and symlink-escaped profiles", () => {
  const outside = mkdtempSync(join(tmpdir(), "kortyx-api-profile-"));
  const symlink = join(apiDirectory, "tsconfig.api-test-symlink.json");
  try {
    const external = join(outside, "tsconfig.json");
    writeFileSync(external, "{}", { flag: "wx" });
    symlinkSync(external, symlink);
    assert.throws(() => apiTsconfig("does-not-exist.json"));
    assert.throws(() => apiTsconfig("."));
    assert.throws(() => apiTsconfig(external), /same workspace/);
    assert.throws(() => apiTsconfig(symlink), /same workspace/);
  } finally {
    rmSync(symlink, { force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("contract aliases cannot be replaced or silently omitted", () => {
  const name = join(apiDirectory, "tsconfig.api-test-contracts.json");
  const paths = JSON.parse(
    readFileSync(join(apiDirectory, "tsconfig.json"), "utf8"),
  ).compilerOptions.paths;
  try {
    writeFileSync(
      name,
      JSON.stringify({
        extends: "./tsconfig.json",
        compilerOptions: {
          paths: { ...paths, "@api/auth-contracts": ["./src/auth/server.ts"] },
        },
      }),
      { flag: "wx" },
    );
    assert.throws(() => apiTsconfig(name), /public contract/);
    writeFileSync(
      name,
      JSON.stringify({
        extends: "./tsconfig.json",
        compilerOptions: { paths: {} },
      }),
    );
    assert.throws(() => apiTsconfig(name), /public contract/);
  } finally {
    rmSync(name, { force: true });
  }
});
