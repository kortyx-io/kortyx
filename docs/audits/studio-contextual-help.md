# Studio contextual help and documentation audit

Date: 2026-10-17. Scope: the public Studio application, website documentation,
portable Kortyx skill, and the locally available Cloud customer UI contributions.
The Cloud contribution audit/verification details remain in its private repository.

## Acceptance criteria

- Cloud and OSS explain shared behavior once. Setup/administration differs only
  where the product actually differs; public docs contain no private infrastructure
  or implementation configuration.
- Unclear table headers, drawer/page headers, metrics, settings and consequential
  form fields have contextual help. When uncertain, include help. Keep essential
  prerequisites, privacy caveats and recovery instructions visible.
- Table header text and explained symbols own help without extra question marks.
  Other compact surfaces use help circles, aligned right in metric cards. Every
  explanatory card has a trigger-pointing arrow and separate **Read documentation**
  footer. Roomy setup/empty/error surfaces may show a documentation button directly.
- Hover/focus opens help; click/tap can pin or dismiss it. Users can move into the
  card, reach its link with the keyboard, dismiss with Escape/outside interaction,
  and keep their parent drawer and current route/filter state.
- Links open in a new tab and target authored, relevant pages/anchors in Studio's
  supported major documentation line. Opening help does not change sorting;
  sorting, resizing and dragging remain available. Required quality gates are preserved.

## Original gaps and disposition

| Surface/concept | Original gap | Treatment | Documentation |
| --- | --- | --- | --- |
| Studio entry | Overview described only self-hosting | Shared overview and explicit setup choices | `overview`, `cloud-get-started`, `run-locally` |
| Runs page/drawer | Execution meaning and completion were scattered | Header help circle | `runs` |
| Runs execution column | Root versus child counts unclear | Column help and child-filter help | `runs#child-workflows` |
| Run status | Interrupt, response completion and failure easy to confuse | Column help and detail context | `runs#status-and-completion` |
| Workflow/path columns | Structure versus observed traffic unclear | Column help | `workflows` |
| Model usage/pricing | Missing usage and partial cost looked like zero | Header/metric help and cost-value cards with footers | `metrics#tokens`, `metrics#cost-and-pricing` |
| Run overview charts | Existing help lacked documentation actions | Reuse footer component | `metrics` |
| Resumptions/tools/quiet periods | Retry, cached reuse, idle and wait could be misread | Existing explanations plus documentation footer | `metrics` |
| TTFT/stream/finalization | Technical timing needed a precise explanation | Signal/chart/trace cards with footer | `metrics#model-timing` |
| Trace/compressed waits | Axis compression and overlap needed explanation | Tab help and existing help with footer | `metrics`, `runs#trace-and-events` |
| Events and event inspector | Occurred/received/ingest delay lacked context | Tab and diagnostic-field help | `runs#trace-and-events` |
| Model I/O/payloads | Missing capture could be mistaken for empty content | Tab/section and result-field help | `runs#captured-content` |
| Feedback | Ratings could be confused with execution or eval status | Column, metric and tab help | `runs#feedback` |
| Sessions | Session meaning and root-run aggregation unclear | Page/drawer and column help | `sessions` |
| Application user/tenant | Application metadata could be confused with Studio access | Column/detail-field help | `sessions#application-identity` |
| Checkpoints/branches | Resume, rollback, fork and inherited history unclear | Column/detail help | `sessions#checkpoints-and-branches` |
| Interrupts | Resolution did not establish successful resume | Page/drawer, status/timing/request/response/outcome help | `interrupts` |
| Workflow map | Published topology and observed connections conflated | Header help; observed-call and inspector help migrated | `workflows#declared-and-observed-connections` |
| Search/filters | Scope and All/Any needed explanation | Filter-drawer help; visible empty-state recovery retained | `exploring-data#search-and-filters` |
| Table views | Persistence and layout scope unclear | Help inside Views menu | `exploring-data#table-views` |
| Live updates | Connection state/fallback semantics scattered | Existing live-state explanation plus page/filter guide | `exploring-data#live-updates` |
| Prompts library/editor | Version/live/tag and composition concepts need orientation | Page/detail-header and important column help | `prompts` |
| Prompt promotion | Existing question mark lacked a documentation action | Shared footer card | `prompts#promotion-policies` |
| Prompt test history | Shared run data needed existing run/metric explanations | Shared run columns and table help | `runs`, `metrics` |
| Evals list/detail | Execution, quality, errors and progress conflated | Headers, results/progress/pass-rate/case/attempt help | `evals#read-results-and-compare` |
| Evals costs/timing | Workflow versus judge cost and phase time unclear | Column/summary help and cost cards with footer | `evals#timing-and-cost` |
| Evaluation settings | Attempts, concurrency, source and timeout scope unclear | Field help outside input labels | `evals#evaluation-settings-and-timeout-reporting` |
| Evaluation comparison | Comparison needed equivalent cases/settings | Shared table help and evaluation guidance | `evals#read-results-and-compare` |
| First-use states | Generic homepage links made users search | Topic-specific documentation button; shared integration guide | `connect-project`, `evals` |
| Read/configuration failures | Operator instructions were wrong for Cloud | Visible edition-aware recovery and documentation button | `configuration-reference`, `cloud-get-started` |
| Self-hosted settings | Operator keys, connection, privacy and eval config unclear | Settings-header help | `credentials-secrets`, `first-eval`, `connect-project`, `configuration-reference` |
| Cloud onboarding | Existing setup link led into localhost/operator instructions | Cloud-specific setup link and API-key help | `cloud-get-started`, `cloud-api-keys` |
| Cloud organizations/projects | Scope versus app tenant/environment unclear | Settings and workspace-creation help | `cloud-workspaces` |
| Cloud SDK keys | One-time secret and credential roles unclear | Settings/creation help; essential secret warning stays visible | `cloud-api-keys` |
| Cloud account/browser sessions | Browser sessions and execution sessions conflated | Account and browser-session help | `cloud-account` |
| Cloud workspace deletion/recovery | Recovery and revoked-key behavior needed explanation | Danger-zone/recovery help; confirmations remain visible | `cloud-workspaces#deletion-and-recovery` |
| Cloud evaluation endpoints | App endpoint credential confused with SDK key | Settings, endpoint and credential field help | `cloud-evaluations#application-endpoints` |
| Cloud provider connections | Studio provider confused with SDK runtime provider | Settings and credential field help | `cloud-evaluations#provider-credentials` |
| Cloud Members/Soon | Preview could be read as a configurable paid feature | Availability help; explicit prose | `cloud-workspaces#feature-availability` |

Existing short action labels (close, copy, refresh, back), full-value overflow
previews, obvious names/dates/identifiers, appearance selection, and short trace-action previews retain ordinary labels/tooltips.
Workflow health and node symbols, provider badges, additional-model counts, live
status, and workflow view/metric/filter explanations use the shared help card.
Catalog health controls are siblings of row-selection buttons to avoid nested buttons.
Their parent feature has conceptual help. No documentation footer is added to a
truncated-value tooltip, and no help button is nested inside another button/label.

## Information architecture and content

1. **Getting Started:** shared Studio overview and SDK connection path.
2. **Using Studio:** shared run/session/interrupt/workflow/prompt/eval tasks.
3. **Cloud:** account setup, workspace scope/recovery, keys, browser sessions,
   evaluation endpoints and provider connections.
4. **Self-hosted:** local installation, CLI, credentials, deployment, configuration,
   upgrades and operations.
5. **Reference:** shared metric definitions and precise behavior.

Eleven missing pages were authored: runs, sessions, interrupts, workflows, metrics,
exploring data, Cloud getting started, Cloud workspaces, Cloud keys, Cloud account,
and Cloud evaluations. Shared eval/prompt pages gained result/cost/promotion anchors.
Old page URLs stay valid. The old Deployment section redirects to Self-hosted;
the existing Operations page stays at its original URL. Sidebar moves do not
change file-based page routes.

## Component contract and integration

`InfoTooltip` composes the existing shadcn/Radix non-modal Popover, Separator and
Button. `documentationUrl` adds the shared separate footer. `HelpDefinition`
requires a label, description and documentation URL; `HelpCircle` consumes it.
A custom `trigger` supports table titles, existing symbols, and numeric cost controls.
`triggerAction="preserve"` retains sorting/view-selection and pointer gestures.
All cards include a Radix-positioned arrow; title help has no native title tooltip. The optional URL
retains compatibility for explanation-only callers; all audited conceptual help
uses a real destination.

`DocumentationLink` provides the same safe external-link behavior in a footer or
standalone button. Generic table/page/detail/settings components accept typed
help data. Studio-specific copy and destinations live in `src/lib/studio-help.ts`;
column definitions attach appropriate topics at feature boundaries. Cloud passes
customer-facing help definitions through the existing Settings contributions.
No new build alias, auth adapter or copied application is introduced.

## Measurement and privacy

The existing bounded usage helper records `studio.help` with allowlisted
`help_action` (`open`, `documentation`) and `help_placement` (`card`, `button`).
Count each closed-to-open transition once, and each documentation navigation intent
once. For adoption, compare summed footer-documentation counts to summed card-open
counts; standalone-button intents are a separate population. Counts measure
interactions, not unique users, successful page loads, or completed reading.

No labels, descriptions, paths, URLs, customer IDs, payloads or credentials are
added. Existing analytics opt-out, bounded aggregation/delivery and failure
behavior apply. Browser verification disables external collection. Customer
execution telemetry, OpenTelemetry exporters and workflow outcomes are unchanged.
Best-effort delivery and aggregation mean these counters are not exact funnels.

## Next edits and release order

1. Publish the website documentation before releasing new Studio destinations.
2. Merge/synchronize the shared public implementation into Cloud, then release its
   private contribution changes. Cloud verification uses an isolated local snapshot
   of that combined source, not a deployed instance.
3. Apply the contextual-help requirement in future feature PRs; update the central
   topic map and verify destinations whenever terminology/behavior changes.
4. Observe aggregate help use and onboarding completion after release; revise copy
   based on recurring questions without hiding required instructions in popovers.

Targets: first real observed run within 15 minutes; improved quickstart completion;
all audited help destinations resolve; recurring errors have documented recovery.
No before/after onboarding outcomes have been measured in this change.

## TS/JS coverage

New concept/Cloud guides are prose-only and introduce no TypeScript-only snippets.
Shared connection and first-eval guides remain the source for paired TypeScript /
JavaScript integrations. Existing snippets were not rewritten for this UI change.

## Completion assessment and verification

| Area | Assessment and evidence |
| --- | --- |
| Behavior and contracts | Complete: additive typed UI help props; public API/runtime behavior unchanged; navigation and overlay browser checks |
| Studio integration | Complete for the changed UI: shared tables, headers, metrics and detail surfaces; real ingestion fixtures and Cloud native local contributions verified |
| Documentation, examples and contextual help | Complete in source: 11 new pages, 45 central topics, shared/edition-specific navigation, validated links/anchors and screenshots |
| Kortyx skill | Complete: `skills/kortyx/references/studio-local-development.md` distinguishes Cloud setup from operator configuration |
| Usage telemetry | Complete: additive generic operation, action/placement allowlists, no content/URL collection, existing opt-out/budget/delivery tests |
| Customer observability | Not applicable: execution telemetry, exporters and workflow outcomes unchanged |
| Compatibility and extensions | Complete locally: public and selected Cloud-profile type checks; existing contribution contract retained; coordinated source sync required before release |
| Security and privacy | Complete for scope: static docs URLs, safe new-tab links, no new credentials/content; Cloud browser proof uses synthetic local fixtures |
| Verification | Complete locally: commands and explicit limits below; no CI results claimed |
| Release and operations | Complete preparation: existing package/build wiring retained; docs first, public synchronization, then Cloud release; no deployment performed |

Passed local commands:

- `pnpm dev:prepare`: required SDK/API dependencies built.
- `pnpm --filter kortyx-studio test`: 342 tests across 71 files.
- `pnpm --filter kortyx-website test`: 116 tests across 10 files, including every central help destination/heading and authored Markdown links.
- `pnpm --filter @kortyx/usage-telemetry test`: 48 tests and its type check, including content exclusion and existing opt-out/bounded-delivery behavior.
- `pnpm --filter kortyx-studio type-check` and `pnpm --filter kortyx-website type-check`.
- `KORTYX_USAGE_TELEMETRY_DISABLED=1 pnpm --filter kortyx-website build`: 567 static pages generated. Existing dynamic-filesystem tracing warning in docs package-version detection remains; that code was not changed.
- `KORTYX_USAGE_TELEMETRY_DISABLED=1 pnpm exec dotenv -e .env.example -- pnpm --filter kortyx-studio build`.
- `KORTYX_E2E_STUDIO_URL=http://localhost:6311 KORTYX_API_URL=http://localhost:6411 API_PORT=6411 STUDIO_PORT=6311 KORTYX_USAGE_TELEMETRY_DISABLED=1 KORTYX_HELP_WEBSITE_URL=http://localhost:6211 KORTYX_HELP_SCREENSHOTS=<thread-screenshots> pnpm exec dotenv -e ../../.env.example -- playwright test contextual-help.spec.ts` from `apps/studio`: four browser scenarios plus setup/cleanup pass. Covers hover-to-footer, keyboard Tab/Escape/focus restoration, independent sorting, local website navigation in a new tab, drawer Escape isolation, actual mobile touch, light/dark appearance and screenshot placement.
- Cloud selected-profile/contribution type checks, 11 focused contribution tests, and native local Keycloak/PostgreSQL browser proof passed in the isolated combined-source checkout. Details remain in Cloud's private audit; this does not claim deployed/private CI coverage.
- Biome on affected code: no errors; pre-existing warnings in touched files remain. `git diff --check` is clean.

Screenshots were captured from running application code using reserved/synthetic
local fixtures: `oss-table-help-dark.png`, `oss-run-drawer-help.png`,
`oss-settings-help-mobile.png`, `oss-evaluation-help-light.png`,
`cloud-onboarding-help.png`, `cloud-api-key-help.png`,
`cloud-evaluation-credential-help.png`, `cloud-provider-help-mobile.png`, and
`cloud-documentation.png`. Popover screenshots wait for their opening animation.

Not run: the entire pre-existing browser matrix, a Cloud production build, live
staging/production verification, or remote CI. Existing gates were not weakened.
No private CI was requested or triggered. No commits, pushes, PR creation,
publishing or deployment were performed.

## Bulk review adjustments — 2026-10-18

- Removed question marks from shared table headers; title hover/focus opens help.
  Sorting and column drag/pin/resize remain available.
- Right-aligned help in run signal/chart cards and shared detail metrics.
- Added arrows to help cards and corrected the compact action-tooltip arrow.
- Migrated workflow health/node symbols (including catalog health), provider and
  additional-model badges, run topology states, live status, and workflow view/
  emphasis/health-filter explanations. Cloud also migrated its masked-secret hint.
- Added shared workflow-health and node-state docs anchors and clarified their
  period summaries versus individual-run topology state.
- Studio type check and all 342 unit tests passed. Cloud-profile type check and
  seven focused private contribution tests passed. All 47 help-destination/anchor
  checks passed. Both public production builds passed (the existing website tracing
  warning remains). No remote CI, commits, pushes or deployment were performed.
- Browser checks: all five contextual-help scenarios passed; column layout,
  drag/pin, workflow range/selection/history, and live-refresh scenarios passed
  (19 scenarios total, plus fixture setup/cleanup). The header scenario was rerun
  after making its locator distinguish the actual title button from its existing
  draggable wrapper. Screenshots are under the thread's `screenshots/bulk-review`.
- Native local Cloud browser verification also passed with the same ingested
  synthetic run: table title help/sorting, right-aligned metrics, workflow symbols,
  masked-key explanation, endpoint credential help, nested Escape, and mobile touch.
  No Cloud production build or remote CI was run.

Keyboard verification also exposed a saved-preference/default race during repeated
sorting. Runs, sessions, and interrupts now keep explicit sort/direction parameters
in the URL instead of clearing them when they match a changing preference default.
Headers expose `aria-sort`; Enter/Space on the title do not activate the surrounding
keyboard drag handle. Help is suppressed during active column drags so Escape
cancels the drag rather than consuming the key to dismiss help. Final native Cloud
verification includes mouse/Enter/Space direction changes and passed.

Final rerun: `playwright test contextual-help.spec.ts table-columns.spec.ts
time-range-workflows.spec.ts live-refresh.spec.ts` against OSS 6311/API 6411
(with local consumer 6511): **21 passed**, including fixture setup/cleanup. All
19 browser scenarios pass on the final source, including Enter/Space sorting,
touch title help, and Escape cancelling an active drag. Final Studio unit suite
remained **342 passed**; public and Cloud-profile type checks and the public
Studio build passed after the interaction fixes. Both repositories passed
`git diff --check` and changed-code Biome checks without errors or warnings.
The synthetic OSS run was re-seeded after test cleanup for manual review.

## Arrow refinement — 2026-10-18

Replaced duplicated clipped triangles with the shared `OverlayArrow`. Its 16×8
SVG has a subtly rounded tip, visible overflow for complete edge strokes, and
1.5px of fill overlap into the panel. There is no horizontal border crossing the
arrow base. A single panel drop shadow follows the panel and arrow silhouette.
Both help and compact tooltips use corner padding and viewport collision padding;
Radix retains side rotation, alignment, flipping and safe hiding when an arrow
cannot point at its anchor. This changes presentation only; authorization, URL
contracts, analytics, customer telemetry and SDK behavior remain unchanged.

Local visual proof used an isolated temporary fixture rendering the actual shared
components, with top/right/bottom/left placement, light/dark themes, and device
pixel ratios 1, 1.25 and 2. **48 captures** passed attachment and trigger-centering
checks; **24 edge-collision checks** passed. Pixel samples at all **48 joins**
matched the panel fill (no border seam). The fixture was removed from the scratch
app after verification; screenshots, geometry, fixture and scripts remain in
`screenshots/arrow-review` under the thread artifacts.

Studio type check, production build, and both focused cost-component tests passed.
The existing browser help scenarios now also check arrow attachment, pointing and
unclipped overflow in actual table, drawer and workflow-symbol cards. Cloud uses
the same public component through the running combined-source preview. No new CI
workflow was added, and no CI, push, commit, publication or deployment was triggered.
The visual matrix was run in local Chromium; other browser engines were not run.

Actual OSS help browser regression: **7 passed** (five scenarios plus setup and
cleanup), with stable post-animation geometry checks. Actual light/dark header
close-ups were captured at 2× device scale. OSS review fixtures were restored.
The auxiliary OSS checkout disappeared during verification and its preview
harness stopped all disposable services; Cloud was restored with the existing
public preview kept separate. No shared runtime/remote deployment was changed.

Final Cloud native browser proof passed after restoring disposable services: table
header, metric, node symbol, masked-key and credential cards, nested Escape, and
mobile touch/placement. The selected Cloud-profile type check also passed. Both
review previews remain healthy (OSS 6311, Cloud 6313). No CI was triggered.


## Latest Cloud and plain-language audit — 2026-10-18

This follow-up supersedes the original Cloud baseline. The local Cloud preview
was updated to the then-current Cloud implementation while preserving the shared
help changes and current account behavior. Detailed Cloud checkout and integration
evidence remains in the private audit; this public report describes customer
guidance and shared Studio behavior.

The audience is a first-time Studio user. All 58 central topic descriptions now
use everyday words, define unfamiliar concepts, and explain what a value or action
means. Column-specific explanations replace generic topic copy where needed.
Models/providers no longer display token help. Evaluation repetitions, concurrency,
case timeouts and whole-evaluation timeouts each explain their own effect. Timing
help explains TTFT, p50 and p95 in words; missing data and partial prices remain
explicit. Existing symbol triggers, arrows, sorting, and footer behavior remain.

New Cloud coverage includes name editing, verified email, pending email changes,
passwords, optional passkeys, connected sign-in methods, method removal, identity
confirmation, browser-session headers, account deletion, project name/ID and the
optional passkey onboarding prompt. The account guide now documents each flow,
including current-email access until verification, resend/cancel, cooldowns and
recovery. Destructive prerequisites stay visible. Header help preserves first-field
focus in profile/deletion dialogs and Cancel focus in method-removal dialogs.

Copy example: “execution lifecycle” becomes “working, waiting for input, finished,
or failed.” Email help says “Your current email keeps working until you verify the
new address.” Technical implementation details stay out of customer help.

Documentation remains shared for shared features, with edition-specific setup and
account guides. No duplicated OSS/Cloud feature manual or new SDK API is needed.
This follow-up adds prose only; there are no new TypeScript/JavaScript examples to
keep in sync. The portable skill points account questions to the Cloud account guide.

Local verification: Studio type check and 342 tests; website build and 131 tests
(including 58 topic URLs/anchors and relative-link checks); OSS Studio production
build and seven help browser checks passed. Latest Cloud selected Studio and
contribution type checks, 149 contribution tests, and three profile browser tests
passed. Native Cloud account/SMTP and screenshot proof is recorded in the private
audit. Review previews use disposable data; email is captured locally.

Changed-code Biome reports no errors, with 15 existing non-null assertion warnings
and one existing fragment suggestion in prompt components. Both diffs pass
`git diff --check`.

No CI, commits, pushes, PRs, publishing or deployments were triggered. The new docs
are authored and available in the local website preview; publishing them remains
part of the eventual release. External Google/GitHub authorization, hardware
passkeys, other browser engines, Cloud production build and live deployment checks
were not run. Follow-up adoption measures remain the original audit's help opens,
documentation visits and onboarding completion; no text, credentials or URLs are
added to telemetry payloads.

The subsequent [documentation restructure](documentation-restructure.md) gives
Cloud, self-hosting and the shared CLI separate entry points and replaces the
flat Studio index with task sections. It supersedes this audit's original sidebar
organization. All 58 help destinations remain supported through canonical pages,
permanent redirects and historical heading forwarding; verification and release
order are recorded in that follow-up audit.

### Header controls follow-up (2026-10-24)

The current shared header uses a separate help circle immediately left of the
column menu. Both controls appear on hover or keyboard focus and overlay the
label without changing its width. The title retains sorting and dragging; the
help circle opens the explanation without sorting. This supersedes the earlier
title-trigger decision above. Help still prefers the top edge when space permits,
and opening another tooltip dismisses the previous card.
