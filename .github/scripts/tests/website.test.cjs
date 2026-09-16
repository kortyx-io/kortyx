const assert = require("node:assert/strict");
const test = require("node:test");
const detect = require("../website/detect-changes.cjs");
const comment = require("../website/preview-comment.cjs");
const remove = require("../website/remove-preview-comment.cjs");
const context = {
  repo: { owner: "kortyx-io", repo: "kortyx" },
  issue: { number: 42 },
};

function api({ files = [], comments = [] } = {}) {
  const calls = [];
  const github = {
    paginate: async (method) => (method === "files" ? files : comments),
    rest: {
      pulls: { listFiles: "files" },
      issues: {
        listComments: "comments",
        updateComment: async (input) => calls.push({ type: "update", input }),
        createComment: async (input) => calls.push({ type: "create", input }),
      },
    },
  };
  return { github, context, core: { info() {} }, calls };
}

test("website changes include shared automation and root build inputs", async () => {
  for (const filename of [
    "apps/website/src/app/page.tsx",
    "pnpm-lock.yaml",
    ".github/actions/deployment/coolify/deploy.sh",
    ".github/scripts/website/verify-preview.sh",
    ".github/workflows/website-preview.yml",
  ]) {
    assert.equal(
      await detect(api({ files: [{ filename }] })),
      "true",
      filename,
    );
  }
  assert.equal(
    await detect(api({ files: [{ filename: "packages/core/src/index.ts" }] })),
    "false",
  );
});

test("preview publication updates the existing bot comment", async () => {
  const mock = api({
    comments: [
      {
        id: 7,
        user: { login: "github-actions[bot]" },
        body: "<!-- kortyx-website-preview -->",
      },
    ],
  });
  process.env.PREVIEW_URL = "https://pr-42.kortyx.dev";
  await comment(mock);
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].type, "update");
  assert.equal(mock.calls[0].input.comment_id, 7);
  assert.ok(mock.calls[0].input.body.includes(process.env.PREVIEW_URL));
});

test("preview publication creates a comment when none exists", async () => {
  const mock = api();
  await comment(mock);
  assert.equal(mock.calls[0].type, "create");
  assert.equal(mock.calls[0].input.issue_number, 42);
});

test("cleanup updates only the preview bot comment and creates nothing", async () => {
  const empty = api();
  await remove(empty);
  assert.equal(empty.calls.length, 0);
  const mock = api({
    comments: [
      {
        id: 7,
        user: { login: "github-actions[bot]" },
        body: "<!-- kortyx-website-preview -->",
      },
    ],
  });
  await remove(mock);
  assert.equal(mock.calls[0].type, "update");
  assert.equal(
    mock.calls[0].input.body,
    "<!-- kortyx-website-preview -->\nWebsite preview removed.",
  );
});
