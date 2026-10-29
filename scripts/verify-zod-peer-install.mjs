import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(join(root, "package.json"));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const workspace = new Map();
for (const parent of ["packages", "providers"]) {
  for (const entry of readdirSync(join(root, parent), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, parent, entry.name);
    const manifest = readJson(join(path, "package.json"));
    workspace.set(manifest.name, { path, manifest });
  }
}
const packages = new Map();
function include(name) {
  if (packages.has(name)) return;
  const entry = workspace.get(name);
  assert(entry, `Missing workspace package ${name}`);
  packages.set(name, entry);
  for (const [dependency, range] of Object.entries(
    entry.manifest.dependencies ?? {},
  )) {
    if (range.startsWith("workspace:")) include(dependency);
  }
}
include("kortyx");
include("@kortyx/openrouter");

function run(command, args, cwd) {
  const env = { ...process.env, KORTYX_USAGE_TELEMETRY_DISABLED: "1" };
  // pnpm run exports the repository's workspaces=true setting to child npm.
  // Temporary consumers are independent projects, not workspace commands.
  for (const key of Object.keys(env)) {
    if (/^npm_config_(workspace|workspaces|include_workspace_root)$/i.test(key))
      delete env[key];
  }
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      env,
    });
  } catch (error) {
    console.error(error.stdout?.toString(), error.stderr?.toString());
    throw error;
  }
}

const directory = mkdtempSync(join(tmpdir(), "kortyx-zod-peer-"));
try {
  const archives = join(directory, "archives");
  mkdirSync(archives);
  const dependencies = {};
  for (const [name, { path, manifest }] of packages) {
    run("pnpm", ["pack", "--pack-destination", archives], path);
    const filename = `${name.replace(/^@/, "").replaceAll("/", "-")}-${manifest.version}.tgz`;
    dependencies[name] = `file:${join(archives, filename)}`;
  }
  const current = require(
    require.resolve("zod/package.json", {
      paths: [join(root, "packages/core")],
    }),
  ).version;
  for (const version of new Set(["4.5.0", current])) {
    const consumer = join(directory, version);
    mkdirSync(consumer);
    writeFileSync(
      join(consumer, "package.json"),
      JSON.stringify({
        name: "kortyx-zod-peer-consumer",
        private: true,
        dependencies: { ...dependencies, zod: version },
        overrides: dependencies,
      }),
    );
    // Strict peer resolution must succeed without an override for Zod.
    run(
      "npm",
      [
        "install",
        "--strict-peer-deps",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ],
      consumer,
    );
    run("npm", ["ls", "zod", "--all"], consumer);
    const consumerRequire = createRequire(join(consumer, "package.json"));
    const resolved = consumerRequire.resolve("zod");
    for (const [name, { manifest }] of packages) {
      if (!manifest.peerDependencies?.zod) continue;
      const sdkRequire = createRequire(consumerRequire.resolve(name));
      assert.equal(
        sdkRequire.resolve("zod"),
        resolved,
        `${name} must share Zod`,
      );
    }
    copyFileSync(
      join(root, "scripts/support/zod-peer-consumer.ts"),
      join(consumer, "main.ts"),
    );
    writeFileSync(
      join(consumer, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck: true,
          outDir: "dist",
          typeRoots: [join(root, "node_modules/@types")],
          types: ["node"],
        },
        include: ["main.ts"],
      }),
    );
    run(
      process.execPath,
      [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"],
      consumer,
    );
    run(process.execPath, ["dist/main.js"], consumer);
    console.log(`PASS packed consumer with shared Zod ${version}`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
