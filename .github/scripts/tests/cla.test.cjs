const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const {
  loadAgreement,
  statement,
  contributors,
  run,
} = require("../cla/check.cjs");
const root = resolve(__dirname, "../../..");
const config = loadAgreement(root);
const alice = { id: 123, login: "alice", type: "User" };
const bob = { id: 456, login: "bob", type: "User" };
const notFound = () => Object.assign(new Error("not found"), { status: 404 });

function fixture() {
  const state = {
    pr: {
      number: 7,
      state: "open",
      commits: 1,
      user: alice,
      head: { sha: "a".repeat(40) },
      base: { sha: "b".repeat(40) },
    },
    commits: [
      {
        sha: "a".repeat(40),
        author: alice,
        commit: { message: "A contribution" },
      },
    ],
    comments: [],
    ledger: new Map(),
    statuses: [],
    failures: [],
    branch: false,
    trees: new Map(),
  };
  const github = {
    rest: { repos: {}, pulls: {}, issues: {}, users: {}, git: {} },
    paginate: async (fn, params) => (await fn(params)).data,
  };
  github.rest.pulls.get = async () => ({ data: structuredClone(state.pr) });
  github.rest.pulls.listCommits = async () => ({ data: state.commits });
  github.rest.issues.listComments = async () => ({ data: state.comments });
  github.rest.issues.createComment = async ({ body }) =>
    state.comments.push({ id: 99, body, user: { id: 41898282, type: "Bot" } });
  github.rest.issues.updateComment = async ({ comment_id, body }) => {
    state.comments.find((comment) => comment.id === comment_id).body = body;
  };
  github.rest.users.getByUsername = async ({ username }) => {
    const user = [alice, bob].find((person) => person.login === username);
    if (!user) throw notFound();
    return { data: user };
  };
  github.rest.repos.createCommitStatus = async (data) =>
    state.statuses.push(data);
  github.rest.repos.getContent = async ({ path }) => {
    if (!state.ledger.has(path)) throw notFound();
    return {
      data: {
        type: "file",
        encoding: "base64",
        content: Buffer.from(state.ledger.get(path)).toString("base64"),
      },
    };
  };
  github.rest.repos.createOrUpdateFileContents = async ({
    path,
    content,
    sha,
  }) => {
    assert.equal(sha, undefined, "never overwrite evidence");
    if (state.ledger.has(path))
      throw Object.assign(new Error("conflict"), { status: 422 });
    state.ledger.set(path, Buffer.from(content, "base64").toString());
  };
  github.rest.git.getRef = async () => {
    if (!state.branch) throw notFound();
    return { data: {} };
  };
  github.rest.git.createTree = async ({ tree }) => {
    state.trees.set("tree", tree);
    return { data: { sha: "tree" } };
  };
  github.rest.git.createCommit = async ({ parents }) => {
    assert.deepEqual(parents, []);
    return { data: { sha: "commit" } };
  };
  github.rest.git.createRef = async () => {
    state.branch = true;
    for (const entry of state.trees.get("tree"))
      state.ledger.set(entry.path, entry.content);
  };
  const context = {
    repo: { owner: "kortyx-io", repo: "kortyx" },
    payload: { pull_request: { number: 7 } },
    sha: "c".repeat(40),
    runId: 42,
  };
  const core = { setFailed: (message) => state.failures.push(message) };
  const check = () => run({ github, context, core, root });
  const sign = (user = alice, overrides = {}) =>
    state.comments.push({
      id: user.id + 1000,
      user,
      body: statement(config),
      html_url: "https://github.com/kortyx-io/kortyx/pull/7#issuecomment-1",
      created_at: "2026-10-12T10:00:00Z",
      updated_at: "2026-10-12T10:00:00Z",
      ...overrides,
    });
  return { state, github, context, core, check, sign };
}

test("published v1 bytes remain frozen; configuration drift fails", () => {
  assert.equal(
    config.sha256,
    "82d661e5d9db2de309782ea842b7797f86c0c9ad0e36e27dd65378cc610a6bdb",
  );
  const dir = mkdtempSync(join(tmpdir(), "cla-test-"));
  try {
    mkdirSync(join(dir, ".github/cla"), { recursive: true });
    writeFileSync(join(dir, ".github/cla/config.json"), JSON.stringify(config));
    writeFileSync(join(dir, config.document), "changed");
    assert.throws(() => loadAgreement(dir), /hash/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("unsigned PR fails with exact signing instructions and pinned agreement URL", async () => {
  const f = fixture();
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "failure");
  assert.equal(f.state.ledger.size, 0);
  assert.ok(
    f.state.comments[0].body.includes(
      `/blob/${f.context.sha}/.github/cla/1.0.md`,
    ),
  );
  assert.ok(f.state.comments[0].body.includes(statement(config)));
});

test("personal assent creates a separate ledger, is idempotent, survives rename/comment deletion", async () => {
  const f = fixture();
  f.sign();
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "success");
  const original = f.state.ledger.get("1.0/123.json");
  const evidence = JSON.parse(original);
  assert.equal(evidence.user.id, 123);
  assert.equal(evidence.sha256, config.sha256);
  assert.equal(evidence.agreementCommit, f.context.sha);
  assert.equal(evidence.commentId, 1123);
  f.state.comments = [];
  f.state.pr.user = { ...alice, login: "renamed" };
  f.state.commits[0].author = f.state.pr.user;
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "success");
  assert.equal(f.state.ledger.get("1.0/123.json"), original);
  f.state.pr.user = { ...alice, id: 999 };
  f.state.commits[0].author = f.state.pr.user;
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "failure");
});

test("quotes, edits, wrong hashes, bots and non-contributor comments never sign", async () => {
  for (const overrides of [
    { body: `> ${statement(config)}` },
    { updated_at: "2026-10-12T10:01:00Z" },
    { body: statement(config).replace(config.sha256, "0".repeat(64)) },
    { user: { ...alice, type: "Bot" } },
    { user: bob },
  ]) {
    const f = fixture();
    f.sign(alice, overrides);
    await f.check();
    assert.equal(f.state.ledger.size, 0);
    assert.equal(f.state.statuses.at(-1).state, "failure");
  }
});

test("all commit authors and co-authors need assent, not just PR opener", async () => {
  const f = fixture();
  f.sign();
  f.state.commits[0].commit.message +=
    "\n\nCo-authored-by: Bob <456+bob@users.noreply.github.com>";
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "failure");
  f.sign(bob);
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "success");
  f.state.commits[0].author = { id: 789, login: "other", type: "User" };
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "failure");
});

test("unresolved, forged and private-email co-authors fail without disclosing emails", async () => {
  for (const trailer of [
    "Co-authored-by: Bob <bob@private.example>",
    "Co-authored-by: Bob <123+bob@users.noreply.github.com>",
    "Co-authored-by: ???",
  ]) {
    const f = fixture();
    f.sign();
    f.state.commits[0].commit.message += `\n${trailer}`;
    await f.check();
    assert.equal(f.state.statuses.at(-1).state, "failure");
    assert.ok(!f.state.comments.at(-1).body.includes("bob@private.example"));
  }
  const f = fixture();
  f.sign();
  f.state.commits[0].author = null;
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "failure");
});

test("only exact configured Bot identities are exempt; human signatures still required", async () => {
  const f = fixture();
  const bot = { ...config.automationAccounts[0], type: "Bot" };
  f.state.pr.user = bot;
  f.state.commits[0].author = bot;
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "success");
  f.state.commits[0].author = alice;
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "failure");
  for (const fake of [
    { ...bot, id: 998 },
    { ...bot, type: "User" },
  ]) {
    f.state.pr.user = fake;
    f.state.commits[0].author = fake;
    await f.check();
    assert.equal(f.state.statuses.at(-1).state, "failure");
  }
});

test("commit limits, incomplete listings, API errors and corrupt evidence fail closed", async () => {
  for (const count of [251, 2]) {
    const f = fixture();
    f.state.pr.commits = count;
    await assert.rejects(
      contributors(f.github, f.context.repo, f.state.pr, config),
    );
    await f.check();
    assert.equal(f.state.statuses.at(-1).state, "failure");
  }
  const f = fixture();
  f.sign();
  await f.check();
  f.state.ledger.set("1.0/123.json", "{}");
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "failure");
  f.github.rest.repos.getContent = async () => {
    throw Object.assign(new Error("secret API response"), { status: 403 });
  };
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "failure");
  assert.ok(f.state.failures.every((message) => !message.includes("secret")));
});

test("concurrent creation retries without overwriting and later users append", async () => {
  const f = fixture();
  f.state.branch = true;
  f.sign();
  const create = f.github.rest.repos.createOrUpdateFileContents;
  let first = true;
  f.github.rest.repos.createOrUpdateFileContents = async (args) => {
    if (first) {
      first = false;
      throw Object.assign(new Error("conflict"), { status: 409 });
    }
    return create(args);
  };
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "success");
  const old = f.state.ledger.get("1.0/123.json");
  f.state.pr.user = bob;
  f.state.commits[0].author = bob;
  f.sign(bob);
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "success");
  assert.equal(f.state.ledger.size, 2);
  assert.equal(f.state.ledger.get("1.0/123.json"), old);
});

test("changing PR head never receives a passing result from a stale run", async () => {
  const f = fixture();
  f.sign();
  let calls = 0;
  f.github.rest.pulls.get = async () => {
    const pr = structuredClone(f.state.pr);
    if (calls++) pr.head.sha = "d".repeat(40);
    return { data: pr };
  };
  await f.check();
  assert.equal(f.state.statuses.at(-1).state, "failure");
  assert.ok(f.state.statuses.every((status) => status.sha === "a".repeat(40)));
});

test("privileged workflow uses trusted SHA, has no fork checkout/dependencies or interpolated comments", () => {
  const yaml = readFileSync(join(root, ".github/workflows/cla.yml"), "utf8");
  assert.match(yaml, /ref: \$\{\{ github.workflow_sha \}\}/);
  assert.match(yaml, /persist-credentials: false/);
  assert.match(yaml, /pull_request.base.ref == 'main'/);
  assert.doesNotMatch(
    yaml,
    /head.sha|head.ref|npm install|pnpm install|\$\{\{.*comment.body/,
  );
});
