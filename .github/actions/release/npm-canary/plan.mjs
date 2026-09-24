import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const root = process.cwd();
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const output = (name, value) => {
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};
const normalize = (path) => path.split(sep).join("/");

const base = git(
  "rev-parse",
  "--verify",
  `${required("CANARY_BASE_SHA")}^{commit}`,
);
const head = git(
  "rev-parse",
  "--verify",
  `${required("CANARY_HEAD_SHA")}^{commit}`,
);
const pr = required("CANARY_PR_NUMBER");
const run = required("CANARY_RUN_NUMBER");
const attempt = required("CANARY_RUN_ATTEMPT");
if (!/^\d+$/.test(pr) || !/^\d+$/.test(run) || !/^\d+$/.test(attempt))
  throw new Error(
    "Canary PR, run, and attempt values must be positive integers.",
  );

const config = JSON.parse(
  readFileSync(join(root, ".github/release-please/config.json"), "utf8"),
);
const workspacePlugin = (config.plugins ?? []).find(
  (plugin) =>
    plugin === "node-workspace" ||
    (plugin && typeof plugin === "object" && plugin.type === "node-workspace"),
);
if (!workspacePlugin)
  throw new Error("Release Please must configure the node-workspace plugin.");
const includePeers =
  typeof workspacePlugin === "object" &&
  workspacePlugin.updatePeerDependencies === true;
const dependencyKinds = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  ...(includePeers ? ["peerDependencies"] : []),
];

const managed = [];
for (const dir of Object.keys(config.packages ?? {})) {
  const manifestPath = join(root, dir, "package.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  managed.push({
    dir: normalize(dir),
    manifestPath,
    manifest,
    name: manifest.name,
    version: manifest.version,
    publishable:
      manifest.private !== true &&
      (dir.startsWith("packages/") || dir.startsWith("providers/")),
  });
}
const managedByName = new Map(managed.map((pkg) => [pkg.name, pkg]));
const changedFiles = git("diff", "--name-only", `${base}...${head}`)
  .split(/\r?\n/)
  .filter(Boolean);
const directManaged = new Set();
for (const pkg of managed) {
  if (
    changedFiles.some(
      (file) => file === pkg.dir || file.startsWith(`${pkg.dir}/`),
    )
  )
    directManaged.add(pkg.name);
}

const affected = new Set(directManaged);
const reasons = new Map([...directManaged].map((name) => [name, ["changed"]]));
let added = true;
while (added) {
  added = false;
  for (const pkg of managed) {
    if (affected.has(pkg.name)) continue;
    const dependencies = dependencyKinds.flatMap((kind) =>
      Object.keys(pkg.manifest[kind] ?? {}),
    );
    const changedDependency = dependencies.find((name) => affected.has(name));
    if (!changedDependency) continue;
    affected.add(pkg.name);
    reasons.set(pkg.name, [`depends on ${changedDependency}`]);
    added = true;
  }
}

const publishable = managed.filter(
  (pkg) => pkg.publishable && affected.has(pkg.name),
);
const publishableNames = new Set(publishable.map((pkg) => pkg.name));
const graph = new Map(publishable.map((pkg) => [pkg.name, []]));
const indegree = new Map(publishable.map((pkg) => [pkg.name, 0]));
for (const pkg of publishable) {
  const dependencies = new Set(
    dependencyKinds.flatMap((kind) => Object.keys(pkg.manifest[kind] ?? {})),
  );
  for (const dependency of dependencies) {
    if (!publishableNames.has(dependency)) continue;
    graph.get(dependency).push(pkg.name);
    indegree.set(pkg.name, indegree.get(pkg.name) + 1);
  }
}
const queue = [...indegree]
  .filter(([, degree]) => degree === 0)
  .map(([name]) => name)
  .sort();
const order = [];
while (queue.length > 0) {
  const name = queue.shift();
  order.push(name);
  for (const dependent of graph.get(name).sort()) {
    indegree.set(dependent, indegree.get(dependent) - 1);
    if (indegree.get(dependent) === 0) {
      queue.push(dependent);
      queue.sort();
    }
  }
}
if (order.length !== publishable.length)
  throw new Error("Canary package dependency graph contains a cycle.");

const nextCanaryVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match)
    throw new Error(`Cannot derive a canary version from ${version}.`);
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}-canary.pr${pr}.${head.slice(0, 8)}.${run}.${attempt}`;
};
const packages = order.map((name) => {
  const pkg = managedByName.get(name);
  return {
    dir: pkg.dir,
    name,
    currentVersion: pkg.version,
    version: nextCanaryVersion(pkg.version),
    direct: directManaged.has(name),
    reason: reasons.get(name)?.[0] ?? "dependency closure",
  };
});

const turboAffectedPath = process.env.CANARY_TURBO_AFFECTED;
let turboNames = new Set();
if (turboAffectedPath && existsSync(turboAffectedPath)) {
  const turbo = JSON.parse(readFileSync(turboAffectedPath, "utf8"));
  turboNames = new Set((turbo.packages?.items ?? []).map((item) => item.name));
}
const studioAffected =
  turboNames.has("kortyx-studio") ||
  turboNames.has("@kortyx/api") ||
  affected.has("kortyx-studio");
const websiteAffected =
  turboNames.has("kortyx-website") || affected.has("kortyx-website");
const tag = `pr-${pr}`;
const plan = {
  schemaVersion: 1,
  pr: Number(pr),
  base,
  head,
  tag,
  packages,
  applications: {
    studio: studioAffected,
    website: websiteAffected,
  },
};

const planPath = resolve(
  process.env.CANARY_PLAN_PATH ||
    join(process.env.RUNNER_TEMP || root, "canary-plan.json"),
);
mkdirSync(dirname(planPath), { recursive: true });
writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

if (process.env.CANARY_APPLY === "true") {
  const versions = new Map(packages.map((pkg) => [pkg.name, pkg.version]));
  for (const item of packages) {
    const pkg = managedByName.get(item.name);
    const manifest = structuredClone(pkg.manifest);
    manifest.version = item.version;
    for (const kind of dependencyKinds) {
      for (const [name, spec] of Object.entries(manifest[kind] ?? {})) {
        const version = versions.get(name);
        if (!version || String(spec).startsWith("workspace:")) continue;
        manifest[kind][name] = version;
      }
    }
    writeFileSync(pkg.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

output("plan", planPath);
output("packages", JSON.stringify(packages));
output("has_packages", packages.length > 0 ? "true" : "false");
output("tag", tag);
output("studio", studioAffected ? "true" : "false");
output("website", websiteAffected ? "true" : "false");

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `## Canary plan for PR #${pr}`,
    "",
    `Source: \`${head}\``,
    `npm dist-tag: \`${tag}\``,
    "",
    "### npm packages",
    "",
    ...(packages.length > 0
      ? packages.map(
          (pkg) =>
            `- \`${pkg.name}@${pkg.version}\` — ${pkg.reason}${pkg.direct ? " (direct)" : ""}`,
        )
      : ["No public npm packages are affected."]),
    "",
    "### Applications",
    "",
    `- Website preview: ${websiteAffected ? "affected; owned by Website / Preview" : "not affected"}`,
    `- Studio/API preview: ${studioAffected ? "affected; container preview required (not npm)" : "not affected"}`,
    "",
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}
