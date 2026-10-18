# Sample project

Studio includes a shared, read-only **Sample project** in its project selector.
It contains fictional support executions: a successful order lookup, a model
failure, a resolved refund approval, a follow-up turn in the same session, two
prompt versions, and recorded passing and failing evaluation results. No provider
keys, application endpoint, database seed job, or per-user data copy is needed to explore it.

Choose **Sample project** from the navbar. Relative time ranges use the fixed sample reference clock,
not today's date; custom ranges retain their explicit UTC boundaries.

In **Settings → Sample project**, turn off **Show sample project** to remove
it from the selector. If you hide it while exploring it, Studio returns to your
previous project, or Get started if no project is connected. Enable it from Settings to restore the entry. Hiding the
sample is a display preference, not an authorization permission.

Sample URLs start with `/sample/`. They do not change the real project selected
in another tab. Sample reads never fall through to customer data. Changes,
reviews, evaluation launches, and installation updates are rejected on the
server; edit and launch controls use the existing read-only permissions. Sample
approvals describe recorded history and cannot resume an application. Live
execution refresh is off for this immutable dataset.

## Explore Studio

Choose **Explore → Explore Studio** in the navbar, or **Help & tours** in the
Studio/account menu. Nothing starts automatically. Choose a chapter for one task, or **Take the
full tour** for the six core chapters:

1. Quick orientation: project selector → successful run → execution details.
2. Debug a failed run: filtered run list → error → Trace → Model I/O.
3. Follow a conversation: session history → its two runs → topology → Workflows.
4. Understand approvals: decision → timeline → completed run.
5. Inspect prompt versions: version 1 → version 2 → their read-only diff.
6. Read evaluation results: suite → saved result → case evidence → baseline comparison.

The library shows all six chapters and a separate **Optional guides** section for
**Personalize Studio** (appearance and sample visibility). The header and footer
stay fixed while the guide cards scroll. Cards offer **Start**, **Resume**, or
**Restart**; progress and full-tour actions stay in the footer.

Choose **Explore → Explain this page** to start the chapter for the current page.
**Explore → Documentation** opens the website docs. Starting from a real project
opens the sample. If the sample is hidden, the menu or library explains that it
will be shown before starting. Opening the menu or library alone does not change
visibility.

**Next** and **Back** move through steps. Full-tour mode also supports Back to the
previous chapter, **Skip chapter**, and a break after each chapter. Choose
**Continue**, **Finish for now**, or the guide library. Single chapters offer **Skip**.
The **×** beside the tooltip title, Escape, or browser history navigation pauses
the walkthrough. Chapter and step progress appear below the buttons, separated
by a divider.
Reloads never reopen an overlay automatically: use **Resume tour** to return to
the last displayed step or chapter break. Completing a skipped queue reports both
completed and skipped counts; it does not mark skipped chapters completed.

You can restart any chapter, replay the full tour, or reset all progress after an
explicit confirmation. Tour history is separate from sample visibility. Chapter
and step IDs are stable and versioned; old completion history is retained when a
chapter changes. A new optional chapter does not erase earlier progress. Duration
labels are estimates, not measured completion times.

Progress is browser-local under `kortyx.studio.learning.v1`; the old quick-tour
terminal preference is migrated. Storage is bounded and validated. Blocked storage
still allows tours and resume during the current visit, with an explanatory message.
There is no account/device synchronization. No customer content, URLs, credentials,
or customer record IDs are stored in tour progress.

Joyride loads only when a chapter starts. Navigation waits for the destination and
its visible, settled target, including drawer animations. Missing targets pause
with a retry; they never count as completion. Loading and waiting can be cancelled.
Keyboard focus remains in the tooltip. The walkthrough never launches an evaluation,
retries a model call, resumes an approval, edits a prompt, or promotes a version.
Read-only prompt comparisons support `?v=2&compareWith=1` and can be dismissed
without changing either version.

The real `/onboarding` route provides connection guidance. OSS has a shared setup
guide; editions can retain their existing onboarding page. API reachability, sample
learning, and real application execution evidence remain separate. Editions can
supply optional authorized workspace/admin help links through
`StudioShellContribution.learningGuides`; those links do not join the sample queue
or grant access to their destinations.

The [onboarding architecture and research](../internal/studio-onboarding-plan.md)
describes the registry, extension contract, progress migration, and verification.

## Editions and preferences

Both editions use the shared layout, read dispatcher, and consumer schemas.
The existing authentication adapter still authorizes all sample pages and API
requests. The sample namespace requires application access but does not grant
membership of any real project or organization.

The default visibility preference is a year-lived, HTTP-only browser cookie,
which fits self-hosted installations without individual accounts. Cloud can
persist it per account through the optional `StudioSettingsAdapter` member:

```ts
sampleProjectVisibility: {
  get(): Promise<boolean>;
  set(visible: boolean): Promise<void>;
}
```

Implementations must derive the account from the independently authenticated
request/session; never accept an account ID from preference input. Account
storage failures must remain failures rather than silently falling back to a
browser preference. Failed reads make sample access unavailable and show an error in its Settings panel; real project pages remain usable. An adapter without this member uses the browser preference.
`StudioShellContribution.projectName` can provide the selected real project's
safe display label when sample data is active. Existing opaque project switchers
remain available within the shared selector for changing real projects.

Cloud authentication/routing adapters must allow authenticated access to
`/sample/*` and `/api/preferences/sample-project`. Shared middleware rewrites
sample pages only after authentication. An edition-specific redirect or denial
remains authoritative. Private Cloud source and deployments are not part of the
public adapter verification.

## Sample conversations and evaluation history

Dataset version 3 replaces the original small examples with **50 root runs across
20 sessions**. One coordinator calls two returning specialists: order research and
resolution review. The child-execution toggle exposes 55 correlated specialist
calls in addition to the 50 root runs.

The fictional support scenarios cover completed, failed, running, interrupted,
cancelled, and incomplete runs. Inspect provider timeouts, malformed carrier
responses, a bounded tool retry, execution limits, duplicate-credit denial, and a
failed resume. Interrupts include approved and declined reviews, cancellation,
expiry, and two pending requests. Pending requests have no expiry and stay pending
when the bundled dataset is viewed later. All sample controls remain read-only.

Three saved evaluations show iterative prompt changes:

| Snapshot | Complete suites | Passed / total | Pass rate |
| --- | --- | --- | --- |
| Initial baseline | Support quality; Resolution safety | 3 / 6 | 50% |
| Review and evidence improvements | Same two suites | 4 / 6 | 66.7% |
| Latest recorded sample | Same suites plus Recovery and review clarity | 7 / 8 | 87.5% |

Each suite includes its full case definitions, recorded observations, criteria,
grading reasons, execution links, and frozen prompt versions. Shared cases and the
judge stay comparable across snapshots; the final evaluation expands coverage.
The latest pending review intentionally fails because its proposal omits the
amount. These are authored outcomes, not measurements of a deployed agent.

The coordinator and each specialist have three concise prompt revisions, with
computed content hashes and matching evaluation snapshots. The existing tour
identities remain stable, including the improved order-status comparison.

### Privacy of the sample

Execution structure was informed by read-only inspection of real workflow
lifecycle patterns. Every conversation, reference, tool name, prompt, error, tool
result, timestamp, identifier, usage value, and cost in the bundle is invented.
The fictional support domain carries no source-domain rules or knowledge. No
source transcripts, fixtures, raw responses, business-specific prompts, customer
records, or credentials are bundled. The generator has no network or database
access; sample reads never contact the source environment.

## Extending the dataset

- Keep stable identities and tour anchors in the exported
  `SAMPLE_PROJECT` manifest in `@kortyx/telemetry-contracts`. Increment its dataset
  version when content changes; preserve existing identifiers.
- Author execution scenarios under `packages/telemetry-db/src/sample-project`.
  Narrow payload builders validate the telemetry envelope and tool observations.
  The production `createStudioReadModelsFromRecords` projector derives runs,
  sessions, workflow metrics, interrupts, and detail events without a DB connection.
- Add prompt and evaluation examples under Studio's `features/sample-project`.
  Use domain schemas and computed prompt/suite hashes. Never add executable
  targets, real credentials, or customer content to sample modules.
- Add new reads to the explicit sample dispatcher and validate their results
  against the actual consumer schema. Unknown records and endpoints return 404;
  all mutation verbs return 403. Responses are cloned per request.
- Add cross-reference and lifecycle assertions plus a browser journey for the
  new feature. Use the stable manifest IDs and `data-tour-id` anchors rather
  than matching generated IDs or fragile CSS selectors.

The sample dataset is bundled with Studio and versioned with its release.
It requires no migration or backfill. Rolling back Studio restores the previous
bundled dataset. It never writes execution telemetry, customer projections,
billing records, or account/project membership.

## Verification

```bash
pnpm --filter 'kortyx-studio^...' build
pnpm --filter kortyx-studio type-check
pnpm --filter kortyx-studio test
pnpm --filter kortyx-studio exec playwright test --config playwright.sample.config.ts
```

The dedicated browser configuration starts Studio without an API or database.
The same browser spec also runs in the normal Studio suite. The selected-auth
adapter smoke test verifies that sample API reads and denied writes retain the
compiled authentication boundary without contacting an upstream service.

## Usage measurement

`studio.sample` keeps learning separate from normal execution/evaluation usage.
`select`, `view`, `hide`, and `show` describe sample exploration. Onboarding records
`tour_hub`, `tour_start`, `tour_step`, `tour_complete`, `tour_skip`, `tour_exit`,
`tour_resume`, `tour_error`, `tour_reset`, `tour_full_start`, `tour_full_complete`,
and `tour_full_partial`. Full completion requires every core chapter to complete;
a queue with skipped chapters emits partial completion.

Finite allowlisted `tour_chapter`, `tour_step`, `tour_mode`, `tour_version`, and
`tour_failure` values support diagnosis without sending selectors, paths, tooltip
text, raw errors, or customer identifiers. Step facts count displayed steps, so
Back can record another view. Chapter starts count attempts, not unique people;
resume may start another chapter attempt. Preference entry, loading errors, and missing targets have
separate failure categories. Reloads, closed tabs and delivery loss can leave an
attempt without a terminal fact. These measurements do not prove SDK activation.

Existing opt-out and bounded delivery apply. Sample interactions suppress normal
browser execution/evaluation operations; server sample reads bypass real
connection-observed facts. Cloud catalogs that replace the public catalog must
register these finite onboarding properties to collect them.
