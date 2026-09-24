import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const planInput = process.env.CANARY_PLAN_PATH?.trim();
const artifactInput = process.env.CANARY_ARTIFACT_DIR?.trim();
if (!planInput || !artifactInput)
  throw new Error("CANARY_PLAN_PATH and CANARY_ARTIFACT_DIR are required.");
const planPath = resolve(planInput);
const artifactDir = resolve(artifactInput);
const plan = JSON.parse(readFileSync(planPath, "utf8"));
mkdirSync(artifactDir, { recursive: true });

const packages = [];
for (const pkg of plan.packages) {
  const filename = `${pkg.name.replace(/^@/, "").replaceAll("/", "-")}-${pkg.version}.tgz`;
  const tarball = join(artifactDir, filename);
  execFileSync("pnpm", ["pack", "--out", tarball], {
    cwd: join(root, pkg.dir),
    stdio: "inherit",
  });
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
  const sha256 = createHash("sha256")
    .update(readFileSync(tarball))
    .digest("hex");
  packages.push({
    name: pkg.name,
    version: pkg.version,
    tarball: basename(tarball),
    sha256,
  });
}

const manifest = {
  schemaVersion: 1,
  pr: plan.pr,
  head: plan.head,
  tag: plan.tag,
  packages,
};
writeFileSync(
  join(artifactDir, "canary-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
