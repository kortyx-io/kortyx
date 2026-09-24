import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { packageMetadata } from "../npm-publish/registry.mjs";

const artifactInput = process.env.CANARY_ARTIFACT_DIR?.trim();
if (!artifactInput) throw new Error("CANARY_ARTIFACT_DIR is required.");
const artifactDir = resolve(artifactInput);
const manifest = JSON.parse(
  readFileSync(join(artifactDir, "canary-manifest.json"), "utf8"),
);
const expectedPr = Number(process.env.CANARY_PR_NUMBER);
const expectedHead = process.env.CANARY_HEAD_SHA;
if (
  manifest.schemaVersion !== 1 ||
  manifest.pr !== expectedPr ||
  manifest.head !== expectedHead ||
  manifest.tag !== `pr-${expectedPr}`
)
  throw new Error(
    "Canary artifact identity does not match this workflow request.",
  );
if (!Array.isArray(manifest.packages) || manifest.packages.length === 0)
  throw new Error("Canary artifact manifest contains no packages.");

const releaseConfig = JSON.parse(
  readFileSync(
    join(process.cwd(), ".github/release-please/config.json"),
    "utf8",
  ),
);
const allowedPackages = new Set(
  Object.entries(releaseConfig.packages ?? {})
    .filter(
      ([directory]) =>
        directory.startsWith("packages/") || directory.startsWith("providers/"),
    )
    .map(([, settings]) => settings?.["package-name"])
    .filter(Boolean),
);
const seenNames = new Set();
const seenTarballs = new Set();
const escapedHead = expectedHead
  .slice(0, 8)
  .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const expectedVersion = new RegExp(
  `^\\d+\\.\\d+\\.\\d+-canary\\.pr${expectedPr}\\.${escapedHead}\\.[1-9]\\d*\\.[1-9]\\d*$`,
);

for (const pkg of manifest.packages) {
  if (!allowedPackages.has(pkg.name))
    throw new Error(`${pkg.name} is not a trusted publishable package.`);
  if (seenNames.has(pkg.name))
    throw new Error(`Duplicate canary package ${pkg.name}.`);
  if (
    typeof pkg.tarball !== "string" ||
    basename(pkg.tarball) !== pkg.tarball ||
    !pkg.tarball.endsWith(".tgz") ||
    seenTarballs.has(pkg.tarball)
  )
    throw new Error(`Invalid canary tarball path for ${pkg.name}.`);
  if (typeof pkg.version !== "string" || !expectedVersion.test(pkg.version))
    throw new Error(`Invalid canary version for ${pkg.name}: ${pkg.version}.`);
  if (typeof pkg.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(pkg.sha256))
    throw new Error(`Invalid canary checksum for ${pkg.name}.`);
  seenNames.add(pkg.name);
  seenTarballs.add(pkg.tarball);
  const tarball = join(artifactDir, pkg.tarball);
  const sha256 = createHash("sha256")
    .update(readFileSync(tarball))
    .digest("hex");
  if (sha256 !== pkg.sha256)
    throw new Error(`Canary artifact checksum mismatch for ${pkg.name}.`);
  const packedManifest = JSON.parse(
    execFileSync("tar", ["-xOf", tarball, "package/package.json"], {
      encoding: "utf8",
    }),
  );
  if (
    packedManifest.name !== pkg.name ||
    packedManifest.version !== pkg.version
  )
    throw new Error(`Packed identity mismatch for ${pkg.name}.`);
  for (const kind of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, spec] of Object.entries(packedManifest[kind] ?? {})) {
      if (/^(workspace:|catalog:)/.test(String(spec)))
        throw new Error(
          `${pkg.name} packed unresolved ${kind} entry ${name}: ${spec}`,
        );
    }
  }
  const metadata = await packageMetadata(pkg.name);
  if (metadata?.versions?.[pkg.version])
    throw new Error(`${pkg.name}@${pkg.version} already exists on npm.`);
  execFileSync(
    "npm",
    [
      "publish",
      tarball,
      "--provenance",
      "--access",
      "public",
      "--tag",
      manifest.tag,
    ],
    { stdio: "inherit" },
  );
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `packages=${JSON.stringify(manifest.packages.map(({ name, version }) => ({ name, version })))}\n`,
  );
  appendFileSync(process.env.GITHUB_OUTPUT, `tag=${manifest.tag}\n`);
}
