import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const setPackagesOutput = (packages) => {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `packages=${JSON.stringify(packages)}\n`,
    );
  }
};
const releaseCommit = execFileSync(
  "git",
  ["rev-parse", "--verify", `${process.env.RELEASE_COMMIT}^{commit}`],
  { encoding: "utf8" },
).trim();
const releaseSubject = execFileSync(
  "git",
  ["show", "-s", "--format=%s", releaseCommit],
  { encoding: "utf8" },
).trim();
if (!releaseSubject.startsWith("chore: release")) {
  setPackagesOutput([]);
  console.log(
    "Nothing to publish: selected commit is not a release commit " +
      releaseCommit +
      ": " +
      releaseSubject,
  );
  process.exit(0);
}

const releaseConfig = JSON.parse(
  readFileSync(join(root, ".github/release-please/config.json"), "utf8"),
);
const managedDirs = new Set(Object.keys(releaseConfig.packages || {}));
const changedManifests = execFileSync(
  "git",
  [
    "diff",
    "--name-only",
    `${releaseCommit}^1`,
    releaseCommit,
    "--",
    ":(glob)packages/*/package.json",
    ":(glob)providers/*/package.json",
  ],
  { encoding: "utf8" },
)
  .split(/\r?\n/)
  .filter(Boolean);
const releaseDirs = new Set(
  changedManifests.map((manifest) => dirname(manifest)),
);
const unmanagedDirs = [...releaseDirs].filter((dir) => !managedDirs.has(dir));
if (unmanagedDirs.length > 0) {
  throw new Error(
    "Release commit changes unmanaged public package manifests: " +
      unmanagedDirs.join(", "),
  );
}
if (releaseDirs.size === 0) {
  setPackagesOutput([]);
  console.log(
    "Nothing to publish: release commit does not change a public package manifest.",
  );
  process.exit(0);
}

const pkgs = [];
const roots = ["packages", "providers"];
for (const rootDir of roots) {
  const baseDir = join(root, rootDir);
  const entries = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dirName of entries) {
    const relDir = join(rootDir, dirName);
    const pkgPath = join(root, relDir, "package.json");
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    } catch {
      continue;
    }
    if (pkg.private) continue;
    const deps = {
      ...(pkg.dependencies || {}),
      ...(pkg.peerDependencies || {}),
      ...(pkg.optionalDependencies || {}),
    };
    pkgs.push({
      dir: relDir,
      name: pkg.name,
      version: pkg.version,
      deps,
    });
  }
}

const nameToPkg = new Map(pkgs.map((p) => [p.name, p]));
const graph = new Map();
const indeg = new Map();
for (const p of pkgs) {
  graph.set(p.name, []);
  indeg.set(p.name, 0);
}
for (const p of pkgs) {
  const internalDeps = Object.keys(p.deps || {}).filter((n) =>
    nameToPkg.has(n),
  );
  for (const depName of internalDeps) {
    graph.get(depName).push(p.name);
    indeg.set(p.name, indeg.get(p.name) + 1);
  }
}

const queue = [];
for (const [name, deg] of indeg.entries()) {
  if (deg === 0) queue.push(name);
}
const order = [];
while (queue.length) {
  const name = queue.shift();
  order.push(name);
  for (const next of graph.get(name)) {
    indeg.set(next, indeg.get(next) - 1);
    if (indeg.get(next) === 0) queue.push(next);
  }
}
if (order.length !== pkgs.length) {
  console.log(
    "Warning: dependency cycle detected; falling back to directory order.",
  );
  order.length = 0;
  for (const p of pkgs) order.push(p.name);
}

const releasePackages = order
  .map((name) => nameToPkg.get(name))
  .filter((p) => releaseDirs.has(p.dir));
console.log(
  "Release packages: " +
    releasePackages.map((p) => `${p.name}@${p.version}`).join(", "),
);
setPackagesOutput(
  releasePackages.map(({ name, version }) => ({ name, version })),
);

const tag = "latest";
for (const p of releasePackages) {
  const full = `${p.name}@${p.version}`;
  let exists = true;
  try {
    execFileSync("npm", ["view", full, "version"], { stdio: "ignore" });
  } catch {
    exists = false;
  }
  if (exists) {
    console.log(`Skipping ${full} (already on npm)`);
    continue;
  }
  const selector = `./${p.dir}`;
  console.log(`Publishing ${full} from ${selector}...`);
  execFileSync(
    "pnpm",
    [
      "publish",
      "--provenance",
      "--access",
      "public",
      "--tag",
      tag,
      "--no-git-checks",
    ],
    { stdio: "inherit", cwd: join(root, p.dir) },
  );
}
