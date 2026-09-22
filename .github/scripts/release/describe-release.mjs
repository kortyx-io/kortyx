import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const commit = execFileSync(
  "git",
  ["rev-parse", "--verify", `${process.env.RELEASE_COMMIT}^{commit}`],
  { encoding: "utf8" },
).trim();
const subject = execFileSync("git", ["show", "-s", "--format=%s", commit], {
  encoding: "utf8",
}).trim();
const config = JSON.parse(
  readFileSync(".github/release-please/config.json", "utf8"),
);
const changed = new Set(
  execFileSync("git", ["diff", "--name-only", `${commit}^1`, commit], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean),
);
const paths = Object.keys(config.packages || {}).filter((path) =>
  changed.has(`${path}/package.json`),
);
const release = subject.startsWith("chore: release") && paths.length > 0;
const versionAt = (path) =>
  paths.includes(path)
    ? JSON.parse(readFileSync(join(path, "package.json"), "utf8")).version
    : "";
const outputs = {
  commit,
  release: String(release),
  paths: JSON.stringify(paths),
  studio_version: versionAt("apps/studio"),
  website_version: versionAt("apps/website"),
};

for (const [name, value] of Object.entries(outputs)) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
console.log(JSON.stringify(outputs, null, 2));
