const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const STATUS = "CLA / agreement";
const MARKER = "<!-- kortyx-cla-check -->";

function loadAgreement(root) {
  const config = JSON.parse(
    readFileSync(join(root, ".github/cla/config.json"), "utf8"),
  );
  if (
    !/^\d+\.\d+$/.test(config.version) ||
    config.document !== `.github/cla/${config.version}.md` ||
    config.ledgerBranch !== "cla-signatures"
  ) {
    throw new Error("Invalid CLA configuration");
  }
  const digest = createHash("sha256")
    .update(readFileSync(join(root, config.document)))
    .digest("hex");
  if (digest !== config.sha256)
    throw new Error("CLA text does not match its configured hash");
  return config;
}

function statement(config) {
  return `I have read and agree to the Kortyx Contributor License Agreement version ${config.version} (SHA-256: ${config.sha256}). I am signing for myself and confirm that I have authority to grant the rights described in this agreement.`;
}

function validSignature(record, id, config) {
  return (
    record?.schemaVersion === 1 &&
    record.user?.id === id &&
    record.version === config.version &&
    record.sha256 === config.sha256 &&
    record.statement === statement(config) &&
    Number.isSafeInteger(record.commentId) &&
    typeof record.acceptedAt === "string" &&
    typeof record.agreementCommit === "string"
  );
}

async function readSignature(github, repo, config, id) {
  try {
    const { data } = await github.rest.repos.getContent({
      ...repo,
      ref: config.ledgerBranch,
      path: `${config.version}/${id}.json`,
    });
    if (data.type !== "file" || data.encoding !== "base64")
      throw new Error("Invalid signature file");
    const record = JSON.parse(
      Buffer.from(data.content, "base64").toString("utf8"),
    );
    if (!validSignature(record, id, config))
      throw new Error(
        "Invalid signature evidence; maintainer investigation required",
      );
    return record;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function saveSignature(github, repo, config, record) {
  const id = record.user.id;
  if (await readSignature(github, repo, config, id)) return;
  const path = `${config.version}/${id}.json`;
  const content = `${JSON.stringify(record, null, 2)}\n`;
  try {
    await github.rest.git.getRef({
      ...repo,
      ref: `heads/${config.ledgerBranch}`,
    });
  } catch (error) {
    if (error.status !== 404) throw error;
    // Start a separate, parentless ledger. No repository source or workflows.
    const { data: tree } = await github.rest.git.createTree({
      ...repo,
      tree: [{ path, mode: "100644", type: "blob", content }],
    });
    const { data: commit } = await github.rest.git.createCommit({
      ...repo,
      message: `Record CLA ${config.version} acceptance for GitHub user ${id}`,
      tree: tree.sha,
      parents: [],
    });
    try {
      await github.rest.git.createRef({
        ...repo,
        ref: `refs/heads/${config.ledgerBranch}`,
        sha: commit.sha,
      });
      return;
    } catch (race) {
      if (race.status !== 422) throw race;
      // Another signer may have created the branch while this run was recording.
      await github.rest.git.getRef({
        ...repo,
        ref: `heads/${config.ledgerBranch}`,
      });
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await readSignature(github, repo, config, id)) return;
    try {
      await github.rest.repos.createOrUpdateFileContents({
        ...repo,
        branch: config.ledgerBranch,
        path,
        message: `Record CLA ${config.version} acceptance for GitHub user ${id}`,
        content: Buffer.from(content).toString("base64"),
      });
      return;
    } catch (error) {
      if (![409, 422].includes(error.status)) throw error;
    }
  }
  if (!(await readSignature(github, repo, config, id)))
    throw new Error("Signature write conflict; rerun the CLA check");
}

async function contributors(github, repo, pr, config) {
  if (pr.commits > 250)
    throw new Error(
      "PR exceeds GitHub’s 250-commit listing limit; split the PR before checking contributor coverage",
    );
  const commits = await github.paginate(github.rest.pulls.listCommits, {
    ...repo,
    pull_number: pr.number,
    per_page: 100,
  });
  if (commits.length !== pr.commits)
    throw new Error("Incomplete commit listing; retry with a stable PR head");
  const people = new Map();
  const problems = [];
  const add = (user, context) => {
    if (
      !user ||
      !Number.isSafeInteger(user.id) ||
      !/^[a-z\d-]+(?:\[bot\])?$/i.test(user.login)
    ) {
      problems.push(`Unresolved GitHub author on ${context}.`);
    } else if (user.type === "Bot") {
      if (
        !config.automationAccounts.some(
          (bot) => bot.id === user.id && bot.login === user.login,
        )
      )
        problems.push(`Unapproved automation account on ${context}.`);
    } else if (user.type !== "User") {
      problems.push(`Unsupported account type on ${context}.`);
    } else {
      people.set(user.id, user);
    }
  };
  add(pr.user, "the pull request");
  for (const commit of commits) {
    const label = `commit ${commit.sha.slice(0, 12)}`;
    add(commit.author, label);
    for (const line of commit.commit.message.split(/\r?\n/)) {
      if (!/^\s*co-authored-by\s*:/i.test(line)) continue;
      const match = line.match(
        /^\s*co-authored-by\s*:\s*[^<>\r\n]+<(\d+)\+([a-z\d-]+)@users\.noreply\.github\.com>\s*$/i,
      );
      if (!match) {
        problems.push(
          `Unresolved co-author on ${label}; use the co-author’s GitHub ID+username noreply address.`,
        );
        continue;
      }
      try {
        const { data: user } = await github.rest.users.getByUsername({
          username: match[2],
        });
        if (String(user.id) !== match[1])
          problems.push(`Co-author identity mismatch on ${label}.`);
        else add(user, label);
      } catch (error) {
        if (error.status !== 404) throw error;
        problems.push(`Unresolved co-author on ${label}.`);
      }
    }
  }
  return { people: [...people.values()], problems };
}

async function run({ github, context, core, root, config }) {
  const repo = context.repo;
  const number = Number(
    context.payload.pull_request?.number ??
      context.payload.issue?.number ??
      context.payload.inputs?.pull_request,
  );
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error("A pull request number is required");
  const { data: pr } = await github.rest.pulls.get({
    ...repo,
    pull_number: number,
  });
  if (pr.state !== "open") return;
  const status = async (state, description) =>
    github.rest.repos.createCommitStatus({
      ...repo,
      sha: pr.head.sha,
      state,
      context: STATUS,
      description,
      target_url: `https://github.com/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`,
    });
  await status("pending", "Checking contributor agreements");
  try {
    config ??= loadAgreement(root);
    const { people, problems } = await contributors(github, repo, pr, config);
    const comments = await github.paginate(github.rest.issues.listComments, {
      ...repo,
      issue_number: number,
      per_page: 100,
    });
    const agreementUrl = `https://github.com/${repo.owner}/${repo.repo}/blob/${context.sha}/${config.document}`;
    // Only exact, unedited, human-authored statements qualify. Scan on every run
    // so retries/concurrent events cannot lose an acceptance. No PR code executes.
    for (const comment of comments) {
      if (
        comment.user?.type !== "User" ||
        comment.body?.trim() !== statement(config) ||
        comment.created_at !== comment.updated_at
      )
        continue;
      if (!people.some((person) => person.id === comment.user.id)) continue;
      await saveSignature(github, repo, config, {
        schemaVersion: 1,
        version: config.version,
        sha256: config.sha256,
        user: { id: comment.user.id, login: comment.user.login },
        statement: statement(config),
        commentId: comment.id,
        commentUrl: comment.html_url,
        acceptedAt: comment.created_at,
        repository: `${repo.owner}/${repo.repo}`,
        pullRequest: number,
        agreementCommit: context.sha,
        agreementUrl,
        recordedByRun: `https://github.com/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`,
      });
    }
    const missing = [];
    for (const person of people)
      if (!(await readSignature(github, repo, config, person.id)))
        missing.push(person);
    // A synchronize event will evaluate the new head. Never bless a changing PR.
    const { data: latest } = await github.rest.pulls.get({
      ...repo,
      pull_number: number,
    });
    if (latest.head.sha !== pr.head.sha || latest.base.sha !== pr.base.sha)
      throw new Error("PR changed during verification; rerun the check");
    const passed = !missing.length && !problems.length;
    const body = [
      MARKER,
      "### Contributor License Agreement",
      passed
        ? "All identified contributors have the required agreement on record."
        : "A contribution agreement is required before this pull request can merge.",
      `Read [CLA version ${config.version}](${agreementUrl}). You retain copyright; the agreement grants commercial, Cloud, sublicensing, and future relicensing rights to Mustafa Sait Önal, operating as Kortyx.`,
      missing.length
        ? `Waiting for: ${missing.map((person) => `@${person.login}`).join(", ")}.`
        : "",
      ...problems,
      "To sign, read the linked agreement and post this exact statement yourself as a **new, unedited comment**:",
      "```text",
      statement(config),
      "```",
      "Acceptance is recorded publicly on the `cla-signatures` branch, including your GitHub ID, username, statement, timestamp and document hash. Do not post private information. Employer-owned or third-party work requires the necessary authority. See [contribution guidance](https://github.com/" +
        repo.owner +
        "/" +
        repo.repo +
        "/blob/main/CLA.md).",
      "After signing elsewhere, comment `recheck cla` here or ask a maintainer to rerun the check.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const existing = comments.find(
      (comment) =>
        comment.user?.id === 41898282 &&
        comment.user.type === "Bot" &&
        comment.body?.startsWith(MARKER),
    );
    if (existing && existing.body !== body)
      await github.rest.issues.updateComment({
        ...repo,
        comment_id: existing.id,
        body,
      });
    else if (!existing)
      await github.rest.issues.createComment({
        ...repo,
        issue_number: number,
        body,
      });
    await status(
      passed ? "success" : "failure",
      passed
        ? "Contributor agreements verified"
        : "Contributor signatures or attribution required",
    );
    if (!passed)
      core.setFailed("Contributor signatures or attribution required");
  } catch (error) {
    await status(
      "failure",
      "CLA verification failed; see workflow diagnostics",
    );
    // Avoid exposing arbitrary API response bodies or commit email addresses.
    core.setFailed(
      `CLA verification could not complete (${error.status ?? "validation error"}). Check attribution, ledger availability and workflow configuration; rerun after correction.`,
    );
  }
}

module.exports = {
  STATUS,
  loadAgreement,
  statement,
  validSignature,
  readSignature,
  saveSignature,
  contributors,
  run,
};
