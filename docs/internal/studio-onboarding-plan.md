# Studio onboarding architecture

Implemented in the shared Studio shell: an opt-in learning hub, six-chapter full
tour, independent chapter launchers, optional personalization, explicit resume,
and browser-local progress. Research was checked October 17, 2026. Manual local
browser checks covered the full flow and subsequent UI feedback. E2E tests were
intentionally not run at the user's request; see
[verification](../qa/studio-sample-project/README.md).

## Experience and ownership

The navbar has one **Explore** menu: **Explore Studio** opens the library,
**Explain this page** explains the current view in place, and **Documentation** opens the
website docs. **Help & tours** in the Studio/account menu opens the same library.
All core chapters are visible, followed by a separate optional section. The modal
header and footer stay fixed; only the guide list scrolls. Cards use short Start,
Resume, and Restart actions. Progress, reset, and full-tour controls live in the
footer. A visible explanation precedes actions that show a hidden sample. Nothing
auto-launches on login, reload, an ordinary sample visit, or deployment.

Page help has a separate typed registry and runtime. It captures references to
visible controls in the active page/drawer, never record content. It preserves
the URL, query, selected tabs, and real project. All primary Studio routes have
specific explanations; a route-inventory regression requires new routes to add
one. Shared headers, tables, tabs, and settings expose stable semantic anchors.
Unknown edition pages retain general help rather than a disabled menu entry.
Short page explanations do not contribute to sample chapter completion.

With no visible records, the user chooses local control guidance or a matching
read-only example. Sample entry requires the explicit Open sample example action,
including disclosure before showing a hidden sample. The existing authenticated
preference boundary handles entry; cancellation does not navigate or write.
An explicit `explain=1` sample-entry intent starts only that page's explanation and
is removed from browser history. Unavailable sample access does not disable local
help. Connection failures are explained as missing evidence, not an empty project.

The full tour uses the same ordered chapter definitions as individual tours.
Next/Back navigate within a chapter; Back from the first step can revisit the
previous chapter. A boundary offers Continue, Back to chapter, Finish for now,
and the library. Skip chapter is recorded separately from completion. Exit,
Escape, and browser history pause; Resume is always an explicit action. Queues
with skips emit partial completion, not full completion. Optional personalization
is excluded from the core denominator.

The shared `/onboarding` fallback teaches connecting the producer, publishing the
workflow catalog, and inspecting a real request. Existing edition onboarding
pages remain authoritative. Setup does not mark an integration connected based
on sample progress or API reachability.

## Chapter registry and fixtures

[`registry.ts`](../../apps/studio/src/features/onboarding/registry.ts) defines stable
chapter/step IDs, versions, outcomes, estimated durations, and recommendation/full
queue membership. A narrow `LessonView` union pairs each destination with its
target. Routes are constructed from manifest fixture IDs; persisted input cannot
supply URLs, CSS selectors, mutations, or arbitrary customer records.

| Chapter | Supported lesson | Required evidence |
| --- | --- | --- |
| Quick orientation | Selector → successful run → execution summary | Stable original quick-tour IDs retained. |
| Debug a failed run | Failed-status filter → error → Trace → Model I/O | A failed model operation with no invented successful output. |
| Follow a conversation | Two-turn session → runs → topology → Workflows | Both turns project from canonical events into the same session. Declared structure is distinguished from observed execution; child-workflow calls are not claimed by this fixture. |
| Understand approvals | Request/response → lifecycle timeline → related run | Resolved recorded approval with no working resume capability. |
| Inspect prompt versions | Version 1 → version 2 → diff | Two immutable hashed prompt versions; `v` and `compareWith` open a read-only comparison. URL comparisons are nonmodal so the tour can retain keyboard ownership. |
| Read evaluation results | Suite → saved result → criteria → comparison | Passing candidate and failing baseline use the same suite revision and judge identity. Their session/run links resolve to actual synthetic executions. |
| Personalize (optional) | Appearance → sample visibility | Safe inspection of existing settings, with no automatic preference change. |

Execution fixtures remain in `telemetry-db/src/sample-project`, use narrow payload
builders and runtime schemas, and pass through the production read-model projector.
Prompt/eval fixtures remain in `features/sample-project`. Dataset version 2 adds
follow-up and baseline executions while preserving existing IDs. There is no DB
seed, real model request, runnable eval target, or customer record copy.

For a new feature, extend the typed fixture builder, add stable manifest IDs, parse
responses with the actual consumer schema, add its read-only view/anchor pair, then
add the chapter and its usage allowlists together. The registry tests require every
chapter, version, and step to have an approved analytics value. Do not publish a
chapter whose referenced fixture or required target is absent. Add explicit domain
views instead of permitting arbitrary navigation or simulated customer mutations.

## Runtime and cancellation

[`provider.tsx`](../../apps/studio/src/features/onboarding/provider.tsx) owns the hub,
chapter queue, storage, attempt outcomes, loading cancellation, and explicit sample
entry. [`runtime.tsx`](../../apps/studio/src/features/onboarding/runtime.tsx) lazy-loads
React Joyride v3 and delegates within-chapter lifecycle to its uncontrolled engine.
Switching chapters unmounts the previous engine before mounting the next checkpoint.

`before` hooks navigate through the existing scoped router, wait for route/query
commit, and wait for a visible target. The target must fit horizontally, be outside
hidden/inert content, and belong to the top drawer or a higher comparison surface.
Readiness and the spotlight resolve the same foreground element when intercepted
routes retain a background copy. Prompt query-only steps use shallow history
updates to avoid creating a second comparison after a detail-page reload. Pending
navigation is cancelled with the target wait when the user exits.
Drawer animations must settle before spotlight measurement. Waiting is bounded
and abortable. Missing targets pause with a resumable error, not completion.

Loading can be cancelled; late import or preference responses cannot reopen the
flow. Pending preference requests receive an abort signal. Escape belongs to the
tour while active, so it does not accidentally close the surrounding execution
drawer. The tooltip has an exit × beside its title and chapter/step progress below a
divider after the buttons. Its arrow follows the panel border, and a stronger
theme token dims the area outside the spotlight in dark mode. Tooltip focus is
trapped, dialogs have accessible titles/descriptions,
and launch focus is restored on exit. Browser verification remains outstanding
for the new chapter surfaces; these contracts have DOM/unit coverage.

## Progress and compatibility

[`progress.ts`](../../apps/studio/src/features/onboarding/progress.ts) owns a versioned,
Zod-validated record under `kortyx.studio.learning.v1`. Reads are limited to 16 KiB
and at most 32 chapter histories. It stores only chapter/step IDs, chapter versions,
finite states, and the current full-tour completion/skip sets. No paths, selectors,
customer IDs, content, credentials, or timestamps are needed.

The legacy quick-tour completed/skipped preference is migrated. A stored empty
record keeps an explicit reset from resurrecting legacy history. Completed versions
remain history when content changes; stale checkpoints safely restart at the
chapter's first step. New optional chapters do not erase progress. A newly inserted
core chapter joins the unvisited portion of a resumed queue before full completion
can be recorded. Unknown future chapter history survives an older application's
read; an unsupported resume point is dropped instead of navigating to it.

Blocked storage falls back to current-visit memory and says so in the hub. There
is no account/device synchronization. Concurrent active tabs use their own in-memory
journey and the last stored checkpoint wins. Reopening overlays automatically is
not a recovery strategy. Visibility preferences remain independent of history.

## Edition extension contract

`StudioShellContribution.learningGuides` optionally supplies authorized workspace
or administrative help destinations. Each entry has `id`, `title`, `description`,
and a local absolute `href`. The shared shell rejects external/protocol-relative
or malformed destinations, bounds entries/labels, and deduplicates IDs. Adapters
must derive these destinations and their visibility from authenticated context.
These are optional links outside the sample queue and do not authorize access.

The existing `StudioShellAdapter.onboardingPage` continues to own edition-specific
setup. Existing sample visibility callbacks retain their account-backed option;
tour progress itself stays browser-local. No private Cloud APIs, permissions,
account-storage adapter, or administrative walkthrough are invented in OSS.
Private Cloud deployment verification is a separate outstanding environment check.

## Measurement and rollout

`studio.sample` records finite hub/start/step/complete/skip/exit/resume/error/reset
and full-queue facts. Chapter IDs, step IDs, mode, version, and entry/load/target failures
are allowlisted. Normal execution/evaluation product facts remain suppressed in
sample mode. Existing opt-out, bounded aggregation and delivery, and privacy rules
apply. No selectors, raw errors, arbitrary titles, URLs, or customer IDs are sent.

Starts and displayed steps count attempts/views, including revisits. Full completion
requires all core chapters in that queue to complete; skipped queues are partial.
Reloads/tab closure may leave no terminal fact. These measures do not establish real
SDK activation or that someone understood the lesson. Validate comprehension with
new users before claiming adoption improvements; duration labels are estimates.

The dataset and UI ship together with Studio; no DB migration or backfill is needed.
Rollbacks restore the prior bundled UI/data while preserving local learning history.
Browser/E2E specs are maintained for CI but were not executed for this change.

## Evidence and product examples

- Nielsen Norman Group describes the interruption and recall problems of unsolicited
  tours, and recommends contextual, dismissible, discoverable help. Its ArcGIS
  example offers a revisitable tutorial in the sidebar. This supports keeping the
  invitation visible and teaching a task while it is relevant.
  [Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/)
- A practitioner discussion reports people rapidly clicking through required
  onboarding and recommends illustrating value instead of explaining every area of
  a dashboard. It also stresses testing alternatives with actual users. This is
  qualitative forum feedback, not controlled evidence or a conversion benchmark.
  [r/userexperience discussion](https://www.reddit.com/r/userexperience/comments/ivczyq/what_is_the_correct_way_to_implement_an/)
- Intercom community members explicitly ask for a selectable library of tours,
  including context-dependent availability. A reply suggests a checklist whose
  items launch individual tours. This matches the discoverability problem our
  chapter hub would solve; it does not prove a universal improvement in adoption.
  [Intercom community discussion](https://community.intercom.com/proactive-support-11/product-tour-menu-in-the-messenger-793)
- VS Code offers selectable walkthroughs from a Welcome surface and Help commands,
  tracks progress, and has an interactive playground. Its extension contract gives
  walkthroughs and steps stable IDs, context conditions, and completion events.
  This is a useful developer-tool precedent for the proposed registry and progress.
  [VS Code walkthrough experience](https://code.visualstudio.com/docs/editing/getting-started/tips-and-tricks#_getting-started),
  [walkthrough contribution contract](https://code.visualstudio.com/api/references/contribution-points#contributes.walkthroughs)
- Linear's start guide offers a demo workspace to explore issues, projects, and
  workflows before creating a real workspace. That supports the current sample
  environment as a place to learn concepts without provisioning customer data.
  [Linear start guide](https://linear.app/docs/start-guide)
- Intercom documents checklists that can launch tours, and warns that adding steps
  can make a previously completed checklist incomplete. For Studio, preserve prior
  chapter completion and introduce new optional chapters explicitly.
  [Intercom checklist behavior](https://www.intercom.com/help/en/articles/6890711-checklists-faqs)

These sources support a design direction. They do not establish that tours will
improve Kortyx activation. Validate the proposal with new Studio users.
