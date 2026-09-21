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
| `ci.yml` | CI | Pull requests and pushes to main |
| `release-prepare.yml` | Release / Prepare PR | Manual, main only |
| `release-tags.yml` | Release / Tags | Release manifest changes on main, or manual |
| `npm-publish.yml` | Release / NPM | Manual, main only, npm environment approval |
| `release-studio-images.yml` | Release / Studio Images | Published Studio release, or manual recovery with an existing tag |
| `release-studio-recover.yml` | Release / Studio Recovery | Manual, existing tag and recorded digests |
| `website-preview.yml` | Website / Preview | Same-repository PR changes and closure |
| `website-release.yml` | Website / Release | Website version tags |
| `website-promote.yml` | Website / Promote | Manual production promotion |

The former `release.yml`, `studio-oss-ghcr.yml`,
`studio-oss-cdn-recover.yml`, `website-ghcr.yml`, and `website-ghcr-promote.yml` have
been renamed as above. Update any external workflow-dispatch clients using those
filenames. GitHub may retain historical workflow entries for their old names.

The npm entry point deliberately remains `npm-publish.yml`: existing npm trusted
publishers are configured for that exact filename and the `NPM Package Publishing`
environment. Publishing stays in the same workflow job through a composite action,
with `id-token: write` retained. No npm trusted-publisher configuration changes
are required. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Shared validation

CI, release preparation, and npm publication all call
`actions/validation/repository`. It installs frozen dependencies, starts Redis 7
and PostgreSQL 17 with health checks, exports both test URLs, and runs coverage,
builds, PostgreSQL integration coverage, Studio unit tests, example regressions,
typechecks, publication/helper regressions, and lint. An `always()` step removes
only the two test containers at the end.

The CI job ID `typecheck_lint` remains unchanged because the main branch ruleset
requires that check. Studio E2E keeps its own PostgreSQL service, port overrides,
review-mode tests, production-navigation tests, and failure artifacts. Its job
limit is 30 minutes: all three browser suites passed in a GitHub runner trial,
but their combined duration reached the former 20-minute limit.

## Workflow code versus release code

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
- Publishing a `studio-v*` GitHub release automatically starts the Studio image
  pipeline; non-Studio package releases are ignored. Manual dispatch remains
  available for an existing Studio tag when publication must be retried.
- Studio release tag/package/manifest agreement, main ancestry, immutable version
  checks, native amd64/arm64 smoke tests, credential rotation, persistence,
  backup/restore, external PostgreSQL, and updater ownership checks are retained.
- Production Studio promotion still requires `studio-production` approval and
  promotes the exact tested digests. The publisher dependencies are prepared before
  promotion; update CDN publication follows verified image promotion. Recovery
  verifies the supplied production digests and both architectures before publication.
- The existing R2 publisher retains idempotency, concurrent-update protection,
  release-history-before-channel ordering, and public CDN verification.
- Coolify uses the same helper for staging, production, preview payloads, polling,
  and idempotent preview removal. Website production and Cloudflare Access checks
  remain distinct steps.

## Local helper checks

```sh
python3 -m unittest discover -s .github/scripts/studio/update-channel -v
python3 -m unittest discover -s .github/scripts/tests -v
node --test .github/scripts/tests/website.test.cjs
```

Run `actionlint` for workflow syntax and `bash -n` for shell syntax. Production
publication is verified through its gated workflow, not by executing publish or
deployment commands locally.
