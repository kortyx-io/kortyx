---
id: "v0-studio-evaluation-results"
title: "Read and compare evaluation results"
description: "Inspect execution outcomes and quality checks, compare saved evaluations, and understand workflow, judge, and partial model costs."
keywords: ["kortyx", "studio", "evaluation", "results"]
sidebar_label: "Read and compare evaluation results"
section: "evaluations"
---
# Read and compare evaluation results

Open **Evals** and select a saved run. Start by checking whether each conversation executed, then read the checks applied to its answers.

## Use the interface

Open **Evals → Suites** to browse the applications and cases registered by your
consumer. Select a suite to inspect its definition in a drawer, or open it as a
full page. Choose cases, repetitions and concurrency, then start the run.

**Evals → Runs** lists evaluations. Open a run to see suite progress and cost.
**All conversations** is the default: one table contains cases from every suite,
with a Suite column to identify their source. Selecting a suite filters this same
table; All conversations clears the suite filter. Search, columns, and table
filters stay in place. Cases with the same ID in different suites remain separate.
The metric strip uses the same layout as Runs and always summarizes the whole
run. Total cost opens its workflow/judge breakdown. Execution settings follows
it with recorded repetition/concurrency values and a card for timeouts, judge,
commit, and deployment context. Compare evaluations from the Runs list.

For a selected suite, **Suite details** opens its saved Definition and Configuration
in a platform drawer. The suite list stays available without another header or tabs. Hover or focus a suite to preview its status, progress, results, workflow/judge/total costs, duration, pass rate, and queue time beside the navigation.

Results show **one row per conversation**, including all repetitions. Open a row
in the platform drawer to read its recorded input, answer, checks, and workflow
links. **Inspect workflow** opens the existing execution drawer on top; closing
it returns to the conversation. Closing the conversation returns to All conversations or the selected suite filter. Direct links also work as full pages. Filters, details, and repetition choices
are stored in the URL and survive reloads.

## Repetitions

**Repetitions per conversation** runs every selected case N times, including cases
that pass. It measures consistency; it does not retry only failures. Each execution
uses an independent session. Run setup shows the total number of executions before
you launch; concurrency and timeouts are under **Execution settings**.

A conversation row summarizes all requested repetitions. For example, one passed
and one failed result appear as **Mixed results · 1 / 2 passed**, rather than two
rows. Pending, ungraded, cancelled, and not-run results remain visible and never
count as passes. Open the row and use the **Repetition** dropdown to inspect each
execution's outcome, time and cost above its assessment and messages. Aggregate
statistics expand from **See more stats**, the thin gray bar attached to the summary boxes. This repetition appears first, followed by all-repetition statistics below a separator.

## Compare saved runs

**Changes** is visible directly in **Evals → Runs**. Each completed evaluation
uses the latest earlier completed run of the same application and environment
from the recent 100-run history. The reference is named below the change counts;
hover or focus it to read its full name and timestamp. Searching, sorting, or
paging the table does not choose a different reference. Legacy suite runs and
runs without an earlier reference say so explicitly.

Click a change count to inspect that group, or use the comparison icon on its
right (**Open comparison**) to review all groups. The shared modal shows the
conversation, named Earlier and This run evaluations, aggregate passed/total
repetitions, and independent Repetition selectors. Previous and Next stay within
the opened group. From the conversation table, navigation follows its suite,
search, filters, and sort order across pages. Left/Right keys do the same while
the modal has focus; dropdowns and editors retain their own keyboard behavior.
Close or press Escape to return to the same table. Run-row
selection checkboxes and Compare selected have been removed.

Inside an evaluation, the **Change** column sits beside Outcome. Use **Comparison baseline** in the table toolbar to choose another earlier evaluation. Suite selection
and the table's Change filter narrow the same conversation table. Clicking the
change opens the same modal for that case; clicking the conversation name opens
its normal detail drawer. These cells fit the existing row height.

A case that went from all passes to some failures says **Started failing**;
partial pass-rate decreases say **Lower pass rate**. The corresponding increases
say **Now passing** or **Higher pass rate**. Equal pass rates with recorded
failures say **Still failing**. Changed context, missing results, and unassessed
outcomes remain separate review states. Active evaluations say **Still running**
or **Still grading** until their comparison is ready. An unavailable comparison
has a refresh/retry recovery path and is never presented as zero changes.

Use **Comparison baseline** inside the modal to choose another earlier completed
run of the same application and environment. Its menu is wider than the compact
button, with full run names and timestamps. Switching keeps the selected
conversation when it exists, then lets you browse conversations against the new
baseline. This modal selection does not change the underlying table's baseline.
A failed baseline read has a retry action; earlier evidence is hidden while a new
baseline loads.

The modal uses URL state for the evaluation, conversation, baseline, change group,
and each side's selected repetition. Opening, navigating, selecting a baseline or
repetition, and closing create browser history entries. Reload or share the URL
to restore the view; browser Back/Forward restores previous selections. Table
filters and suite selection remain intact. Invalid repetition selections fall
back to an available repetition. Comparison notes live in the change-status
popover, without standalone information banners; actual read failures retain
visible retry actions. A side with no recorded result shows only its heading and
“No result was recorded on this side,” aligned with the other run’s name; no
empty stats, date, or repetition selector is rendered.

Each side's stats follow its Repetition dropdown. The summary boxes show
that execution's outcome, execution time and total cost. Open the cost amount
for the workflow/judge breakdown. Numeric trends on **This run** compare the two selected
executions, including when their evaluations have different repetition counts.
Only matching recorded test context and completely priced same-currency costs
produce deltas.

**See more stats**, attached to the summary boxes, expands both sides together.
It shows the selected repetition’s step counts, phase timings and cost breakdown,
then **All repetitions** below a separator. The aggregate section shows pass rate, outcome counts,
total and mean execution time, and total and mean cost. Changing the dropdown
updates selected stats and evidence; the all-repetition totals stay fixed.
**This run** includes arrows and amounts for applicable changes. Green means a
higher pass rate or fewer failures, less time, or lower cost; red means the
opposite. Pass-rate indicators show the difference between the two percentages: 60% to 100% shows ↑40%. Unchanged values have no indicator. Missing timings, incomplete pricing, different currencies, and
changed or incomplete context do not produce a misleading delta.
In the **All repetitions** section, different repetition counts affect totals
and outcome counts; their indicators are hidden when counts differ. Use pass
rate and per-repetition mean time/cost there to compare aggregate performance. Missing durations stay unknown and missing prices remain partial.

The modal starts with a failed current repetition when investigating a regression
and an earlier failed repetition when investigating an improvement. It focuses
the relevant step; other steps, costs, and saved context remain inspectable.
Evidence requests are scoped to the selected case and repetition. No app or
judge is invoked. Changing the reference and directly reloading a case comparison
preserve suite/filter context. Older standalone comparison URLs remain supported.

Older comparison pages label This run as **candidate** and Earlier as **baseline**. Comparison reads saved grades without calling a
judge or rerunning either application. Cases match by **suite ID and case ID**,
regardless of their ordering. For comparable cases, Studio compares the share of
passed repetitions:

| Label | Meaning |
| --- | --- |
| Improved | Candidate has a higher pass rate |
| Regressed | Candidate has a lower pass rate |
| Unchanged | Both have the same pass rate; their outputs can still differ |
| Incomplete | A suite or repetition is missing, ungraded, errored, cancelled, or otherwise lacks a completed result |
| Context changed / not comparable | Target, environment, case definition, judge identity, recorded input, or reference differs |

For example, 1 of 3 passed in the baseline and 3 of 3 in the candidate is
**Improved**. A provider error is **Incomplete**, not a behavioral regression.
Open a comparison row to inspect both sides' outputs, criteria, and workflow
links. Each side has its own **Repetition** dropdown: repetition 2 in one run is
not a paired sample with repetition 2 in another run. Different repetition counts
are allowed; small counts do not establish statistical confidence.

The ordinary table **total costs** sum all repetitions. The modal shows selected
repetition cost. Older comparison pages also show **Mean cost change**, comparing cost per repetition, so different repetition counts do not
create a misleading delta. Deltas require comparable, completed, fully priced
results in the same currency. Missing prices stay incomplete and different
currencies are displayed separately without conversion.

Actor identity, external data snapshots and prompt versions are not automatically
pinned. Tool results can change even when the recorded inputs are identical.
Treat comparison as observed pass-rate differences, not proof that a prompt
change caused them. Rerun the same suite with stable actor/data and review the
actual evidence when testing a prompt change.

> **Good to know:** Comparison reads saved grades without running your app or judge again. To test a fresh change, [start another evaluation](/docs/studio/first-eval#7-run-and-verify-the-actual-workflow), then compare the same cases and [judge settings](/docs/studio/judging).

## Rerun failed cases

On a finished evaluation or suite run, choose **Rerun failed cases** to open the
existing launch drawer. Recorded failed and errored case IDs are preselected;
repeated attempts select each case once. Cancelled, ungraded, never-started, and
uncertain attempts are excluded. The previous judge and execution settings are
prefilled when recorded, subject to current availability and limits.

Review the selection before launching. This creates a new run against the current
deployed suite definitions; live prompt versions are selected by default and can
be changed in the drawer. It does not replay historical continuations, freeze old
application/data state, or modify the original results. Tools execute again.
If a failed case or target is no longer deployed, the shortcut explains the gap
instead of silently selecting a different case. Sample projects remain read-only.

## Mixed results across repetitions

Finished suite runs label a case **Mixed results** only when it has at least one
recorded assessed pass and one recorded assessed failure. The row reports passes
out of all requested repetitions, with failures, errors, cancellations, and
unfinished work shown separately. For example, **2 of 6 passed · 3 failed · 1
errors** includes five assessed outcomes and one execution or grading error.
Running evaluations have no mixed-results badge. One assessed outcome, passes
plus infrastructure errors, or failures plus cancellations are insufficient.

The badge describes observed results, not their cause. Application behavior,
external data, fixture differences, and judge variability can all contribute.
Inspect the individual repetition evidence before drawing a conclusion.

## Read results and compare

Passed/failed describe assessed quality. Errors describe execution or grading problems; cancelled and interrupted work do not count as successful quality evidence. Progress distinguishes suites finished from recorded attempt outcomes. A resolved interrupt does not establish successful continuation.

Compare equivalent cases, judge settings, prompt versions, and environments. Open conversation details and select a repetition for captured evidence instead of inferring quality from the aggregate status.

## Grouped evaluation runs

The default Runs list shows one evaluation per trigger. A parent evaluation owns
one or more suite executions for a single application/environment. Open a row to
see every suite and its live progress, then select a suite in the same workspace
to inspect conversations and assessment/trace evidence. Older suite runs remain visible with their original
links. Suites remains the definition/history view.

The **Run evaluations** drawer offers All suites or Selected suites. Launching
from a suite page preselects and expands that suite. Expand any selected suite to
choose its conversations independently. Suite checkboxes select or clear every
conversation and show a mixed state for partial selections. Selections and
expanded suites survive reloads and browser history. Without a project judge default, the drawer selects Studio
when available, otherwise App; unavailable judges remain disabled with a reason.
Repetitions (1 to 20) and concurrent attempts across the evaluation (1 to 20) apply to the selection.
Each suite is limited to 100 attempts; one evaluation is limited to 1,000 attempts.
Missing App judge configuration is explained beside the disabled option.

The Studio API snapshots all selected suite revisions and the judge before
atomically saving the parent and suite jobs. A worker claims all suite jobs together and schedules attempts round-robin across
suites, sharing the configured concurrency budget. A slot includes setup, execution,
cleanup, and grading. Consumer apps must use an SDK that advertises attempt scheduling;
older endpoints receive an upgrade message before a multi-suite run is queued.
Custom worker stores must return all sibling suite leases together from `claim`;
independent single-suite claims cannot enforce an evaluation-wide budget.
Cancelling the parent cancels queued suites and requests cooperative cancellation
of running suites. Cancelling one child suite stops its queued attempts and drains
its active attempts through cleanup while other suites continue. A lost lease or
uncertain transport outcome stops new dispatch without replaying attempts.
Finished suites remain available; cancellation never rolls
back tool side effects. A run remains Running until every suite is terminal.
Execution/grading errors, behavioral failures, and cancellation stay distinct.

```sh
# Enqueue all deployed suites and return a parent ID and Studio link.
kortyx studio evals runs start --all --connection staging --target catalog --json

# Run selected suites, wait, and return machine-readable final results.
kortyx studio evals runs start --suite catalog-smoke --suite product-ambiguity \
  --connection staging --target catalog --wait --timeout 1800 --json

# Read grouped history and results. Existing suite-run IDs/URLs remain readable.
kortyx studio evals runs list --connection staging --json
kortyx studio evals runs get EVALUATION_UUID --connection staging --json
kortyx studio evals runs get EVALUATION_UUID --connection staging --include-content --json
kortyx studio evals runs wait EVALUATION_UUID --connection staging --timeout 1800 --json
kortyx studio evals runs cancel EVALUATION_UUID --connection staging --json
```

`get` returns aggregate counts and per-suite case/criterion pass-fail outcomes.
`--include-content` additionally returns definitions, observations, reasons and
execution evidence with best-effort credential redaction. A positional suite ID
is still accepted by `runs start`, and now creates a single-suite parent.
`wait` supports grouped evaluation IDs; use `get` to inspect legacy suite runs.

`--wait` and `runs wait` exit 0 for Passed, 1 for failed criteria, 2 for execution,
grading, or waiting errors, and 130 for cancellation. A wait timeout does not
cancel the evaluation. Without `--wait`, success only means the run was accepted.
The CLI does not automatically retry POSTs. Use `--idempotency-key` to reuse an
identical request after a trigger retry; reusing the key with changed selection,
revisions, execution settings or metadata returns a conflict. Run creation is
atomic, so failed validation never leaves a partial selection queued.

## Eval run costs

Run history and each run's case table show model costs. The run summary shows
one **Total cost** item; hover, focus, or activate it for the **Workflow / Judge**
breakdown. The case inspector also provides the breakdown. Workflow cost
automatically follows native Kortyx executions across all runtime sessions used
within an attempt, including setup, cleanup, child workflows, retries and resumed
turns. `defineSuite` and existing execution hooks need no changes. An application
can update a record in session A and verify it in a fresh session B; both sessions
stay independent and their recorded generations count once for the attempt.
The attempt keeps its own identity, and unrelated work in a reused session is
excluded. Project and environment boundaries still apply. Enable
normal agent telemetry to record these calls. `toolExecution.emit: true` supplies
tool evidence to the judge; it does not itself enable billing telemetry.

Upgrade Studio before upgrading the consumer's agent and telemetry SDKs together:
progress and saved results now carry optional attempt identities and runtime
execution associations. Older saved results retain session-based attribution.
Attribution is automatic within the consumer process; custom executors that call
another service do not propagate it across HTTP or queue boundaries. Such calls
remain unavailable unless that integration carries attribution. An associated
execution with no recorded generation keeps the subtotal partial or unavailable.

`createEvalJudge` captures provider usage separately from the generated verdict.
Both app-owned and Studio-owned judges report it, including a paid call whose
verdict fails validation. OpenRouter reports actual charges; BYOK uses upstream
inference cost when supplied. Other model usage uses Studio's effective model
rate cards. These calculated charges are marked **estimated** in the tooltip.
No extra cost-related environment variable is required. Custom judges may report
usage through `EvalGradeInput.onUsage`; without it their cost remains unknown.

A `+` after a displayed amount means a known subtotal, with more cost possible.
When no priced usage is available, the display shows a zero known subtotal with a `+` and an unavailable-cost explanation; this is not a confirmed zero charge. Running or
unfinished attempts stay partial; currencies are combined only when compatible.
Historical workflow costs can be recovered from existing telemetry, but historical
judge charges without recorded usage cannot be recovered. Costs cover recorded
model calls, excluding infrastructure and external tool fees. They are not an
independent reconciliation of a provider invoice. Cancellation can leave billing
evidence incomplete when a remote call finishes after the executor disconnects.

Local `kortyx evals run --entry …` still executes without Studio and does not save
a Studio record. Use the registered Studio execution endpoint to save runs and
view their combined costs in Studio.

## Timing and cost

Queue time precedes execution. Setup, execution, judging, and cleanup describe distinct phases; active duration can keep growing before completion. Workflow and judge model costs are separate, and total cost can remain partial when usage or pricing evidence is incomplete. Infrastructure and external tool fees are excluded. See [Metrics](/docs/studio/metrics#cost-and-pricing).

Cloud administrators register endpoints and provider connections through [Cloud evaluation settings](/docs/cloud/evaluations). Self-hosted operators use [evaluation service configuration](/docs/self-hosting/configure-evaluations).

Next: [Configure judging](/docs/studio/judging) or [look up execution settings](/docs/studio/evaluation-reference).

### Sample repetition evidence

The read-only sample includes **Consistency check — three repetitions**, whose Support quality case has
two passed executions and one failed execution, and
**Consistency check — two repetitions**, whose Support quality case has two passes. Each execution has a
separate authored session, workflow evidence, and recorded cost. Open the grouped
row and choose a Repetition to inspect the different answers.

Both consistency examples include Support quality and Resolution safety, so you can switch between All conversations and a suite filter while inspecting repetitions.


### Browse definitions and inspect evidence

Evals → Suites opens a suite workspace with a searchable conversation table.
Select one conversation to inspect its current definition in a platform drawer;
the step selector and Previous/Next controls keep the table context. Suite and
conversation IDs remain shareable, including the selected definition step.
The Conversation ID appears under the title. The message comes before Expected
behavior, which groups configured criteria and automatic checks without verdict
badges. Judge instructions stays with the case context below; Case definition
shows only the selected case. **View workflow** opens topology with the configured
workflow selected, beside Judge instructions. Test data and reference facts remain optional.

Inside a saved run, Suite details describes the saved snapshot and execution
settings; additional identifiers and configuration are collapsed. Conversation
results lead with selected repetition outcome, execution time and cost, then the
recorded assessment and messages. One **Assessment details** expander groups the
criterion, supporting evidence and automatic check results without nested accordions.
The explanation stays visible; failed steps open their details by default. Missing
verdicts remain Not assessed. Raw response context expands separately. See more stats expands from a thin gray footer attached to the summary boxes. This repetition’s stats appear first, with All repetitions totals below a separator. The Conversation ID appears beneath the title; phase timings live in the stats instead of a separate Execution details section. Comparison uses
the same reading order: a shared step selector aligns Earlier and This run
assessments and messages, while repetition selections remain independent.
Step selection, baseline and repetitions survive reload and browser history.


### Inspect judge instructions

Open **Judge instructions** from a conversation result to read its saved static
instructions in a stacked drawer. Search highlights matches in yellow. Closing
returns to the same conversation, repetition and step. Instructions are separate
from per-step pass criteria and evidence. Older runs show **Instructions not
recorded** when no snapshot exists; current configuration is not used as a fallback.
