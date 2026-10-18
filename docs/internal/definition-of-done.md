# Definition of Done

A feature is complete when its supported user journey works across the affected
product surfaces, can be diagnosed and measured, and is accurately documented and
taught. This policy applies to every PR, including fixes, refactors, documentation,
dependencies, and release automation. Assess every area; change only the areas
affected by the PR.

This document is the authoritative policy. The [PR template](../../.github/pull_request_template.md)
collects the assessment, [CONTRIBUTING.md](../../CONTRIBUTING.md) describes the
contributor workflow, and [AGENTS.md](../../AGENTS.md) directs repository agents.
Keep detailed requirements here rather than maintaining competing checklists.

## Recording the assessment

For each area in the PR template, choose one status:

| Status | Required explanation |
| --- | --- |
| Complete | Link the changed files, tests, documentation, or verification results that demonstrate completion. |
| Not applicable | Explain why the change does not affect this area. |
| Deferred | Link a follow-up issue, identify its owner or responsible team, and explain the safe release boundary and remaining limitation. |

Pending work is not Complete. An unrun check is not a passing check. Record
pending CI and skipped checks in Validation, with the reason and remaining
uncertainty. Update the assessment when the scope or implementation changes.
While drafting or awaiting checks, leave affected rows Pending with an explanation.
Resolve all Pending rows before merge.

A reviewer must explicitly accept a deferral before merge. Do not defer work
required for the advertised behavior, contract compatibility, authorization,
privacy, or data integrity. A partial feature can ship only when its supported
boundary is clear in the implementation, documentation, and PR description.

## Required areas

### 1. Behavior and contracts

- Define the user-visible behavior and its acceptance criteria. Cover relevant
  success, failure, cancellation, suspension, denial, retry, and limit outcomes.
- Keep public types, runtime schemas, validation, HTTP/SSE payloads, error
  descriptors, and consumers consistent. Distinguish request acceptance from
  execution or delivery completion.
- Check replay, resume, persistence, cleanup, and idempotency when affected.
  Preserve control flow and the original result when optional integrations fail.

Evidence: the behavior change, contract tests, and a representative success and
failure reproduction. Use independent expected behavior rather than tests that
only repeat the implementation.

### 2. Studio integration

- Trace relevant SDK facts through emission, ingestion, storage, projections,
  API contracts, and Studio presentation. Identify each affected layer.
- Verify that users can inspect the relevant state and diagnose failures with
  correct correlation, ordering, and lifecycle semantics. Represent missing
  evidence explicitly rather than inventing completion or success.
- Check older SDK data and additive payloads. Include applicable CLI inspection,
  empty/loading/error states, navigation, and refresh behavior.
- Keep SDK execution usable without Studio. An SDK change that needs no new UI
  must still assess compatibility with the existing Studio pipeline.

Evidence: applicable integration tests and browser verification against a
representative fixture or real execution, including a failure case.

### 2a. Guided tours and page help

- For affected Studio pages, features, or shared controls, assess current-page
  help and related sample-project chapters alongside the product change. Update
  or complete their copy, targets, sample evidence, and navigation when behavior
  changes; retain stable lesson IDs and read-only sample boundaries.
- After rebasing, inspect newly introduced routes, tabs, controls, and data states
  for additional guidance needs. Reconcile coverage against the final combined
  diff, including shared UI changes inherited from the base branch.
- Complete the affected guided journeys and verify that each step explains
  readable, visible evidence. Include relevant navigation/resume, empty/error,
  and responsive states. Record manual/browser evidence and skipped checks;
  adding a chapter for every change is not required.
- Mark Not applicable with a concrete reason when guidance is unaffected. New
  guidance should address a user task without making optional tours longer by
  default. Unfinished guidance required for the advertised journey is not Complete.

Evidence: updated guidance/fixtures/anchors where applicable, a route/control
coverage assessment after rebase, and completed related walkthroughs with visual
verification. Record this assessment explicitly in the PR checklist.

### 3. Documentation and examples

- Update affected package READMEs, website documentation, runnable examples,
  configuration references, and migration guidance.
- Document defaults, prerequisites, limits, failure behavior, and supported
  environments. Keep names and imports consistent with published exports.
- Remove or correct obsolete instructions. State the supported scope of a
  partial feature so documentation does not promise future behavior.
- Audit contextual help for affected Studio surfaces in OSS and Cloud: table
  headers, metrics, statuses, filters, drawers, forms, settings, and empty/error
  states, including existing symbol explanations. When understanding requires
  explanation, include concise guidance, an arrow pointing to the trigger, and a
  separate documentation footer; default to adding help when uncertain. Table
  header titles and explained symbols own their help without extra question marks.
  Other compact surfaces use help circles; align metric-card help to the right.
  Use a documentation button only where there is enough space.
  Keep essential prerequisites and recovery instructions visible. Verify hover,
  keyboard, touch, and drawer interactions and link directly to an existing,
  relevant page/anchor for the edition and supported version. Shared behavior
  uses shared docs; differing setup/administration uses edition-specific docs.

Evidence: links to affected guidance and applicable example/build verification.

### 4. Kortyx skill

- Update relevant references under [skills/kortyx](../../skills/kortyx) when
  application developers or agents need different integration guidance.
- Update the skill router when adding a topic or changing how topics are found.
  Keep the distributed skill self-contained and aligned with supported APIs.
- Check reference links, imports, examples, and affected integration patterns.
  Keep repository maintainer policy in this document and root AGENTS.md.

Evidence: links to the updated references and the validation performed. An
internal refactor with unchanged application guidance can be Not applicable.

### 5. Usage telemetry

- Identify the product question the feature should answer: adoption, feature
  preference, failure rate, reliability, latency, or onboarding completion.
- Define or reuse stable operations/events, terminal outcomes, approved property
  enums, and the relevant denominator. Specify whether measurements represent
  logical operations, attempts, responses, or deliveries.
- Use the shared usage helper when available. Keep contracts and instrumentation
  consistent across applicable SDK and Studio surfaces; do not double-count the
  same action or confuse intent with successful completion.
- Verify opt-out, bounded aggregation/delivery, and delivery failure behavior.
  Allowlist properties; exclude customer content, credentials, arbitrary names,
  URLs, raw exception messages, and stacks.
- Check schema compatibility and explain aggregation, sampling, or delivery loss
  that affects interpretation. Do not expose private edition-specific analytics
  definitions in public code.

Evidence: the event/operation contract, instrumentation tests, privacy and opt-out
checks, and an example query or explanation of the intended measurement. If the
shared infrastructure is not yet available, record a scoped deferral rather than
claiming collection is complete.

### 6. Customer observability

- Assess customer execution tracing and diagnostics separately from maintainer
  usage telemetry. Review applicable `@kortyx/telemetry` and `@kortyx/otel` paths.
- Capture accurate lifecycle facts, correlation identifiers, safe failures, and
  timing. Preserve these facts through exporters and Studio ingestion.
- Account for privacy, delivery loss, incomplete evidence, and exporter failure.
  Diagnostic collection must not change execution outcomes.

Evidence: lifecycle and exporter/ingestion tests, with relevant Studio inspection.

### 7. Compatibility and extension points

- Assess existing SDK consumers, wire formats, stored data, runtime adapters,
  providers, and Node/browser entry points when affected.
- Prefer additive contracts. Include a migration and coordinated release plan
  for incompatible changes, including mixed SDK/API/Studio versions.
- Keep shared capabilities reusable through generic extension points. Verify
  applicable adapter contracts without requiring private repository source or
  embedding private implementation details in public packages.

Evidence: compatibility or adapter tests, consumer builds, and migration guidance.

### 8. Security and privacy

- Assess project/tenant scope, authentication, authorization, input validation,
  and trust boundaries for affected reads, writes, and ingestion.
- Review secrets and customer data across storage, logs, diagnostics, telemetry,
  browser bundles, and generated artifacts. Keep browser configuration public.
- Check retention, resource limits, and cleanup for newly collected or persisted
  data. Add targeted regressions for changed security boundaries.

Evidence: applicable authorization, isolation, validation, and data-safety checks.

### 9. Verification

- Run the checks appropriate to the change: lint, type checking, affected builds,
  tests/coverage, contract tests, database integration, and browser regressions.
- Exercise the supported user journey across affected boundaries. UI changes need
  relevant visual/browser checks, including accessibility and responsive states
  where affected. Reliability or performance claims need corresponding evidence.
- Record exact commands, results, relevant fixtures/environments, and skipped
  checks. Required CI must pass for the final PR head before merge.
- Documentation-only changes need link/content checks; they do not require new
  runtime tests. Preserve existing coverage gates rather than weakening them to
  accommodate unverified behavior.

Evidence: reproducible local results and final CI results. CI success does not
replace a correct applicability assessment or necessary manual verification.

### 10. Release and operations

- For package changes, check exports, files included in the package, workspace
  dependencies, release registration, publishing configuration, and clean
  consumer installation where affected.
- For persisted data or deployments, include migrations/backfills, configuration
  defaults, upgrade order, rollout controls, and recovery behavior where needed.
- Wire new packages and checks into CI. Keep environment examples, container
  builds, installation paths, and deployment instructions aligned.

Evidence: applicable package/build checks, release configuration, and migration
or operational verification. Opening a PR does not itself authorize publishing
or deployment.

## Examples of proportional assessment

- **SDK execution feature:** assess contracts, Studio visibility, developer docs,
  the relevant skill, both telemetry paths, compatibility, and release order.
  Link end-to-end evidence; a passing unit test alone does not complete the feature.
- **Documentation correction:** complete documentation and link/content checks.
  Explain why runtime, Studio, telemetry, and release behavior are unchanged.
- **Internal refactor:** verify behavior and compatibility; explain why user
  guidance and telemetry contracts remain accurate without edits.
- **New public package:** include build/type checks, exports, consumer resolution,
  release registration, and CI coverage, plus the other affected areas.

## Review and enforcement

Authors assess applicability before implementation and update evidence before
requesting review. Reviewers check the assessment against the actual diff and
supported user journey, including omissions and accepted deferrals.

Existing CI provides executable checks such as coverage, integration tests,
build/type checks, lint, security scans, and applicable Studio browser tests. This
policy adds a review requirement; it does not add automated checklist enforcement
or change branch protection. Future automation should validate specific contracts,
links, exports, or release metadata. Changed-file heuristics can identify omissions
for review, but cannot prove that documentation, skills, or Studio behavior are
correct.
