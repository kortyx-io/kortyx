module.exports = async ({ github, context, core }) => {
  const files = await github.paginate(github.rest.pulls.listFiles, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number,
  });
  const rootInputs = new Set([
    ".github/workflows/website-preview.yml",
    ".github/workflows/website-release.yml",
    ".github/workflows/website-promote.yml",
    ".nvmrc",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
  ]);
  const changed = files.some(
    ({ filename }) =>
      filename.startsWith("apps/website/") ||
      filename.startsWith(".github/actions/") ||
      filename.startsWith(".github/scripts/website/") ||
      rootInputs.has(filename),
  );

  core.info(
    changed
      ? "Website-affecting changes detected."
      : "No website-affecting changes detected.",
  );
  return changed ? "true" : "false";
};
