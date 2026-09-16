module.exports = async ({ github, context }) => {
  const marker = "<!-- kortyx-website-preview -->";
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
  });
  const existing = comments.find(
    (comment) =>
      comment.user?.login === "github-actions[bot]" &&
      comment.body?.includes(marker),
  );

  if (existing) {
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existing.id,
      body: `${marker}\nWebsite preview removed.`,
    });
  }
};
