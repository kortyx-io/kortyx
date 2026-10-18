---
id: "v0-studio-evaluation-reference"
title: "Evaluation execution and settings"
description: "Look up evaluation attempts, timeouts, judging evidence, structured responses, failure states, and saved execution behavior in Studio."
keywords: ["kortyx", "studio", "evaluation", "reference"]
sidebar_label: "Evaluation execution and settings"
section: "reference"
---
# Evaluation execution and settings

Use [the first-evaluation tutorial](/docs/studio/first-eval) for setup and [evaluation results](/docs/studio/evaluation-results) for the interface.

## Judge criteria and evidence

Configure what the judge receives in the application: `createEvals.defaults.evidence`
provides defaults, and `suite.evidence` overrides individual fields. Studio uses
the saved selected evidence for grading; full observations remain available for
debugging. These are SDK configuration options, not switches in the run drawer.

The judge sees compact execution evidence as well as answer content. Criteria
must explain which structured fields the frontend shows as messages, prose, or
cards and which are progress-only or internal. Each criterion is graded separately.
An emitted output does not prove it was displayed in the browser.

See [writing criteria](/docs/sdk/guides/conversation-evals#write-criteria-for-the-evidence-your-app-produces)
and [evidence defaults, overrides, and filters](/docs/sdk/guides/conversation-evals#compact-judge-evidence)
for examples, including disabling history/events/outputs for text-only checks.
Keep any supporting tool results or reference facts required by the criterion.

## Required structured responses

Conversation steps can declare `expect.outputs` as an array of required output
contracts. Studio displays each ID and either the exact required version or
“Any version” in the suite definition and case evaluation. The consumer checks
that every contract has a completed visible output before either judge runs.
Partial streams, invalidated outputs and outputs from previous steps do not
satisfy the requirement. Missing contracts fail the step with an explicit reason.
Open the conversation debugging section to inspect the recorded envelopes.
Use pass criteria to assess payload meaning; the output requirements check
contract presence. See [the conversation guide](/docs/sdk/guides/conversation-evals#required-structured-outputs)
for suite authoring and custom executor support.

## Failure evidence

Eval issues preserve the original message, exception type, stack, causes and
provider/HTTP response properties in `errors[].exception` by default. Known
credential fields, authorization headers and credential patterns are redacted;
ordinary error content is retained. Capture size/depth limits are explicit in
`exception.capture`. No diagnostic flag or custom reporter is required for this
evidence. `errors[].failure` remains the separate public failure descriptor.

An existing native diagnostic reference is loaded automatically by Studio under
its project permissions. Optional `agent.reportError` or `createEvals({ reportError })`
can also archive evidence; exporter failure never changes the eval outcome.
Previously discarded content cannot be reconstructed. Progress listener failures
remain reporting errors and do not skip cleanup.

Application postcondition verification has its own verdict: unmet behavior is
Failed; an infrastructure or reset exception is Error. Comparison views preserve
verification evidence alongside conversation results. Deploy matching API/Studio
support before the SDK/CLI emitting these additive fields. Apply migration `0013_eval_settings` for the new settings and run metadata.

## Evaluation settings and timeout reporting

**Settings → Evaluations** stores sparse project defaults in
`projects.eval_defaults`. Reading uses the existing project Studio permission;
saving requires `studio:write` through the installation's authorization adapter.
The run drawer shows effective repetitions, concurrency, case timeout, overall
evaluation timeout and judge, along with their source. Enter a value to override
it for that run; Reset to default removes that override. There is no separate
inherit mode. Project defaults apply to the whole project across targets and
environments; application-specific defaults stay in the SDK.

Per-field precedence is run override → Studio project default → SDK declared
default → built-in. Installation timeout defaults sit below project defaults.
The enqueue operation validates application ceilings and freezes effective values
and sources on the evaluation and suite records, so edits do not change queued
or historical runs. Idempotent retries retain the original frozen settings.

The overall deadline defaults to **30 minutes**, independently of individual
case timeouts, and is shared by every suite in an evaluation, including Studio
grading. It starts at execution, excluding queue wait. Configure the Studio API:

```dotenv
KORTYX_EVAL_RUN_TIMEOUT_MS=1800000
KORTYX_EVAL_MAX_RUN_TIMEOUT_MS=7200000
```

The first variable sets the installation default. The second is an optional
administrator ceiling, independent of run/project precedence. Without it the
supported timer ceiling is 2,147,483,647 ms. The installation default must fit
under the ceiling. Docker Compose and CLI-managed installations forward both
variables; restart the API after changing them.

Timeouts show **Timed out** in evaluation history, evaluation detail and suite
detail, with the configured limit, completed/remaining attempt counts and known
pending phases. Completed grades and observations remain available; unstarted
attempts are distinct from interrupted work and work awaiting grading. Active
consumer cancellation/cleanup is signalled, with no claim that external side
effects have rolled back or cleanup has finished. Errors are not behavioral fails.

The evaluation header shows compact notices with the actual timeout or error
reason, leaving the results table visible. Clicking a notice opens the shared
error dialog with occurrence navigation, affected execution links, original
messages, stacks, causes and provider response details. Run metadata and frozen
execution settings are available under **Run details**. Selected errors (`?error=`)
and Run details (`?runDetails=true`) use URL state, including reload and browser
Back/Forward. Error navigation keeps the dialog size stable and reuses previously
loaded evidence within the current workspace. Case cards also show the original
exception automatically.

SDK and Studio execution, grading, cleanup and reporting errors use the same
project-scoped diagnostic occurrence store, retention, permissions and detail
viewer as workflow run errors. Evaluation, suite, case, attempt and phase context
are recorded when available. Existing SDK diagnostic references are reused;
progress and final results share a reference rather than creating a second
occurrence. One overall timeout creates one occurrence referenced by interrupted
suites; unstarted attempts do not create fabricated errors. Cancellation remains
a distinct control outcome. This provides shared records for a future Errors
section; that inbox is not introduced here.

Only credential fields/patterns are redacted. Capture omissions or unavailable
older evidence are identified explicitly. No capture flag or custom reporter is
required. These are customer execution diagnostics, excluded from maintainer
usage telemetry.

Apply migration **0013_eval_settings** before starting the new API. Deploy the
matching API and Studio before upgrading SDK/CLI emitters: old strict validators
may reject additive fields. Old consumers remain usable with repetitions and
concurrency; case-timeout overrides are disabled/rejected until their SDK
advertises support. Older stored runs load without invented settings or timeout
reasons. Roll back emitters first if reverting API/Studio; the added nullable
columns and project defaults can remain. Browser case authoring is future work;
the serializable settings contract also supports future Studio-authored suites.

> **Good to know:** The overall deadline and case execution budget cover different work. Use [timing and cost](/docs/studio/evaluation-results#timing-and-cost) to interpret a saved timeout, and [worker operations](/docs/self-hosting/evaluation-operations) when diagnosing self-hosted queue or lease problems.

## Saved execution

Studio saves queued runs and progress, so reloading the browser does not stop execution. A request can be accepted before its workflow has started. Inspect the saved final status to establish how it ended.

Timeouts, consumer disconnects, and worker failures are execution errors. A quality check that rejects an answer is a different outcome. Missing evidence cannot establish that an answer passed. Cancellation is cooperative and does not roll back application side effects.

For self-hosted worker leases, recovery, and shutdown behavior, see [evaluation operations](/docs/self-hosting/evaluation-operations).
