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
| `release-prepare.yml` | Release / Prepare PR | Every push to main, or manual |
| `npm-publish.yml` | Release / Orchestrate | Successful main CI for a release commit, or manual resume |
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

## Shared validation

CI calls `actions/validation/repository` in four parallel jobs: coverage,
integration regressions, build/typecheck, and static publication tests/lint.
Each job installs frozen dependencies. Coverage and integration start isolated Redis 7
and PostgreSQL 17 test containers and remove them with an `always()` step.

The stable CI gate names `typecheck_lint` and `Studio drawer-stack E2E` remain
unchanged because the main branch ruleset requires them. Studio E2E runs database
preflight separately from eight standard browser shards, review mode, three
production internal-linking shards, and one production drawer-stack partition.
Each browser partition has an isolated database
and server, and their blob reports are merged into one retained HTML report. Changes
that do not affect Studio or its API/database dependencies skip this matrix.

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
- The release orchestrator calls Studio only when `apps/studio` changed and only
  after npm registry verification. Manual dispatch remains available for recovery.
- Studio release tag/package/manifest agreement, main ancestry, immutable version
  checks, native amd64/arm64 smoke tests, credential rotation, persistence,
  backup/restore, external PostgreSQL, and updater ownership checks are retained.
- Production Studio promotion uses the automatic `studio-production-auto`
  environment and promotes the exact tested digests. The publisher dependencies are prepared before
  promotion; update CDN publication follows verified image promotion. Recovery
  verifies the supplied production digests and both architectures before publication.
- The existing R2 publisher retains idempotency, concurrent-update protection,
  release-history-before-channel ordering, and public CDN verification.
- Coolify uses the same helper for staging, production, preview payloads, polling,
  and idempotent preview removal. Affected main commits deploy to staging immediately;
  website releases rebuild the exact release commit, stage it, then promote its
  recorded digest to versioned and `latest` production tags.

## Local helper checks

```sh
python3 -m unittest discover -s .github/scripts/studio/update-channel -v
python3 -m unittest discover -s .github/scripts/tests -v
node --test .github/scripts/tests/website.test.cjs
```

Run `actionlint` for workflow syntax and `bash -n` for shell syntax. Production
publication is verified through its gated workflow, not by executing publish or
deployment commands locally.
