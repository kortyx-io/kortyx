# Repository agent instructions

## Shared agent files

[.agents](.agents/README.md) is the canonical directory for repository skills and
agent resources. The tool-specific directories are relative symbolic links to it;
edit shared files under `.agents` rather than creating tool-specific copies.
Root CLAUDE.md and GEMINI.md link to this file so repository policy stays shared.
The portable Kortyx skill remains authored under `skills/kortyx` and is exposed
through `.agents/skills/kortyx` without duplication.

## Definition of Done

Read [docs/internal/definition-of-done.md](docs/internal/definition-of-done.md)
before planning or implementing a repository change. It is the authoritative
completion policy for every PR, including fixes, refactors, and documentation.
Follow applicable instructions in more specific AGENTS.md files as well.

- Identify affected product surfaces and acceptance criteria before editing.
  Assess all policy areas; implement only the applicable work.
- Include relevant Studio integration, guided tours/page help, documentation/examples, Kortyx skill
  references, usage telemetry, customer observability, compatibility/extension
  contracts, security/privacy, verification, and release/operations in the scope.
- Keep maintainer usage telemetry separate from customer execution observability.
  Use generic public extension points without exposing private implementation
  details. Inspect available contracts instead of inventing APIs or capabilities.
- Complete applicable work within the authorized scope. If a necessary decision
  or unavailable dependency prevents completion, report the concrete gap; do not
  silently omit it or mark it Complete.
- Run proportional verification and preserve existing quality gates. For
  documentation-only changes, check content and links without adding runtime
  tests. Report unrun/skipped checks and pending CI accurately.
- Use [.github/pull_request_template.md](.github/pull_request_template.md) when
  preparing a PR. Every assessment row needs Complete with evidence, Not
  applicable with a reason, or Deferred with a linked issue, owner, limitation,
  and safe release boundary. Deferred work needs reviewer acceptance before
  merge; the policy defines which requirements cannot be deferred.
- After rebasing, assess new Studio surfaces and complete affected page help and
  guided tours under the Definition of Done; include the evidence in the PR checklist.
- Before requesting review, reconcile the assessment with the final diff and
  report remaining gaps. Do not claim verification or private adapter coverage
  that was not performed.

Keep detailed completion requirements in the Definition of Done. Update this
file, CONTRIBUTING.md, and the PR template only when their workflow guidance needs
to change; avoid duplicating the full policy in those files or the distributed
Kortyx skill.
