module.exports = async ({ github, context }) => {
  const marker = "<!-- kortyx-website-preview -->";
  const body = `${marker}\n### Website preview\n[Open ${process.env.PREVIEW_URL}](${process.env.PREVIEW_URL})\n\nProtected by Cloudflare Access.`;
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
      body,
    });
  } else {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      body,
    });
  }
};
