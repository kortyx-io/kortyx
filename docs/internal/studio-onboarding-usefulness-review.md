# Studio guided-tour usefulness review

Reviewed October 18, 2026. This is a research-informed product assessment, not a
claim that Studio users have demonstrated better task performance.

## Evidence and limitations

[Nielsen Norman Group's tutorial/contextual-help research](https://www.nngroup.com/articles/onboarding-tutorials/)
describes interruption, forgetting instructions, and difficulty reopening help.
Its ArcGIS example makes guidance optional, repeatable, and connected to a task;
its recommendations favor contextual help and omit obvious controls.

Two forum discussions raise similar concerns:
[product-tour maintenance and interruption](https://www.reddit.com/r/plgbuilders/comments/1ptwem0/product_tours_are_a_frontend_tax/)
and [onboarding that users skip or forget](https://www.reddit.com/r/SaaS/comments/1ne8lhe/how_are_you_making_product_onboarding_less/).
These are self-selected anecdotes with vendor participation, useful for identifying
failure modes rather than estimating their prevalence. Unverified conversion or
retention numbers from those threads are not used here.

## Decision: improve relevance before increasing volume

The existing six core chapters address distinct Studio jobs: orientation,
debugging, conversation investigation, approvals, prompt history, and evaluation
comparison. Keep their full walkthrough optional and at 21 steps, with existing
chapter breaks, skip, exit, restart, and explicit resume. A first visitor can take
just the three-step orientation. This count is our current design judgment; the
research does not establish a universally ideal number of tours.

| User need | Appropriate help | Change |
| --- | --- | --- |
| What is this page? | Explain this page on current records and tab | Retain coverage of every primary shared route; remove the generic tab step and nested table instructions from detail pages. |
| Where should I start? | Three-step Quick orientation | Mark Start here when unstarted; state clearly that other chapters and the full tour are optional. |
| How do I investigate this failure? | Four-step existing debugging chapter | Keep its focused summary/trace/model-request scope. |
| How do I read the full error artifact? | Optional three-step diagnostic chapter | Add exception cause, capture integrity, and correlation context. |
| Is this evaluation failing or still grading? | Optional three-step progress chapter | Add partial parent totals, grading suite, and evidence with no verdict yet. |
| How do I change preferences? | Optional personalization and current-section help | Retain existing coverage; no further tour of familiar settings controls. |

Page relevance remains visible beside completion status, so revisiting a finished
guide is discoverable. Diagnostic pages point to the diagnostic chapter; the
specific sample grading snapshot points to the progress chapter. No state is
inferred from private record text.

## Boundaries

These are narrated, read-only inspections, not interactive practice exercises.
Next advances the explanation; it is not evidence that the user independently
performed the task. Do not automatically launch the full tour, append a chapter
for every feature release, or repeatedly nudge users who dismissed help. Existing
Explore and documentation entry points remain available when needed.

Page help stays on the current real record when present. Empty views require an
explicit choice before switching to a sample. Neither sample viewing nor tour
completion proves that a real application is connected. The in-progress example
is a frozen snapshot and does not imply a live evaluation is running.

New chapters use finite views, manifest IDs, versioned progress and bounded usage
allowlists. Existing completion and sample isolation remain intact. DOM reads for
page-help planning now happen after commit, avoiding layout inspection during
React rendering.

## How to decide whether to keep or extend this

Use existing `studio.help` and `studio.sample` events to compare starts, step
drop-off, skip/exit, completion, and target failures within each page/context or
chapter cohort. Include all starts as the denominator; repeated attempts,
best-effort delivery, opt-out, and abandoned tabs limit interpretation. Optional
chapters have separate denominators. These metrics reveal usage and friction,
not comprehension, task success, or causal activation improvement.

Before adding more chapters, observe a small first usability round (for example,
five developers with a mix of new and experienced Studio use). Ask participants
to find a failed operation, identify its cause, distinguish pending grading from
failure, and compare prompt/evaluation evidence. Let them discover Explore rather
than directing every participant to it. Record unaided success, help discovery,
completion with help, confusing terms, unnecessary steps, and whether they can
repeat the task after dismissing the guide. Treat the small sample as qualitative.

Add or revise a guide only when a specific task remains confusing and cannot be
explained better in the page itself. Shorten or retire steps that users repeatedly
skip or find obvious. Consider action-based sample practice only if narrated
inspection fails that evaluation; do not require customer-side mutations to teach
inspection. No additional collection of customer content or record identifiers
is needed for the current assessment.

## Resolved review findings

- `apps/studio/src/features/onboarding/page-help-plan.ts:98` — Detail guides repeated generic controls before selected evidence. Fixed: retain controls/record help for list pages and focus detail help on the selected view.
- `apps/studio/src/features/onboarding/page-help.tsx:71` — Visibility planning inspected layout during render. Fixed: capture the plan after commit.
- `apps/studio/src/features/onboarding/hub.tsx:136` — Completion hid page relevance. Fixed: keep relevance and completion badges independently visible.
- `apps/studio/src/features/onboarding/registry.ts:265` — Full diagnostics and pending grading lacked task guides. Fixed: two optional deep dives, excluded from the unchanged full queue.

## Verification

Automated coverage checks fixture reads, actual grading/diagnostic evidence,
bounded analytics IDs, unchanged full-tour length, optional progress preservation,
and page-help plans that preserve scope and omit generic detail controls. Manual
browser checks and command results are recorded in
[the QA log](../qa/studio-sample-project/README.md). Local E2E tests are excluded
at the user's request. No real-user comprehension study has been performed.
