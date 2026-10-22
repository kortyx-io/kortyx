# Replace an unpublished release candidate

Release publication requires successful push CI for the exact release commit on
main. A failed candidate is never published by testing a different commit,
ignoring an advisory, or changing the gate result.

For a transient failure, rerun the failed CI jobs for the original commit. A
successful completion retriggers Release / Orchestrate. Manual recovery can use
its stable operation with the original `release_commit`.

When a code or dependency defect requires a new commit, the candidate can be
aborted and regenerated **only before publication has begun**:

1. Identify the merged release PR and exact commit. Check the orchestration jobs
   and verify that no release tags, GitHub releases (including drafts), npm
   versions, or Studio images/update manifests exist for any candidate version.
   Check every changed component in `.github/release-please/manifest.json`,
   including dependency bumps. A registry/API error is not evidence of absence.
   If any artifact exists, stop this procedure and recover that immutable release
   or prepare a subsequent version; never reuse or move published versions/tags.
2. In a new PR based on main, revert only the failed release commit's version
   manifests and changelogs. Preserve the feature commits. Include the necessary
   fix, its regression checks, and evidence of the unpublished state. Merge this
   repair PR after its full CI passes.
3. Ensure no old CI/publication recovery run is active, repeat the absence checks,
   and verify that main contains the version rollback. Record the failure,
   rollback PR/commit, absence checks and replacement plan on the old release PR.
   Mark it `autorelease: aborted`, then remove `autorelease: pending`. This is an
   explicit retirement of an unpublished candidate, not permission to publish it.
   Never dispatch publication for that retired commit.
4. Run Release / Prepare PR on main. Release Please regenerates versions and
   changelogs from the last published releases, retaining the feature changes.
   Verify that the new PR includes the repair, its versions match its manifest,
   and its exact head passes all required checks before merging.
5. The new merge commit must pass its own push CI. Allow the normal orchestrator
   to create tags, publish and verify npm packages, smoke-test both Studio image
   architectures and publish the update channel. Confirm those jobs and the
   resulting artifacts before reporting the release as published.

This procedure changes no release authorization, CI, audit, installation, or
promotion gate. An aborted candidate remains closed with an audit trail; it is
not marked tagged or published.
