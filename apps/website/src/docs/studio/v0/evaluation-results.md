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

**Evals → Runs** lists saved runs. A run shows live progress and final case
outcomes. Open a case to read evaluation reasons first, then expand conversation
and debugging details. **Inspect workflow** opens the existing workflow drawer
on top; closing it returns to the case. Page URLs, filters and selections survive
reloads and browser Back/Forward.

Use **Compare** on a saved run and select a baseline from the same target/suite.
The **candidate** is the run you are inspecting. The **baseline** is another
saved run you choose as a reference; it is not an expected answer or a newly
executed workflow. Comparison reads their saved grades without calling a judge
or rerunning either application.

Cases are matched by case ID. For comparable cases, Studio compares the share
of passed attempts, including repetitions:

| Label | Meaning |
| --- | --- |
| Improved | Candidate has a higher pass rate |
| Regressed | Candidate has a lower pass rate |
| Unchanged | Both have the same pass rate; their outputs can still differ |
| Incomplete | An attempt is missing, ungraded, errored, cancelled or otherwise lacks a completed result |
| Context changed / not comparable | Target, environment, case definition, judge identity, recorded input or reference differs |

For example, 1 of 3 passed in the baseline and 3 of 3 in the candidate is
**Improved**. A provider error is **Incomplete**, not a behavioral regression.
Open a comparison case to inspect both sides' attempts, outputs, criteria and
workflow links.

Actor identity, external data snapshots and prompt versions are not automatically
pinned. Tool results can change even when the recorded inputs are identical.
Treat comparison as observed pass-rate differences, not proof that a prompt
change caused them. Rerun the same suite with stable actor/data and review the
actual evidence when testing a prompt change.

> **Good to know:** Comparison reads saved grades without running your app or judge again. To test a fresh change, [start another evaluation](/docs/studio/first-eval#7-run-and-verify-the-actual-workflow), then compare the same cases and [judge settings](/docs/studio/judging).

## Read results and compare

Passed/failed describe assessed quality. Errors describe execution or grading problems; cancelled and interrupted work do not count as successful quality evidence. Progress distinguishes suites finished from recorded attempt outcomes. A resolved interrupt does not establish successful continuation.

Compare equivalent cases, attempts, judge settings, prompt versions, and environments. Open case/attempt details for captured evidence instead of inferring quality from the aggregate status.

## Grouped evaluation runs

The default Runs list shows one evaluation per trigger. A parent evaluation owns
one or more suite executions for a single application/environment. Open a row to
see every suite and its live progress, then open a suite to inspect cases and
assessment/trace evidence. Older suite runs remain visible with their original
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

Run history and each run's case table show model costs. The run summary and
case inspector provide a **Workflow / Judge / Total** breakdown. Workflow cost
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
A dash means unavailable, including absent telemetry or prices. Running or
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
