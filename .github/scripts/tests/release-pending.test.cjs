const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const check = require("../release/check-pending-releases.cjs");

function fixture({ ci, release, merged = true, branch = "main", issues } = {}) {
  const calls = [],
    errors = [],
    failures = [],
    notices = [];
  const summary = {
    addHeading() {
      return this;
    },
    addRaw() {
      return this;
    },
    async write() {},
  };
  return {
    calls,
    errors,
    failures,
    notices,
    context: {
      repo: { owner: "kortyx-io", repo: "kortyx" },
      payload: { repository: { default_branch: "main" } },
    },
    core: {
      error: (value) => errors.push(value),
      notice: (value) => notices.push(value),
      setFailed: (value) => failures.push(value),
      summary,
    },
    github: {
      paginate: async () => issues ?? [{ number: 330, pull_request: {} }],
      rest: {
        issues: { listForRepo: "issues" },
        pulls: {
          get: async () => ({
            data: {
              number: 330,
              merged_at: merged ? "today" : null,
              base: { ref: branch },
              merge_commit_sha: "exact-sha",
              html_url: "https://github.com/kortyx-io/kortyx/pull/330",
            },
          }),
        },
        actions: {
          listWorkflowRuns: async (args) => {
            calls.push(args);
            const run = args.workflow_id === "ci.yml" ? ci : release;
            return { data: { workflow_runs: run ? [run] : [] } };
          },
        },
      },
    },
  };
}
const success = { status: "completed", conclusion: "success" };
const failure = { status: "completed", conclusion: "failure" };
const active = { status: "in_progress", conclusion: null };

test("failed release CI makes preparation fail with exact-commit recovery", async () => {
  const f = fixture({
    ci: failure,
    release: { status: "completed", conclusion: "skipped" },
  });
  assert.deepEqual(await check(f), [330]);
  assert.equal(f.failures.length, 1);
  assert.match(f.errors[0], /release_commit=exact-sha/);
  assert.match(f.errors[0], /Do not remove the pending label to bypass CI/);
  assert.match(f.errors[0], /recover-unpublished-release\.md/);
  assert.ok(
    f.calls.every(
      (call) => call.head_sha === "exact-sha" && call.branch === "main",
    ),
  );
  assert.equal(f.calls[0].event, "push");
});
for (const [name, options] of Object.entries({
  "CI running": { ci: active },
  "publication running": { ci: success, release: active },
})) {
  test(`normal release in flight is reported, not failed: ${name}`, async () => {
    const f = fixture(options);
    assert.deepEqual(await check(f), []);
    assert.equal(f.failures.length, 0);
    assert.equal(f.notices.length, 1);
  });
}
for (const [name, options] of Object.entries({
  "missing CI": {},
  "missing orchestration": { ci: success },
  "failed publication": { ci: success, release: failure },
  "unexpected pending label after success": { ci: success, release: success },
  "cancelled CI": { ci: { status: "completed", conclusion: "cancelled" } },
})) {
  test(`does not silently pass a blocked release: ${name}`, async () => {
    const f = fixture(options);
    assert.deepEqual(await check(f), [330]);
    assert.equal(f.failures.length, 1);
  });
}
for (const options of [
  { merged: false },
  { branch: "other" },
  { issues: [] },
  { issues: [{ number: 1 }] },
]) {
  test(`ignores unrelated or absent release PRs: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    assert.deepEqual(await check(f), []);
    assert.equal(f.calls.length, 0);
  });
}
test("API errors fail closed instead of hiding a release blocker", async () => {
  const f = fixture();
  f.github.paginate = async () => {
    throw new Error("API unavailable");
  };
  await assert.rejects(check(f), /API unavailable/);
});
test("workflow reports failed release CI and resumes PR preparation after recovery", () => {
  const workflow = readFileSync(
    join(__dirname, "../../workflows/npm-publish.yml"),
    "utf8",
  );
  const prepare = workflow.split("  publication_preflight:")[0];
  assert.doesNotMatch(prepare, /workflow_run.conclusion == 'success'/);
  assert.ok(
    prepare.indexOf("Describe release commit") <
      prepare.indexOf("Require successful CI"),
  );
  assert.match(
    prepare,
    /steps.release.outputs.release == 'true' \|\| github.event_name == 'workflow_dispatch'/,
  );
  assert.match(prepare, /require-ci.sh/);
  const next = readFileSync(
    join(__dirname, "../../workflows/release-prepare.yml"),
    "utf8",
  );
  assert.match(next, /workflows: \[Release \/ Orchestrate\]/);
  assert.ok(
    next.indexOf("Check unfinished merged releases") <
      next.indexOf("Release Please (stable)"),
  );
});
