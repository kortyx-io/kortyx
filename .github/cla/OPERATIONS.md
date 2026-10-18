# Contributor agreement operations

## Contract and evidence

The active agreement is selected in `config.json`. Its `sha256` is SHA-256 over
exact UTF-8 file bytes, including line endings; it is not a hash of rendered HTML.
Published versions are immutable. A signature records the hash, version, immutable
GitHub commit URL, GitHub numeric account ID, username at signing, exact statement,
comment ID/URL/time, PR, repository, and recording workflow run. Renaming an account
does not lose a signature; a different account with the old username cannot reuse
it. No email address, IP address, postal address, token, or employer document is
collected in the ledger. The statement is an explicit personal electronic assent,
not a checkbox a maintainer can set for someone else.

The `cla-signatures` branch is created with a parentless commit on first signing.
It contains one `<version>/<numeric-user-id>.json` file per signature, separate
from source and releases. Files are create-only in the workflow. Concurrent
signatures retry conflicts without overwriting prior evidence. The branch and its
Git history are public, as disclosed before signing. Deleting a comment does not
delete the recorded license. Back up this branch with repository backups. GitHub
administrators can still alter repository history; a public Git ledger is evidence,
not an independent notary or a verification of a person's employment authority.

## Merge gate and bootstrap

1. Merge the CLA implementation through the existing required CI gates. The
   privileged workflow must first exist on trusted `main`; it cannot safely test
   its own first rollout by running code from its PR.
2. Add **CLA / agreement**, GitHub Actions integration ID **15368**, to the existing
   default-branch required status checks. Preserve all other requirements. This
   bootstrap PR precedes the new gate; do not fabricate an acceptance to pass it.
3. Protect `cla-signatures` against deletion and force pushes with a branch
   ruleset. Allow ordinary workflow fast-forward writes. Never force-push or
   manually edit signature evidence to make a PR pass.
4. Dispatch `cla.yml` with an open PR number to populate the new status for PRs
   already open. For a negative smoke test, open a harmless PR from an unsigned
   account and confirm the status fails. Have that person read and personally
   sign the statement, then confirm recording and success. Never generate a test
   signature as a real person. Unit tests use fictional, in-memory identities.

No PAT or third-party CLA service is required. `GITHUB_TOKEN` needs contents write
for the separate ledger, pull requests write for instructions, and statuses write
for the merge gate. Repository policy must allow those permissions. Read-only
or failed API calls cannot produce a successful status. If recording fails after
a user signs, rerun; the workflow re-reads exact, unedited acceptance comments.
Signing on one PR covers the same version elsewhere, but those other PRs need a
new comment (`recheck cla`), a synchronize event, or a manual workflow dispatch.

## Trust and attribution

The workflow uses `pull_request_target` only for PRs targeting main and loads
scripts/agreement at `github.workflow_sha`, with checkout credentials disabled.
Comment runs use the trusted default branch. Manual dispatch is restricted to
main. Fork files, git hooks, dependencies, commit messages, and comment text are
never executed. Do not replace this with checkout of a PR SHA or installation of
PR dependencies in the privileged job. Do not interpolate event text into shell
commands or the github-script source.

The PR author, all GitHub-linked commit authors, and all `Co-authored-by` entries
must be covered. Co-author trailers require the numeric-ID GitHub noreply format;
ordinary email addresses are not resolved by speculative search. Unknown users,
unknown bots, malformed co-authors, partial commit lists, and PRs exceeding the
GitHub endpoint's 250-commit limit fail closed. Split oversized PRs, fix attribution,
or have the actual contributor connect their commit email to their GitHub account.
A commit author field can be forged; reviewers must still verify provenance and
third-party/employer permission. A passing check is not an ownership determination.
Committers who merely apply another author's patch are not additional authors.

Only the exact numeric IDs and Bot account types for Kortyx's release bot,
GitHub Actions, and Dependabot are exempt as automated record producers. These
exceptions grant no rights in human-authored material carried by a bot; human
contributors and imported third-party work still need review. Do not add human
maintainers, organizations, login wildcards, or arbitrary bots to the exemption
list. New bot exceptions require a reviewed configuration change.

The automated path covers individuals with sufficient rights/authority. An
employer can authorize an individual as described by the CLA. A separate corporate
agreement or offline signature is not automatically recognized. Resolve such cases
with legal@kortyx.io and add a reviewed, verifiable evidence mechanism before
merging; do not use an undocumented bypass.

## Changes and recovery

- Never edit an accepted agreement version. Add a new version, hash it, update
  `config.json` and `CLA.md`, and add a frozen-hash regression. A new version needs
  fresh assent; keep earlier documents and signatures available.
- After activating a version, dispatch checks for every open PR before allowing
  merges. Existing statuses on unchanged heads do not refresh automatically.
  Coordinate this upgrade while merges are paused; a same-name old success must
  not be mistaken for acceptance of the new version.
- Restrict and review changes to this workflow, its helper, agreement configuration,
  and branch rules. Inspect rules after changes; repository administrators retain
  the technical ability to change policy.
- For API, attribution, or ledger errors, correct the cause and rerun. Do not remove
  the required gate to merge an unsigned contribution. Restore a damaged ledger
  from verified history, preserving evidence and documenting the incident.
- Contact legal@kortyx.io for privacy requests or disputed records. Preserve valid
  license evidence where legally justified; follow applicable rights and record
  the correction through a reviewed process. Do not silently rewrite an assent.
- The CLA grants rights only from people who actually possess or can license them.
  Historical or employer-owned work requires separate provenance/rights review.
  This rollout does not revoke public licenses or itself relicense any package.

## Targeted checks and sources

Run `node --test .github/scripts/tests/cla.test.cjs` and
`actionlint .github/workflows/cla*.yml`. The separate read-only CLA validation
workflow tests proposed changes on PRs without signing or repository write access. No Studio tests, Docker, or application deployment are
needed locally for this change. The normal repository CI remains required.

Consult these primary sources when changing the agreement or workflow; this is a
project-specific agreement, not a claim of legal approval or an Apache document:

- [Apache individual CLA](https://www.apache.org/licenses/icla.pdf): ownership,
  copyright/patent permission, and employer authority patterns.
- [Elastic contribution guidance](https://www.elastic.co/contributor-agreement):
  broad contribution rights in a project with multiple licensing models.
- [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0.html) and
  [Elastic License 2.0](https://www.elastic.co/licensing/elastic-license): existing
  downstream license boundaries.
- [GitHub workflow event security](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target).
- [GitHub PR commit endpoint](https://docs.github.com/en/rest/pulls/pulls#list-commits-on-a-pull-request):
  pagination and the 250-commit maximum.
- [GitHub repository contents API](https://docs.github.com/en/rest/repos/contents):
  create-only writes and concurrent update conflicts.

Legal wording, employer authority, third-party provenance, and future license
changes still need case-specific assessment. A CLA check verifies recorded assent;
it cannot resolve an ownership dispute.
