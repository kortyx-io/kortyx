import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const docsRoot = path.join(appRoot, "src", "docs");
const outputDir = path.join(appRoot, "generated");
const outputFile = path.join(outputDir, "docs-last-updated.json");

const toPosixPath = (input) => input.split(path.sep).join(path.posix.sep);

const walkMarkdownFiles = (dirPath) => {
  const files = [];

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
};

const canReadGitHistory = () => {
  try {
    if (!existsSync(path.join(repoRoot, ".git"))) return false;
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

const readLastUpdatedFromGit = (absolutePath) => {
  try {
    const relativePath = path.relative(repoRoot, absolutePath);
    const output = execFileSync(
      "git",
      ["log", "-1", "--follow", "--format=%cI", "--", relativePath],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    ).trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
};

const writeManifest = (manifest) => {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
};

const writeLog = (message) => {
  process.stdout.write(`${message}\n`);
};

if (!canReadGitHistory()) {
  if (existsSync(outputFile)) {
    writeLog(`[docs-last-updated] Using existing manifest at ${outputFile}`);
    process.exit(0);
  }

  writeManifest({
    generatedAt: new Date().toISOString(),
    docs: {},
  });
  writeLog(
    `[docs-last-updated] Git history unavailable. Wrote empty manifest to ${outputFile}`,
  );
  process.exit(0);
}

const docs = {};
for (const filePath of walkMarkdownFiles(docsRoot)) {
  const relativePath = toPosixPath(path.relative(docsRoot, filePath));
  const updatedAt = readLastUpdatedFromGit(filePath);
  if (!updatedAt) continue;
  docs[relativePath] = updatedAt;
}

writeManifest({
  generatedAt: new Date().toISOString(),
  docs,
});

writeLog(
  `[docs-last-updated] Wrote ${Object.keys(docs).length} entries to ${outputFile}`,
);
