const assert = require("node:assert/strict");
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const {
  latestReports,
  prepareReports,
} = require("../ci/prepare-blob-reports.cjs");

test("partial retries retain untouched shards but select only the latest rerun", () => {
  assert.deepEqual(
    latestReports([
      "studio-playwright-blob-standard-0-1",
      "studio-playwright-blob-production-11-10",
      "studio-playwright-blob-production-11-1",
      "studio-playwright-blob-production-11-2",
      "studio-playwright-blob-reviews-8-1",
    ]),
    [
      "studio-playwright-blob-production-11-10",
      "studio-playwright-blob-reviews-8-1",
      "studio-playwright-blob-standard-0-1",
    ],
  );
});
test("missing or unexpected report names fail closed", () => {
  assert.throws(() => latestReports([]), /No Playwright/);
  assert.throws(() => latestReports(["../report.zip"]), /Unexpected/);
});
test("same filenames from different shards cannot overwrite each other", () => {
  const root = mkdtempSync(join(tmpdir(), "kortyx-blob-reports-"));
  try {
    const input = join(root, "input"),
      output = join(root, "output");
    mkdirSync(input);
    const reports = {
      "studio-playwright-blob-production-11-1": "superseded failure",
      "studio-playwright-blob-production-11-2": "passing retry",
      "studio-playwright-blob-production-12-1": "untouched shard",
    };
    for (const [name, data] of Object.entries(reports)) {
      mkdirSync(join(input, name));
      writeFileSync(join(input, name, "report.zip"), data);
    }
    prepareReports(input, output);
    assert.equal(readdirSync(output).length, 2);
    assert.equal(
      readFileSync(
        join(output, "studio-playwright-blob-production-11-2-report.zip"),
        "utf8",
      ),
      "passing retry",
    );
    assert.equal(
      readFileSync(
        join(output, "studio-playwright-blob-production-12-1-report.zip"),
        "utf8",
      ),
      "untouched shard",
    );
    assert.equal(
      readFileSync(
        join(input, "studio-playwright-blob-production-11-1/report.zip"),
        "utf8",
      ),
      "superseded failure",
    );
    assert.throws(() => prepareReports(input, output), /EEXIST/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("an artifact without a blob fails rather than silently dropping its shard", () => {
  const root = mkdtempSync(join(tmpdir(), "kortyx-blob-empty-"));
  try {
    mkdirSync(join(root, "studio-playwright-blob-standard-0-1"));
    assert.throws(() => prepareReports(root, join(root, "out")), /No blob ZIP/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("CI isolates artifact downloads before preparing the merge input", () => {
  const workflow = readFileSync(
    join(__dirname, "../../workflows/ci.yml"),
    "utf8",
  );
  assert.match(workflow, /merge-multiple: false/);
  assert.match(
    workflow,
    /prepare-blob-reports.cjs downloaded-blob-reports all-blob-reports/,
  );
});
