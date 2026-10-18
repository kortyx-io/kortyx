# Contributing to Kortyx

Thanks for taking the time to contribute!

## Contributor agreement

Read the [Contributor License Agreement](CLA.md) before submitting a pull
request. Each contributor signs the exact version using the statement posted by
the CLA check. The agreement permits commercial Cloud use and future relicensing;
you retain your copyright. Employer-owned contributions require the necessary
authority. Current [component licenses](LICENSES.md) remain unchanged.

## Development setup

```bash
pnpm install
pnpm build
```

## Useful commands

```bash
pnpm lint
pnpm type-check
pnpm test
```

## Conventions

- **Package manager:** pnpm (see `packageManager` in root `package.json`)
- **Formatting/linting:** Biome (`pnpm lint`, `pnpm format`)
- **Commits:** Conventional Commits (enforced via commitlint)

For workflow layout, CI suites, publishing, and recovery, see
[CI and release automation](.github/AUTOMATION.md). Keep this guide named
AUTOMATION.md: GitHub gives a README in `.github` precedence over the root
product README on the repository homepage.

## Pull requests

- Read the [Definition of Done](docs/internal/definition-of-done.md) before
  planning a change. It covers every PR, including fixes, refactors, documentation,
  dependencies, and release automation.
- Keep PRs focused and small when possible.
- Include a short description, rationale, and any relevant screenshots/logs.
- Identify acceptance criteria and affected SDK, API, Studio, CLI, and developer
  guidance surfaces. Complete the applicable work across those surfaces.
- Fill every area in the [PR template](.github/pull_request_template.md) with
  Complete and evidence, Not applicable and a reason, or Deferred and a linked
  issue, owner, limitation, and safe release boundary. Reviewers must accept
  deferrals before merge; the policy identifies requirements that cannot be
  deferred.
- Update affected documentation, examples, and `skills/kortyx` references when
  public behavior or integration guidance changes. Assess maintainer usage
  telemetry separately from customer execution observability.
- Run verification proportional to the change, record results and skipped
  checks, and wait for required CI on the final PR head before merge. For
  documentation-only changes, check content and links rather than adding runtime
  tests.
- Assess and complete affected Studio page help and guided tours, including new
  surfaces introduced by a rebase; record the coverage and visual verification in
  the PR checklist. Follow the Definition of Done for applicability and evidence.
- Reconcile the assessment with the final diff before requesting review. Explain
  incomplete work and partial feature boundaries instead of marking them done.

The Definition of Done is the single source of detailed completion requirements.
Repository agents also follow [AGENTS.md](AGENTS.md). The PR template records the
assessment; passing CI supports that assessment but does not replace review of
applicability, documentation accuracy, or the supported user journey.

## Shared agent resources

Repository skills and agent resources live in [.agents](.agents/README.md).
`.cursor`, `.claude`, `.codex`, `.gemini`, `.opencode`, `.windsurf`, and `.devin`
are relative symbolic links to that directory. GitHub Copilot's `.github/skills`
links to `.agents/skills`; root CLAUDE.md and GEMINI.md link to AGENTS.md.

Edit the canonical files rather than adding copies under each tool's directory.
The portable application skill remains in `skills/kortyx`, exposed through
`.agents/skills/kortyx`. Preserve symbolic links in your checkout and keep local
credentials and generated agent state out of tracked shared files.

