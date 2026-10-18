import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const root = resolve(import.meta.dirname, "../../..");
const cache = resolve(root, "node_modules/.cache/kortyx-retirement-release");
const dependencies = {
  "@kortyx/agent": "0.39.0",
  "@kortyx/runtime": "0.25.0",
  kortyx: "0.32.0",
};
const packages = {};
for (const [name, version] of Object.entries(dependencies)) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
  );
  assert.equal(response.status, 200);
  const all = await response.json();
  const meta = all.versions[version];
  assert.equal(meta.version, version);
  packages[name] = {
    name,
    version,
    integrity: meta.dist.integrity,
    tarball: meta.dist.tarball,
    publishedAt: all.time[version],
  };
}
const response = await fetch(
  "https://updates.kortyx.io/studio/releases/0.22.0.json",
);
assert.equal(response.status, 200);
const release = await response.json();
assert.equal(release.version, "0.22.0");
assert.equal(
  release.api,
  "ghcr.io/kortyx-io/kortyx-api@sha256:69303e117998aa0035ec2f96eb5b113f5522eacabfb188a25162fb98461cd9d3",
);
await mkdir(cache, { recursive: true });
await writeFile(
  resolve(cache, "package.json"),
  `${JSON.stringify(
    { name: "disposable-kortyx-release-proof", private: true, dependencies },
    null,
    2,
  )}\n`,
);
const locked = await readFile(resolve(cache, "package-lock.json")).then(
  () => true,
  () => false,
);
await promisify(execFile)(
  "npm",
  [
    locked ? "ci" : "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefer-online",
    "--cache",
    "./npm-cache",
    "--registry=https://registry.npmjs.org",
  ],
  { cwd: cache, maxBuffer: 1024 * 1024 },
);
const lock = JSON.parse(await readFile(resolve(cache, "package-lock.json")));
for (const [name, meta] of Object.entries(packages)) {
  assert.equal(lock.packages[`node_modules/${name}`].version, meta.version);
  assert.equal(lock.packages[`node_modules/${name}`].integrity, meta.integrity);
}
await writeFile(
  resolve(cache, "registry-metadata.json"),
  `${JSON.stringify({ packages, release }, null, 2)}\n`,
);
console.log(
  "Verified published SDK 0.32.0, agent 0.39.0, runtime 0.25.0 and Studio 0.22.0 release metadata/integrities",
);
