# OSS evaluation workspace verification

## Acceptance criteria

- Runs opens All conversations with a Suite column and one case row per suite.
  Selecting a suite filters that same mounted table; clearing it restores all
  conversations. Search, columns, filters, and case identity stay consistent. The
  conversation table stays visible; Suite details opens saved Definition and
  Configuration in a platform drawer. Selecting a suite introduces no tabs,
  nested header, or duplicate stats. The parent summary uses the shared Runs metric design with one total-cost item
  with a workflow/judge breakdown tooltip. Legacy standalone suite and
  conversation URLs remain readable.
- Suite navigation previews status, progress, outcomes,
  workflow/judge/total cost, duration, pass rate, and queue time on hover or focus.
  The full name is readable even when the rail truncates it.
- Results use one shared DataTable row per case. Repetitions summarize all requested
  executions; opening a row uses the platform drawer and an individual Repetition
  dropdown. Every selected case runs N times, including passed cases.
- Mixed quality requires recorded passes and failures in a finished case. Errors,
  pending grading, cancellation, and not-run executions remain distinct.
- Changes appear in the run and conversation DataTables. Clickable groups and
  right-side icons open a wide comparison modal with independent repetition
  selectors and whole-conversation stats. Comparison baseline chooses an earlier
  run in the table or modal using a compact fixed label and a wider menu.
  Changed context and incomplete grading have no score delta. Legacy standalone
  comparison pages and their platform drawers remain readable.
- Costs remain visible at evaluation, suite, case, repetition, and comparison
  levels. Case totals sum repetitions; mean cost deltas require complete comparable
  prices in the same currency. Missing prices stay incomplete; currencies are not
  converted or merged.
- Live browsing reads compact summaries. Case evidence loads for the selected
  repetition. Saved comparisons load on selection or explicit refresh, rather
  than reading full results on every execution event.
- Integrate PR #383 after merge: deterministic check evidence, failed-case reruns,
  preserved recorded settings, current-definition notice, original result
  preservation, read-only sample boundaries, and mixed-result guidance.
- Keyboard focus, Escape, nested workflow drawers, browser Back/Forward, direct
  reload, table filtering/preferences, and a 390px viewport remain usable.

## Completion assessment

Rebased onto `f72bedca` after PR #383 merged. Its deterministic checks,
failed-case reruns, read-only sample boundaries, and strict mixed-result rules
are included in the combined UI. All conversations is now the default; suite
selection filters one mounted conversation table. Run metrics reuse the Runs
Metric component and strip layout. The final refinement is verified below; the production checks describe the earlier
layout, and the final development checks cover the current feedback build.

| Area | Status | Evidence / boundary |
| --- | --- | --- |
| Behavior and contracts | Complete | Grouping, costs, suite/case identity matching, navigation, stale-request cancellation, and rerun regressions. Repetitions execute passed cases too. Reruns deduplicate failures, preserve settings, and create a fresh evaluation while leaving the original results intact. No new public or persisted contract. |
| Studio integration | Complete | Existing DataTable, Dialog, DetailDrawer, DetailLink, and DetailInspectorDrawer reused. Compact live summaries and scoped case evidence retained. Browser checks cover late billing, failure evidence, repetition reload, suite selection, and comparison navigation. |
| Guided tours and page help | Complete | Stable lesson IDs retained. Evaluation lessons target grouped evidence rather than the removed suite header. Page help covers comparison routes, the tabless suite workspace, and the active Suite details inspector. All six full-tour chapters plus restart, reload, mobile, and missing-target recovery pass. Reassessed after #383 and removal of workspace tabs. |
| Documentation, examples, and contextual help | Complete | Studio README, website evaluation results/reference, field/column help, and repetition/comparison anchors updated. Suite facts work on hover/focus; cost breakdown uses keyboard/touch-capable shared help. Browser checks cover drawer controls and narrow-screen use. Documentation/catalog/link tests pass. No SDK example changes needed for this UI. |
| Kortyx skill | Complete | Studio/CI reference describes workspace drawers, repetitions, comparisons, cost interpretation, and merged rerun/check behavior. Existing reference links retained; no router change needed. |
| Usage telemetry | Complete | Existing studio.inspect operations measure explicit select/compare/inspect actions. Only bounded surface/action/tab enums; no IDs, names, URLs, outputs, or evidence. Existing usage opt-out/privacy and table-interaction tests pass in the Studio unit suite. Counts represent inspection intent, not successful evaluation completion. |
| Customer observability | Not applicable | No new SDK trace/exporter facts. Existing diagnostics, execution links, evidence, and late billing remain inspectable and covered by browser checks. No private adapter coverage claimed. |
| Compatibility and extension points | Complete | Existing saved schemas, auth/shell/table/live APIs, and legacy standalone routes retained. Zero-based baselineAttempt/candidateAttempt query keys remain behind Repetition labels. Historical evalTab context/definition links open the corresponding saved section in Suite details. Opaque IDs and Back/Forward/reload are covered. |
| Security and privacy | Complete | Reads use existing project/environment authorization and runtime schemas, including the request-scoped Studio comparison summary endpoint and authenticated sample visibility routing. Path IDs are encoded. Sample mutations and permission gates retained; no new credentials, collected data, or telemetry fields. Existing auth/sample/usage regressions pass. |
| Verification | Complete | Latest comparison refinement: type checking, 573 Studio unit tests plus 3 new numeric trend tests, 30 browser checks plus 10 after the trend UI, and the final targeted modal checks below. Earlier workspace refinement: 558 Studio unit tests, 96 documentation tests, 3 telemetry-db sample tests, 24 browser checks plus 12 checks after adding multi-suite repetition samples. Earlier production builds and 58 selected browser checks also verified (57 in the broad run; the corrected assertion plus the workspace journey passed a 4-check targeted rerun). Required PR CI remains unrun for these uncommitted changes and must pass before merge. |
| Release and operations | Not applicable | Existing Studio bundle; no added dependency, package, environment variable, migration, or deployment. Authored sample version advances to 6 with complete captured repetition evidence. Main's live-projection migration remains its existing prerequisite. Publishing/deployment is outside this task. |

## Local validation

Environment: local PostgreSQL on port 6543, API on 6400, production Studio on
6302, deterministic eval consumer on 6501, and the read-only sample project.
`pnpm dev:prepare` rebuilt all 20 workspace dependency tasks successfully after
#383. Production Studio builds succeeded as part of Playwright server startup.

- `pnpm --dir apps/studio exec tsc --noEmit`: passed.
- `pnpm --dir apps/studio exec vitest run`: final clean run **555 passed in 101
  files**. An earlier run had one sample-content timeout during concurrent builds;
  its isolated rerun (12 tests) and the complete final rerun both passed. No
  timeout or quality gate was relaxed.
- `pnpm --dir apps/website exec vitest run src/lib/docs/index.test.ts src/lib/docs/studio-help-links.test.ts src/lib/docs/documentation-structure.test.ts`:
  96 passed in 3 files.
- `pnpm exec biome check <54 changed TypeScript files>`: passed, with 26 existing
  non-null-assertion/array-index warnings. `git diff --check`: passed.
- Production Playwright: `eval-easy-wins`, `eval-workspace`, `evaluation-runs`,
  `eval-navigation`, `eval-live-costs`, `eval-structured-outputs`,
  `eval-settings-errors`, and `sample-tour`: 57 of 58 passed. The remaining
  assertion matched a hidden retained full-page copy; scoped it to the visible
  tabpanel and reran it with the workspace journey against a fresh production build.

- Final production recheck: comparison history/reload and the workspace journey
  (including cost tooltip, tabless Suite details drawer, direct reload/close,
  and suite-scoped Compare run) **4 passed**, including setup/cleanup. This
  resolves the broad run's sole failure. The other 57 checks passed above.
- Related onboarding checks: **75 passed in 9 files**, included in the final
  Studio unit run. Full six-chapter browser tour, pause/resume, mobile spotlight,
  and missing-target recovery passed in the broad browser run.

Visual evidence was inspected and copied to the task's local visualization
folder: suite-workspace.png, suite-preview.png, suite-details.png, comparison.png,
grouped-repetitions.png, mobile-drawer.png, rerun-failed-cases.png,
deterministic-checks.png, and failed-output-check.png.

Unrun: required PR CI (no PR/head published), full repository coverage and
integration suites beyond the affected browser journey, private Cloud adapter
and deployment suites, container builds, and deployment. These existing gates
have not been modified or claimed as passing.

## All conversations and metric-strip refinement

Affected surfaces: evaluation results, suite filter, run metric strip, full-page
case return links, and guided help. Uses one live subscription with at most four
concurrent compact summary reads. Suite filtering does not refetch or remount the
table; versioned live refresh retains known results and reports partial failures.
Full conversation evidence still loads only for the chosen repetition. No public
API/schema, telemetry property, auth boundary, dependency, or migration added.
The API, Studio on 6302, and local eval consumer remain running for feedback.

Final refinement checks:

- `pnpm dev:prepare`: 20 dependency build tasks passed, including new authored
  repetition sessions in telemetry-db.
- Studio full unit suite: **558 passed in 102 files**; `tsc --noEmit`: passed.
- Website documentation/catalog/link checks: **96 passed in 3 files**.
- telemetry-db sample tests: **3 passed**. Samples now have 58 root executions,
  25 sessions, and 65 child executions; observed specialist-call totals agree.
- Feedback browser checks using the existing live servers: **24 passed** across
  workspace, evaluation launch, structured outputs, reruns, settings/errors, and
  sample tour. After the final two-suite fixture update, workspace and tour:
  **12 passed**, including all six full-tour chapters and mobile/recovery paths.
- Final affected TypeScript formatting/lint and `git diff --check`: passed.
- Both consistency samples include Support quality and Resolution safety. The
  three-repetition example records 6/6 outcomes (5 passed, 1 failed); the
  two-repetition example records 4/4 (all passed). Every sample parent has at
  least two suites. Each case stays one table row. Browser checks filter one
  suite, restore All conversations, and inspect a failed repetition and a pass.
- Header actions removed as requested; execution settings follow total cost.
  Filtered/unfiltered toolbar positions are equal. Shared table headers use the
  available width and reserve menu space only during interaction.
- Outcome status lines reserve the same height with or without contextual help.
  Live browser measurements of the mixed and passed sample rows are 71px each
  with both mouse and touch contexts; the mixed-results help still opens. The
  touch target minimum remains intact. Targeted Biome and diff checks passed.
- Visually inspected the multi-suite repetition workspace and updated
  All-conversations layout. Screenshots copied to the task visualization folder.

No schema, ingestion, authorization, or SDK runtime behavior changes were needed
for the sample extension. All evidence uses authored sample identities and real
sample projection reducers, including workflow links and priced costs. Sample
mutations remain disabled. Required PR CI and the other unrun checks above remain
unrun; these changes are not published or deployed.


## Comparison cells, baseline selection, and conversation trends

Affected surfaces: both evaluation DataTables, the shared header drag control,
the wide comparison modal, sample-project API routing, page help, and the saved
comparison guided lesson. The latest user review adds a baseline selector inside
the modal and stats for every repetition, followed by independent evidence
selectors. The broader conversation drawer layout is unchanged in this iteration.

- The run list uses the requested default order: Evaluation run, Status, Progress,
  Results, Changes, Pass rate (%), Duration, Cost, Application, Trigger / Commit,
  Judge, Judge version, Queue time (ms), Created. Persisted user layouts still win.
  Compare selected and selection checkboxes are removed.
- Clicking groups or the right-side comparison icon opens the same modal. Icons
  have an Open comparison tooltip. Conversation Change cells include the icon
  even for a one-sided result. Cells retain the existing table row height.
- Comparison baseline stays a fixed label in both locations. A 28rem menu is
  independent of the trigger width and constrained to the viewport. Radio items
  name the earlier evaluation and its timestamp. Choosing a modal baseline keeps
  the selected conversation when present and does not modify the table baseline.
  Subsequent navigation browses the new comparison. Loading hides stale evidence;
  failed reads offer Retry comparison. Evidence reads retain their own retry.
- Both sides show pass rate, each outcome count, total and mean execution time,
  total cost with breakdown, and mean cost when completely priced. This run
  includes numeric arrows: higher pass rate, fewer failures, less time/cost are
  improvements. Count/total indicators are hidden when repetition counts differ;
  normalized means remain comparable. Pass-rate differences use the requested % label (60% to 100% shows ↑40%). Unchanged values have no indicator. Incomplete/context-changed comparisons have no numeric
  trend; missing duration and partial/multicurrency prices never become zero.
- Compact comparison summaries are computed server-side. The Studio-only GET
  composes existing authorized reads with request project/environment scope and
  no-store responses. Auth, sample visibility and UUID validation precede reads.
  Only selected case/repetition transcripts reach the browser. Sample routing
  explicitly allows this read-only composition without real-project credentials.
  Denial, hidden samples, scope forwarding, safe errors, invalid references,
  deduplication, bounded concurrency and stale evidence are covered by tests.
- Shared header pointer activation now captures explained-header events before
  help controls stop bubbling. Sorting, resizing, help, pinned headers, chooser
  keyboard controls, and persisted ordering retain their shared implementations.
- The existing studio.inspect compare intent and studio.eval read operation are
  reused. No new customer-content telemetry, SDK execution observability facts,
  public SDK/wire contracts, stored records, dependency, or deployment is added.
  Documentation, skill references, current-page help and the stable guided lesson
  explain the final flow. The all-six-chapter tour covers the modal evidence.

Verification before the trend refinement: 573 Studio unit tests in 106 files,
96 documentation tests, clean TypeScript, 84-file Biome check (warnings only),
and all 30 browser checks across comparison cells, workspace, sample tour and
shared tables. Final trend refinement: 3 new numeric trend tests plus the affected guidance
checks (24 passed), 10 browser checks across change cells and sample tour, then
3 targeted modal/mobile checks after hiding unchanged indicators and 2 checks
after changing the pass-rate label to %. A final baseline-menu visual check also passed. The six-chapter walkthrough completed.
TypeScript and the 96 documentation checks passed again. Final affected-file
Biome check passed for 87 TypeScript files with 43 assertion/index warnings;
no errors or quality gates were suppressed. `git diff --check` passed.
The browser checks reuse the live feedback servers without fixture cleanup.
A fresh production build is not run against the active development .next output;
required CI, deployment/container builds and private adapter checks remain unrun.
The API, Studio on 6302 and deterministic eval consumer stay running.

Final visuals inspected: modal-baseline-and-stats.png and comparison-baseline-menu.png
(copied to the task visualization folder). The final menu is visibly wider than
its trigger, stays above the modal, and displays full authored run names/dates.
Temporary feedback test configuration was removed; all three servers remain running.

Repetition selector placement refinement: both modal sides now order the run name,
Repetition dropdown, date, then aggregate stats. Existing desktop and 390px mobile
comparison journeys both passed, including independent repetition selection and
unchanged aggregate stats. Biome and diff checks passed; the desktop visual was
inspected and saved as comparison-repetition-position.png. Guidance targets and
semantics are unchanged. The feedback servers remain running.

Modal header alignment refinement: the conversation title and summary sit left;
the Comparison baseline button and selected run name form two right-aligned rows.
At narrow widths these groups stack. Three existing desktop/mobile/baseline
journeys passed, along with Biome and diff checks. Visual inspected and saved as
comparison-header-position.png. Help anchors and behavior remain unchanged;
feedback servers remain running.

Header structure correction: suite name/help and the native DialogClose button
share a dedicated top row. A separate lower row contains the title/summary on
the left and baseline button/name on the right, with matching first-row heights.
The shared default absolute close button is disabled for this modal. Desktop,
mobile and baseline-change journeys passed (3 checks), including close behavior;
Biome/diff checks passed. Visual inspected as comparison-header-rows.png.

Comparison separator correction: uses the shared Separator in its own centered
1px grid column with equal gutters and equal evidence-column widths. Removes
the old left-edge divider/right-only padding. Mobile uses a horizontal shared
separator. Existing desktop/mobile journeys passed (2 checks); Biome and diff
checks passed. Visual inspected as comparison-centered-separator.png. Guidance
semantics and anchors are unchanged. Servers remain running.

## Final URL navigation and selected-repetition refinement

Final affected surfaces: shared DataTable's filtered-row callback, run-list and
workspace comparison entry points, modal URL state, individual and aggregate
statistics, missing-result sides, current-page help, and the saved comparison tour.

- Typed nuqs state owns `changeRun`, `changeCase`, `changeBaseline`, `changeGroup`,
  `earlierRepetition` and `currentRepetition`. All user selections push history;
  modal close clears only those keys. The table baseline uses `changesSince`
  with a server-aware nuqs update/transition. Existing changeCase-only lesson
  links still work using the evaluation route. Child execution/detail links
  discard modal parameters while retaining actual list context.
- Browser Back/Forward restores conversation, baseline, group and independent
  repetition choices. Reload/share work from both the run list and conversation
  table. Previous/Next and Left/Right keys navigate the selected group or the
  table's matching rows in display order across pagination; controls/editors
  retain their keyboard behavior. Heading autofocus has no visible outline;
  interactive controls retain keyboard focus styling.
- The shared DataTable exposes an optional filtered-row callback. The evaluation
  workspace uses it to keep modal navigation in the table's suite/search/filter
  scope. Existing shared-table behavior and tests remain unchanged.
- Selected repetition stats update with each dropdown: outcome, execution time,
  workflow/judge/total cost and recorded steps. Their deltas compare precisely
  the two chosen executions with saved-context validation; unrelated incomplete
  repetitions do not invalidate a complete matching pair. All repetitions totals
  and averages remain below a shared separator and stay fixed when selecting
  evidence. No-change or non-comparable indicators are hidden; red worsens,
  green improves; pass-rate differences use the requested % label.
- Standalone explanatory banners were removed. Context is available through the
  header change-status popover; actual load failures keep visible retry actions.
  A missing side renders only its heading and one no-result message, aligned
  with the other side's run name. No name/date/selector/empty stats placeholders.
- Comparison reads retain bounded, scoped data: UUID validation, existing auth
  and project/environment credentials, sample visibility, compact server summaries,
  selected-case evidence, cancellation fences and a bounded eight-entry cache
  owned by the mounted surface. Retry and stale/out-of-order responses have
  dedicated hook regressions. No new public SDK schema, SDK behavior, telemetry
  property, stored record or migration is introduced.
- Updated website, Studio README, skill reference and page-help copy; stable
  guided lesson IDs/anchors retained. Full six-chapter tour still completes.

Final validation:

- Studio unit suite: **581 passed in 109 files**, including two comparison-read
  retry/cache/stale-response tests and three selected-repetition metric/context
  tests. TypeScript: clean.
- Browser checks: **33 passed** across change cells, URL history, suite workspace,
  sample tour and shared tables; then **13 passed** after splitting selected
  stats from aggregates. Tests cover reload/Back/Forward, groups, arrow navigation,
  preserved suite/search scope, independent repetitions, actual selected cost
  changes, fixed aggregate totals, retry and mobile. A new-history failure
  was a test-selector issue (textbox vs searchbox), corrected without changing
  product behavior or test timeouts.
- Empty-side final visual check: both run-name/message y coordinates are equal;
  the missing side renders zero stats cards. Screenshot inspected and retained.
- Documentation checks: **96 passed**. Final Biome check: **97 TypeScript files**,
  zero errors, 51 assertion/index warnings (not suppressed). `git diff --check`
  passed. Empty-side visual measurements were 224px for both the run-name and
  no-result message; the missing side had zero stats cards.
- Earlier production build results are historical only. No fresh production build
  runs against the active development .next output. Required PR CI, private Cloud
  adapter checks and deployment remain unrun. No publication/deployment performed.

The temporary feedback test config is removed after verification. Studio 6302,
API 6400 and deterministic consumer 6501 remain running for user feedback.


## Suite browsing and inspection hierarchy refinement

Acceptance: Suites opens a dedicated conversation DataTable, with search, filters,
column controls and one definition inspector. Selecting a conversation/step is
shareable and survives reload; closing retains table state. Saved Suite details
shows the executed snapshot summary and execution settings, with additional
configuration collapsed. Conversation results and comparison share selected
repetition metrics, assessment, readable messages and progressive evidence.
Aggregate repetition facts remain separate at the bottom. Comparison uses a
shared URL-backed step selector and CSS subgrid to align assessments/messages.
Repetition choices remain independent. Subtle semantic success/danger accents
mark assessments; blue accents distinguish input. No execution or comparison
semantics were changed.

| Area | Assessment and evidence |
| --- | --- |
| Behavior and contracts | Complete: existing IDs, definitions, verdicts, cost reducers and API contracts retained. Definition selection and comparison step are nuqs state. |
| Studio integration | Complete: four inspection/browser flows checked against read-only sample data and existing deterministic consumer fixtures, including actual launches, structured outputs, missing IDs, workflow drill-down and history. |
| Guided tours and page help | Complete: suite/conversation/comparison copy revised, stable lesson IDs retained, all six full-tour chapters completed in Chromium. New definition table headers own contextual help. |
| Documentation and examples | Complete: Studio README, evaluation results guide and sample help describe current definitions versus saved snapshots, selected metrics, bottom aggregates and aligned steps. |
| Kortyx skill | Complete: studio-evals-and-ci reference updated for the new browsing/inspection journey. |
| Usage telemetry | Complete: definition inspection reuses studio.inspect with constant evals/definition properties; existing result/comparison operations retained. No customer text or identifiers added to usage properties. |
| Customer observability | Not applicable to emission: no execution/tracing contract changes. Existing workflow links, failures, criteria, deterministic checks, verification, costs and raw evidence remain inspectable. |
| Compatibility and extensions | Complete for OSS: canonical suite/case URLs, old comparison routes, saved snapshots and launch settings remain readable. Removed the obsolete intercepted catalog-suite route; suite browsing is a workspace. Private Cloud adapter validation is unrun. |
| Security and privacy | Complete for changed rendering: existing authorization/data reads retained; response Markdown disables raw HTML and executable links (new regression). Sample reads remain immutable. |
| Verification | Complete locally: results below; CI and production checks remain unrun. |
| Release and operations | No schema migration, release or deployment. Studio, API and consumer remain running for feedback. |

Verification:

- Studio units: **582 passed, 110 files**, with four workers to avoid contention
  with the active dev server. Initial overlong tour copy was shortened to satisfy
  the existing copy limit; an unrelated cold-import timeout passed on the bounded
  worker rerun. No quality limits were relaxed.
- Studio type-check script: passed, including strict sample SDK contracts. The
  repeated sample's validated snapshot/optional prompt-receipt boundary was made
  explicit to satisfy exact optional types without changing recorded evidence.
- Final browser refinement: **20 passed**, plus **2 passed** for the saved-context
  layout and half-width multi-step definition navigation. Includes all four new
  flows, repetition cost changes, aligned sections, URL history, retry, header
  dragging, navigation progress/cancellation and the full guided tour.
- Earlier broad browser sweep: 41 passed; seven obsolete/new-test assumptions
  were corrected and passed in the final refinement. Cases now open from the
  definition table, multi-step checks select the appropriate case/step, and
  navigation tests filter their fixed fixture explicitly rather than assuming it
  remains on page one as new test/user runs accumulate. No data was reset.
- Documentation: **76 passed in 3 files**. Biome on 28 affected TS files passed
  with eight existing index/assertion warnings; follow-up changed files checked
  separately. `git diff --check` passed. Screenshots inspected for the four flows
  in dark appearance and comparison at mobile width; light appearance was also
  inspected during iteration.
- Production build, private Cloud adapter, PR CI and deployment remain unrun.
  No production build was run against the active development output directory.

The temporary feedback Playwright config is removed after checks. Studio 6302,
API 6400, consumer 6501 and existing sample/user data are preserved.


Suite table framing follow-up: removed the extra DetailPage frame and moved the
suite header into DataTable.header. The shared table now owns the only rounded
border; the platform inspector provider remains. Removed the Current definition
badge and instruction line. Browser inspection confirmed the header belongs to
the table, zero additional framed ancestors, the conversation drawer still opens,
and the removed text is absent. Studio type-check, targeted Biome and
git diff --check passed. Servers remain running.


Definition navigation footer follow-up: added an optional retained footer slot to
the shared inspector, using SheetFooter outside its scrolling body. Previous,
position and Next now span the drawer and stay at the bottom. Browser measurements
with expanded raw content confirmed unchanged footer y=738 while the body scrolls,
478px footer inside a 480px drawer, 1px bottom border, and successful Next navigation.
Studio type-check, targeted Biome and git diff --check passed. Other inspectors
retain their existing layout when no footer is supplied.


## Judge instructions and conversation inspection follow-up

Affected surfaces: current conversation definition inspector, saved conversation
result drawer/direct route, platform stacked details, shared comparison stats,
prompt header, Evals breadcrumbs, current-page help, immutable sample fixtures.

Acceptance implemented:

- Judge instructions opens a platform stacked drawer from either conversation
  surface. A direct/reloaded URL has a full-page reader and a return link retaining
  conversation, step, repetition and filter state. Expand and Escape use the shared
  detail stack. Escape dismisses the covering route instead of the underlying
  definition inspector. Shared drawer layer spacing reserves room for inspectors.
- Built-in judge instructions are saved as optional static instruction metadata.
  App manifests/results, Studio grading, authenticated discovery and targets, wire
  schemas, and Studio all carry the field. Custom judges may opt in; no custom
  grading API or prompt-library resolution API was invented. Per-case payloads,
  credentials and resolved runtime data are excluded from this static snapshot.
- Saved execution evidence is authoritative. Missing historical snapshots say
  Instructions not recorded, with no fallback to today's judge. Sample instructions
  are authored sample data; they do not claim to represent an actual model call.
- Search highlights literal matches in yellow without interpreting HTML. The Copy
  button was removed following feedback. Prompt header help circle was removed.
- Conversation header shows Conversation ID. The repetition selector spans the
  toolbar, without repeated suite/application/environment, pass count or selected
  repetition heading. Inspect workflow and Judge instructions share an action row
  for the current step. Workflow links in comparison evidence remain available.
- See more stats is a thin gray footer attached to the summary boxes. Its content
  shows this repetition's costs, step counts and phase timings, then all-repetition
  totals/means below a separator. Execution details was removed. Aggregate rows are
  shared with the comparison modal to preserve cost/missing-evidence behavior.

Completion assessment for this follow-up:

- Behavior/contracts and Studio: implemented optional metadata, version pinning,
  legacy discovery/verdict shapes, saved-source selection, safe missing states,
  URL-backed navigation, loading/error drawers and responsive inspection.
- Help/tours: current-page reader help explains static instructions versus pass
  criteria and evidence, search and returning to the conversation. Conversation
  help reflects the attached stats footer. Existing stable tour IDs/anchors remain;
  the earlier completed full sample tour is preserved. No new required chapter.
- Docs/skill: Studio results/reference, Studio README, agent README and portable
  Kortyx reference describe snapshots, custom opt-in and current authoring limits.
- Usage telemetry: reuses studio.inspect with allowlisted evals/definition fields
  for entry intent, without judge text, names, IDs or content. Existing auth-bound
  reads provide customer diagnostics separately from maintainer usage events.
- Compatibility/release: no database migration (optional JSON field). Upgrade API
  and Studio together before SDK consumers emitting snapshots because old strict
  readers reject unknown identity fields. Hosted discovery/verdict metadata is
  opt-in with includeInstructions=true, preserving older SDK client responses.
  Existing custom judges and stored records without instructions remain supported.
  No new package/export or publishing configuration; private adapters not exercised.
- Security/privacy: existing project/environment/tenant authorization is retained;
  sample data remains immutable. Instruction strings are bounded to 64,000 by the
  wire schema and rendered as inert text. Metadata contains customer instructions
  only when published by the configured judge, never in maintainer usage events.

Verification:

- Agent build and agent/API/Studio type checks passed, including strict sample
  contract checking. SDK 53 tests and API 26 tests passed for judging, selection,
  identity/snapshot bounds, saved backend identity, legacy behavior and billing.
- Studio full unit suite: 588 tests / 111 files passed. Subsequent header/action
  simplification passed Studio type checking and the focused browser journeys.
- Browser checks: 11 passed for inspection, comparisons/history and instructions;
  after the final header/action refinement, 8 focused journeys passed again.
  Includes definition stack/expand/Escape/Back/Forward, saved instructions/reload,
  phone layout, stats placement, Conversation ID and grouped inspection actions.
- Documentation/link checks: 88 tests / 3 files passed. Targeted Biome: 44 files,
  no errors (existing warnings); git diff --check passed. Screenshots inspected:
  /tmp/kortyx-judge-yellow-final.png, /tmp/kortyx-conversation-clean-final.png,
  /tmp/kortyx-stats-clean-final.png. Manual inspection confirmed zero Copy buttons
  and zero prompt-header question marks.
- Production build/CI, deployment/publishing and private adapter coverage were not
  run. The live Studio .next directory and existing databases/data were preserved.
  Servers remain on 6302/6400/6501; temporary feedback config is removed after QA.

The assessment design proposal recorded here was subsequently approved and
implemented; see the final assessment below.

## Final assessment, comparison parity, and loading audit (2026-10-21)

This assessment supersedes the earlier pending assessment-design proposal and
older completion rows wherever the final implementation differs.

The conversation definition inspector, execution drawer and comparison modal now
share the same inspection hierarchy. A single Assessment details expander groups
criterion, evidence and automatic checks; the assessment explanation stays visible.
Missing verdicts remain Not assessed. Definitions show configured expectations
without fabricated verdicts. Conversation ID belongs in the header, step selection
spans the content, and Inspect workflow / Judge instructions share an action row.
Configured definitions use View workflow to open the published topology.

Comparison summaries now reuse the drawer's attached See more stats footer. Both
sides expand/collapse together; independent repetition selectors continue to select
independent executions. Expanded content shows this repetition, then aggregate
All repetitions totals/means below a separator. Closing clears comparison query
and disclosure state atomically through nuqs, preserving unrelated table state.
Judge instructions temporarily suspends the modal and returns to its saved context.

The authored sample's non-empty-text check uses the actual `\S` regular expression,
consistent with its recorded sample verdict; general regexes retain explicit labels.
No database was reset or reseeded.

### Loading audit: initial findings

Inventoried every Evals page and intercepted drawer, plus client-side evaluation,
suite, repetition and modal evidence requests. Runs and Suites lacked list loading
boundaries. Other routes mostly reused a generic event feed, including a visible
56px generic header where the loaded DetailPage header is screen-reader-only.
Run, comparison, conversation and instruction bodies did not resemble loaded UI.
Initial client states used text messages or single large rectangles. Stats could
shrink under flex layout; the first comparison evidence fetch omitted step controls.

### Fixes and second audit

All nine substantive route shapes and three intercepted variants now have matching
Evals skeletons. Redirect-only `/evals` and `/evals/cases` intentionally have no
invented intermediate page. Current-definition inspectors are synchronous after
suite loading, so they have no separate asynchronous skeleton.

| Surface | Final loading structure / verification |
| --- | --- |
| Runs `/evals/runs` | Real DataTable, default run columns including Changes, persisted widths/order, shared toolbar and pagination. Desktop header 66px, column header 40px, run rows 71px, matching loaded geometry. |
| Suites `/evals/suites` | Same shared list frame, suite column contract and 69px default rows. 66px header and 40px column header match loaded view. |
| Suite `/evals/suites/:target/:suite` | Shared EvalDetailHeader and DataTable. Header 64px; column header starts y=166; first row y=206, 61px high in both loading and loaded views. No extra enclosing detail card/header. |
| Evaluation `/evals/evaluations/:id` | Shared summary header/Metric strip, actual suite navigation, actual conversation table. Desktop header 129px; table header y=231; first conversation row y=271, height 73px. Loading and loaded x/width/height match. |
| Suite run `/evals/runs/:id` | Summary metrics, retained tabs, real conversation table and fixed pagination; 95px summary and 73px default rows. |
| Evaluation comparison `/evals/evaluations/:id/compare` | Responsive baseline/candidate selectors, shared workflow/judge/cost strip, change summary, suite rail and comparison columns. Table body retains its actual chrome during a baseline fetch. |
| Legacy run comparison `/evals/runs/:id/compare` | Its own summary/baseline panel and complete legacy delta/repetition column set, not the results/tabs fallback inherited from its parent. |
| Conversation `/evals/cases/:run/:case/:repetition` | Direct-page context, repetition selector, attached three-cell stats, full-width step controls, assessment and transcript placeholders. Stats at y=274, height 92.328125px; selected stats grid at y=275, height 61.328125px, identical to the loaded sample. |
| Conversation comparison `/evals/cases/:run/:case/compare` | Retained comparison context, tabs, responsive two-side evidence and cost strips. Its own direct-page back header. |
| Judge `/evals/judges/:source/:id` | Shared static explanation and responsive wrapping, 22px metadata row, 36px search, long-text reading column. Configured/historical copy follows the source; expanded readers retain their local identity row. |
| Intercepted conversation, comparison and judge drawers | Actual DetailDrawerHost / stack geometry, not fixed-position substitute frames. Standard drawer at desktop x=752, y=48, width=524, height=668; header 64px. Loaded judge context 154px, matched by its final skeleton. |
| Comparison modal | Existing header/footer stay outside scrolling content. Initial comparison and per-repetition requests use aligned side headers, selectors, stats, assessment and transcript placeholders; shared step selector space is retained during evidence loading. Missing-result sides stay minimal after loading. |

Manual review used the real running development server and a temporary local
review harness to hold each route's loading component next to its loaded
counterpart at the same viewport. The harness was removed before commit. DOM
geometry and screenshots were inspected through browser controls, not an automated
local E2E runner. At 390×844 the final workspace header is 129px, column header
starts y=380 and first row y=420 (73px), matching the loaded mobile view. The
4px suite-name placeholder difference found in the first mobile pass was fixed.
The temporary viewport override was reset.

The audit targets stable page geometry. Unknown row counts, variable evidence or
prompt length, optional failure notices, missing-result sides and expanded user
state cannot have their final text heights predicted before the data exists;
placeholders reserve the correct structures rather than inventing those facts.

Visual evidence: [desktop loading](screenshots/loading-desktop.png),
[mobile loading](screenshots/loading-mobile.png),
[comparison details](screenshots/comparison-details.png).

### Completion policy reconciliation

- Behavior/contracts: optional bounded static judge instructions flow through SDK
  identity/manifest/results, API grading and Studio readers. Legacy hosted judge
  discovery/verdict responses are unchanged unless includeInstructions=true.
  SDK pinning excludes instruction text on requests and validates returned snapshots.
- Studio: definition, result, comparison, judge reader, direct/intercepted and
  missing/error/loading states are implemented. Existing diagnostics and recorded
  cost completeness remain visible. All conversation repetitions remain distinct.
- Help/tours/docs/skill: existing stable lessons and current-page targeting updated
  for the final shared assessment, attached stats, suite navigation, reader and
  topology entry points. Studio README, website docs, agent README and portable
  Kortyx reference describe authoring and snapshot boundaries.
- Usage telemetry: reuse allowlisted studio.inspect actions for inspection intent;
  customer names, IDs, criteria, instructions and evidence are excluded. Shared
  table/preferences behavior remains covered by existing usage tests. Loading
  placeholders do not emit fabricated evaluation activity.
- Customer observability: no new trace/exporter lifecycle; existing execution,
  diagnostic and cost records remain authoritative and independently inspectable.
  Static instructions are optional execution metadata, not a claim to capture full
  runtime grading payloads. No private adapter verification is claimed.
- Compatibility/security: additive optional JSON metadata, no database migration;
  absent snapshots remain explicit and never fall back to current instructions.
  Existing project/environment authorization retained. Instruction text is bounded
  to 64,000, rendered inertly and searched literally. Reader return paths are
  allowlisted scoped Evals routes; no arbitrary/external redirects.
- Release/operations: existing packages only; no dependency/export/package addition
  or publishing change. Upgrade API/Studio together before SDKs emitting metadata
  because older strict identity readers reject unknown fields. No publishing,
  deployment, merge, database cleanup or data reset is part of this PR.

### Final local checks and CI boundary

- Studio type-check (including strict sample contracts) passes.
- Studio unit run with two workers: 593 tests / 113 files passed before the final
  close-state regression was added. Final rerun recorded below.
- Earlier in the session: SDK 53 and API 26 focused tests passed; real fixture
  browser checks and related six-chapter guided journeys are recorded above.
- After the user's instruction to avoid automated local E2E, none were run.
  Browser interaction during this loading audit was manual visual/geometry review.
  Updated browser specs remain enabled for CI; no checks or thresholds were removed.
- A high-parallelism unit run encountered one hook-test timeout and its cascading
  failure while live servers/browser review were active. Rerunning the unchanged
  suite with two workers passed. No test timeout or assertion was weakened.
- Production Studio build is left to CI to preserve the live .next directory.
  CI status must be verified on the final PR commit before calling checks complete.
  Studio :6302, API :6400, consumer :6501 and existing sample/user data stay running.

Final local rerun: **594 Studio tests / 114 files passed**, **144 website/docs tests / 11 files passed**. Studio type-check, repository lint (warnings only), and git diff --check pass. Temporary review route and feedback Playwright configuration were removed.

CI follow-up: the first run found newly updated Vite/launch-editor advisories in
the repository's existing Vite 8.3.2 pin. Updated the shared catalog/override and
lockfile to Vite 8.3.3, whose upstream release includes the launch-editor 2.14.2
fixes. No audit exceptions or CI checks changed. `pnpm audit:deps` now passes with
only the repository's two existing ignored advisories; patched-toolchain reruns
pass all 594 Studio tests and 144 website/docs tests. The live server process and
database remain intact. This is a development-tool patch, not a new runtime
package, migration or deployment.

Production-browser CI on the patched toolchain passed 37/39 evaluation navigation
checks. Two remaining assertions still expected the redundant Step 1/2 prefix on
compact definition headings. Updated them to assert the actual User message /
Response to human input heading, the selected step in its dropdown, and the
scripted message/Paris selection. Reload/history and horizontal-overflow checks
remain unchanged. These browser checks are rerun in CI, not locally.

Standard browser CI also identified assertions that counted every toolbar action
as one of the three shared table controls, and an ambiguous Clear filters locator
after adding the empty-state recovery action. The checks now identify Filters,
Columns and Views by name and scope filter reset to its sidebar, retaining search,
URL independence, row counts and pagination assertions. No retries, timeouts or
coverage gates were relaxed. Final browser verification remains CI-only.

The last standard shard caught a loading-search race: the skeleton's inert search
was still reported as editable to browser automation, so an early fill could be
discarded when the loaded table mounted. Loading search now has a native disabled
state until the real table can retain input; a focused unit regression verifies
the transition. Dispatch-state checks now use the real conversation link, retaining
all three retry/reconnect/unknown assertions and the absence of fabricated
workflow links.
