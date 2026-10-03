module.exports = async ({ github, context, core }) => {
  const base = context.ref.replace(/^refs\/heads\//, "");
  const headRef = `release-please--branches--${base}`;
  const pulls = await github.paginate(github.rest.pulls.list, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: "open",
    base,
    head: `${context.repo.owner}:${headRef}`,
  });

  if (pulls.length === 0) {
    core.info(`No open Release Please pull request found for ${base}.`);
    return { updated: false };
  }
  if (pulls.length > 1) {
    throw new Error(
      `Found multiple open Release Please pull requests for ${base}.`,
    );
  }

  const pull = pulls[0];
  try {
    await github.request(
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch",
      {
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: pull.number,
        expected_head_sha: pull.head.sha,
      },
    );
    core.info(
      `Requested a base-branch update for pull request #${pull.number}.`,
    );
    return { updated: true, pullNumber: pull.number };
  } catch (error) {
    if (error.status === 422 && /not behind/i.test(error.message)) {
      core.info(`Pull request #${pull.number} is already up to date.`);
      return { updated: false, pullNumber: pull.number };
    }
    throw error;
  }
};
