const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const updateReleasePrBranch = require("../release/update-release-pr-branch.cjs");

test("release recovery describes old commits using the trusted workflow classifier", () => {
  const workflow = readFileSync(
    join(__dirname, "../../workflows/npm-publish.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /run: node \.\/\.github\/automation\/\.github\/scripts\/release\/describe-release\.mjs/,
  );
});

const context = {
  ref: "refs/heads/main",
  repo: { owner: "kortyx-io", repo: "kortyx" },
};

function api({ pulls = [], requestError } = {}) {
  const requests = [];
  const github = {
    paginate: async () => pulls,
    request: async (route, input) => {
      requests.push({ route, input });
      if (requestError) throw requestError;
    },
    rest: { pulls: { list: "pulls.list" } },
  };
  return { github, core: { info() {} }, requests };
}

test("updates the open Release Please pull request with main", async () => {
  const mock = api({ pulls: [{ number: 252, head: { sha: "release-sha" } }] });
  const result = await updateReleasePrBranch({ ...mock, context });

  assert.deepEqual(result, { updated: true, pullNumber: 252 });
  assert.deepEqual(mock.requests, [
    {
      route: "PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch",
      input: {
        owner: "kortyx-io",
        repo: "kortyx",
        pull_number: 252,
        expected_head_sha: "release-sha",
      },
    },
  ]);
});

test("does nothing when there is no open Release Please pull request", async () => {
  const mock = api();
  const result = await updateReleasePrBranch({ ...mock, context });

  assert.deepEqual(result, { updated: false });
  assert.deepEqual(mock.requests, []);
});

for (const message of [
  "Pull Request is not behind the base branch",
  "There are no new commits on the base branch.",
]) {
  test(`accepts an already current Release Please pull request: ${message}`, async () => {
    const error = new Error(message);
    error.status = 422;
    const mock = api({
      pulls: [{ number: 252, head: { sha: "release-sha" } }],
      requestError: error,
    });

    assert.deepEqual(await updateReleasePrBranch({ ...mock, context }), {
      updated: false,
      pullNumber: 252,
    });
  });
}

test("does not hide update failures", async () => {
  const error = new Error("Merge conflict");
  error.status = 422;
  const mock = api({
    pulls: [{ number: 252, head: { sha: "release-sha" } }],
    requestError: error,
  });

  await assert.rejects(
    updateReleasePrBranch({ ...mock, context }),
    /Merge conflict/,
  );
});
