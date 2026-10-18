// Release Please exits successfully when an untagged merged PR blocks it.
// Turn that silent no-op into an actionable failure, without publishing anything.
module.exports = async ({ github, context, core }) => {
  const repo = context.repo;
  const branch = context.payload.repository.default_branch;
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    ...repo,
    state: "closed",
    labels: "autorelease: pending",
    per_page: 100,
  });
  const blocked = [];
  for (const issue of issues) {
    if (!issue.pull_request) continue;
    const { data: pr } = await github.rest.pulls.get({
      ...repo,
      pull_number: issue.number,
    });
    if (!pr.merged_at || pr.base.ref !== branch) continue;
    const sha = pr.merge_commit_sha;
    const latest = async (workflow_id, event) => {
      const { data } = await github.rest.actions.listWorkflowRuns({
        ...repo,
        workflow_id,
        branch,
        head_sha: sha,
        ...(event ? { event } : {}),
        per_page: 1,
      });
      return data.workflow_runs[0];
    };
    const ci = await latest("ci.yml", "push");
    const release = await latest("npm-publish.yml", "workflow_run");
    const active = (run) => run && run.status !== "completed";
    // A normal merge is not a failure while its exact-SHA gates are running.
    if (active(ci) || (ci?.conclusion === "success" && active(release))) {
      core.notice(
        `Release PR #${pr.number} (${sha}) is still passing through its gates; no new release PR can be prepared yet.`,
      );
      continue;
    }
    const message = `Release PR #${pr.number} is merged but still untagged (${sha}). CI: ${ci?.conclusion ?? "missing"}; release: ${release?.conclusion ?? "missing"}. Re-run failed CI jobs for this exact commit first. Once CI is green, re-run Release / Orchestrate or dispatch it with operation=stable and release_commit=${sha}. Do not remove the pending label or bypass CI.`;
    core.error(message);
    core.summary
      .addHeading(`Blocked release #${pr.number}`, 3)
      .addRaw(
        `${message}\n\n${pr.html_url}\n\nCI: ${ci?.html_url ?? "not found"}\n\nRelease: ${release?.html_url ?? "not found"}\n\n`,
      );
    blocked.push(pr.number);
  }
  await core.summary.write();
  if (blocked.length)
    core.setFailed(
      `Release preparation blocked by unfinished release PR(s): ${blocked.join(", ")}. See the job summary for gated recovery.`,
    );
  return blocked;
};
