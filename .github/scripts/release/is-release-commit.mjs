import { execFileSync } from "node:child_process";

export function isReleaseCommit(commit, cwd = process.cwd()) {
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const title = (ref) => git("show", "-s", "--format=%s", ref);
  const releaseTitle = (value) => /^chore: release(?:\s|$)/.test(value);
  const subject = title(commit);
  if (releaseTitle(subject)) return true;

  // GitHub's default merge title replaces the Release Please PR title. Accept
  // only the canonical release branch and a release-titled second parent, not
  // arbitrary feature merges that happen to change package manifests.
  if (
    !/^Merge pull request #\d+ from kortyx-io\/release-please--branches--main$/.test(
      subject,
    )
  )
    return false;
  const parents = git("show", "-s", "--format=%P", commit).split(" ");
  return parents.length === 2 && releaseTitle(title(parents[1]));
}
