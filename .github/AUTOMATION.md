# CI and release automation

## Layout

- `workflows/`: runnable entry points. Keep triggers, permissions, runners, services,
  timeouts, concurrency, matrices, dependencies, and environment approvals here.
- `actions/setup/`: shared Node/pnpm, Redis, PostgreSQL, and registry setup.
- `actions/validation/`: repository checks and the full Studio database/browser suite.
- `actions/release/`: Release Please, npm publishing, and Studio update publication.
- `actions/containers/`: image builds and promotion of existing image indexes.
- `actions/deployment/`: Coolify deployment, polling, and preview cleanup.
- `scripts/setup/`, `scripts/studio/`, `scripts/website/`: pipeline-specific helpers.
- `scripts/tests/`: tests of shared helpers using local fakes, without remote writes.
- `release-please/`: package release configuration and version manifest.

Each action directory contains `action.yml`. Scripts exclusive to an action live
alongside it; scripts used across pipelines are under `scripts/`. Use lowercase
kebab-case names. Keep direct third-party artifact and GitHub API action calls in
workflows when they are not repeated execution logic.

Shared actions and scripts do not register as workflows in the Actions sidebar.
GitHub requires workflow YAML at the top level of `workflows/`; do not put reusable
workflows in `workflows/shared/`.

## Entry points

| File | Actions display name | Trigger |
| --- | --- | --- |
| `cla-validation.yml` | CLA / Validation | Changes to the agreement or its automation |
| `cla.yml` | CLA | PRs targeting main, new PR comments, or manual recheck |
| `ci.yml` | CI | Pull requests and pushes to main |
| `release-prepare.yml` | Release / Prepare PR | Every push to main, or manual |
| `npm-publish.yml` | Release / Orchestrate | Completed main CI (failed release CI is reported, never published), manual stable recovery, or a manually selected PR canary |
| `release-studio-images.yml` | Release / Studio Images | Called after npm readiness, or manual recovery with an existing tag |
| `release-studio-recover.yml` | Release / Studio Recovery | Manual, existing tag and recorded digests |
| `website-preview.yml` | Website / Preview | Same-repository PR changes and closure |
| `website-release.yml` | Website / Staging | Affected pushes to main, or manual |
| `website-promote.yml` | Website / Production | Called for a website release, or manual recovery |

The former `release.yml`, `studio-oss-ghcr.yml`,
`studio-oss-cdn-recover.yml`, `website-ghcr.yml`, and `website-ghcr-promote.yml` have
been renamed as above. Update any external workflow-dispatch clients using those
filenames. GitHub may retain historical workflow entries for their old names.

The npm entry point deliberately remains `npm-publish.yml`: existing npm trusted
publishers are configured for that exact filename and the `NPM Package Publishing`
environment. Publishing stays in that workflow with `id-token: write`, so no npm
trusted-publisher configuration change is required. The workflow now creates tags,
publishes changed packages, and waits until every exact version and `latest` tag are
visible before it calls the Studio and website release workflows. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Pull request canaries

Run `Release / Orchestrate` manually with operation `canary`, an open
same-repository PR number, and optionally `dry_run`. The workflow waits for that
PR's checks, freezes its head SHA, and applies the same managed Node workspace
dependency-closure rules configured for Release Please. Directly changed public
packages and their publishable dependents receive coordinated versions such as
`0.2.1-canary.pr241.419a45ee.123.1`.

PR code builds and packs without npm authority. The gated publisher downloads the
resulting tarballs, verifies their identities and SHA-256 checksums, publishes them
with provenance under the PR-specific `pr-<number>` dist-tag, waits for registry
propagation, and resolves every exact version in a clean consumer. It then creates
or updates a PR comment containing exact `pnpm add -E` commands. Canary runs never
write package versions, changelogs, Release Please manifests, Git tags, GitHub
releases, or npm's `latest` tag.

Applications keep their native preview artifacts. `Website / Preview` remains the
automatic website canary and owns its Coolify lifecycle. Studio and API changes are
reported in the canary plan but are not published to npm; their eventual preview
lane should build immutable PR/SHA container images without touching staging,
production, or the Studio update channel.

## Shared validation

CI calls `actions/validation/repository` in four parallel jobs: coverage,
integration regressions, build/typecheck, and static publication tests/lint.
Each job installs frozen dependencies. Coverage and integration start isolated Redis 7
and PostgreSQL 17 test containers and remove them with an `always()` step.

The stable CI gate names `typecheck_lint` and `Studio drawer-stack E2E` remain
unchanged because the main branch ruleset requires them. Studio E2E runs database
preflight separately from eight standard browser shards, review mode, two
production internal-linking shards, and one production drawer-stack partition.
Each browser partition has an isolated database
and server, and their blob reports are merged into one retained HTML report. Changes
that do not affect Studio or its API/database dependencies skip this matrix.

## Workflow code versus release code

Stable release selection and npm publication share one commit classifier. It
recognizes the conventional Release Please squash/rebase title, plus GitHub's
default two-parent merge from `kortyx-io/release-please--branches--main` when the
second parent is itself release-titled. Ordinary feature merges are not releases.
Selection runs from the trusted workflow revision, so manual stable recovery can
classify an older release commit after an automation fix. Recovery still requires
successful main push CI for that exact commit; no tag or publication gate is bypassed.

Jobs check out automation separately at `.github/automation`, pinned to
`github.workflow_sha`, with checkout credentials disabled. Local actions and helper
scripts are loaded from that checkout. The root checkout remains the source code
selected by the workflow; Studio builds and smoke tests use the prepared release
commit, and recovery checks the candidate in `.release-candidate`.

This allows publication of release commits that predate the shared-action folders,
and prevents a candidate's old scripts from replacing the running workflow's
publication logic. Nested local actions expect this automation checkout location.
It is gitignored, and the existing Docker exclusion of `.github` keeps it out of
image build contexts even for older release candidates.

## Publication safeguards

- Release Please retains GitHub App authentication and its prepare/tags modes.
- npm publishes only changed, managed public packages from a release commit, skips
  existing versions, and retains provenance and the npm environment gate. The
  publication step receives the actual SHA recorded after checkout.
- The release orchestrator calls Studio only when `apps/studio` changed and only
  after npm registry verification. When Studio changes, an R2 read/write/delete
  preflight gates tags and npm publication, so known-invalid storage credentials
  cannot publish a newer SDK first. Standalone Studio releases repeat the preflight
  before building images. Manual dispatch remains available for recovery.
- Studio release tag/package/manifest agreement, main ancestry, immutable version
  checks, native amd64/arm64 smoke tests, credential rotation, persistence,
  backup/restore, external PostgreSQL, and updater ownership checks are retained.
  Each architecture also generates an authenticated eval manifest with `evidence`
  using the independently installed npm SDK and passes it through the API image's
  discovery parser. This catches SDK/image contract drift before promotion.
- The real-image upgrade check preserves customer row fingerprints, table OIDs,
  credential hashes/identities and all custom-key scopes. Prompt management adds
  only its explicitly listed scopes to the two installer-managed bootstrap keys;
  this documented capability migration is asserted separately, not treated as
  credential rotation. A second migration/restart must preserve the full resulting
  snapshot, including scopes, exactly. Unexpected additions or removals still fail.
- Production Studio promotion and recovery share the `studio-production-auto`
  environment and its R2 credentials, with protected-branch restrictions and no
  reviewer approval or wait timer. Publication preparation exercises R2 access
  before promoting the exact tested digests. CDN publication follows verified image
  promotion; the Studio GitHub release remains draft until CDN verification passes.
  All release entry points require successful push CI for the exact commit. Recovery
  verifies the supplied production digests and both architectures before publication.
- The existing R2 publisher retains idempotency, concurrent-update protection,
  release-history-before-channel ordering, and public CDN verification.
- Coolify uses the same helper for staging, production, preview payloads, polling,
  and idempotent preview removal. Affected non-release main commits deploy to
  staging immediately. Release Please commits skip that standalone deployment;
  website releases rebuild the exact release commit, stage it, then promote its
  recorded digest to versioned and `latest` production tags.

## Recovering a blocked release queue

A merged Release Please PR is not a completed release. If its exact-commit push
CI fails, Release / Orchestrate fails visibly before tags, packages or deployments.
Release / Prepare PR also checks merged `autorelease: pending` PRs: it reports
active gates as pending work and fails with the PR, SHA and recovery links if the
release is blocked. It never clears labels or silently substitutes newer code.

Re-run failed CI jobs on the original release commit. Successful CI completion
automatically retriggers orchestration. If needed, dispatch `npm-publish.yml` with
`operation=stable` and `release_commit=<original SHA>`; this still requires green
push CI for that exact SHA. Do not remove the pending label, move tags, or publish
from a later green commit to evade a failed gate. If the original commit has a
real defect, resolve the release plan explicitly rather than weakening its tests.

Browser report downloads stay in separate artifact directories. The merge input
contains the latest attempt per shard (including untouched shards from earlier
attempts), with collision-free ZIP names. Earlier attempt artifacts remain
available for diagnostics; rerunning failed jobs cannot corrupt reports by
extracting identical filenames concurrently. Missing reports still fail the gate.

After successful orchestration, Release / Prepare PR runs again automatically so
changes queued behind the recovered release can become the next release PR.
Publication failures remain red in the original orchestration run; rerun only
failed jobs there to retain its immutable artifacts and completed gates.
If a reviewed smoke-test correction is needed, dispatch `release-studio-images.yml`
from updated main with the original release tag and both recorded staging index
digests. It revalidates the same images through exact-SHA CI, storage preflight,
both native-platform smoke/upgrade tests and promotion; it does not rebuild them.
The CDN-only recovery workflow is for already-promoted production images, not for
evading a failed smoke test.

## Recovering a blocked Studio publication

HTTP 401/403 from the R2 publisher is an authorization failure, not a flaky smoke
check. Inspect the operation reported in the error and verify the bucket-scoped
R2 S3 key pair in `studio-production-auto`, including token status, expiry, IP
restrictions and account/bucket scope. Do not put the DNS administration token in
these secrets. Validate replacement credentials with `publish.py --check-access`
before storing them; never print credential values.

After repairing access, rerun only failed jobs in the original release run. This
reuses the tested image digests. If production images already exist but CDN
publication did not finish, use `release-studio-recover.yml` with their recorded
index digests. Do not rebuild and overwrite an existing production version. Verify
both the public stable manifest and the GitHub release's published status.

The preflight catches an existing storage outage before npm publishes, but npm,
GHCR and R2 are separate services: a later outage can still leave a partial release
requiring recovery. Do not treat npm success alone as completion of a Studio release.

## Local helper checks

```sh
python3 -m unittest discover -s .github/scripts/studio/update-channel -v
python3 -m unittest discover -s .github/scripts/tests -v
node --test .github/scripts/tests/*.test.cjs
```

Run `actionlint` for workflow syntax and `bash -n` for shell syntax. Production
publication is verified through its gated workflow, not by executing publish or
deployment commands locally.

## Contributor agreements

The [CLA operations guide](cla/OPERATIONS.md) describes signing, the separate
public ledger, required merge status, identity failures, bot exceptions, and
version upgrades. This workflow never checks out or executes pull request code.
