# Studio judge authoring

Judges are specialized, independently versioned prompts. They own instructions, a typed evaluation-context template and a backend model selection. They do not reference ordinary managed Prompt assets.

The library opens a judge in Studio's shared multi-level detail drawer, preserving the library underneath. The drawer supports expansion, close and browser Back/Forward through the existing detail stack. A direct link or refresh renders the same editor as a full DetailPage, matching Prompts navigation. The editor reuses the compact asset header, version-history column and PromptEditor. The tabs are Content, Score group and Preview. Content puts Judge instructions and Evaluation context in always-visible editors, followed by model/evidence settings under Configuration. Name and description are edited through Rename judge in the header overflow menu. The editor offers known Kortyx variables and disables ordinary Prompt inclusion.

Route reads belong to the server page: library, judge detail and recent recordings load in parallel, with the read-only sample preview loaded before rendering. The client owns unsaved authoring state, explicit mutations and active preview polling. The shared prompt editor renders its text and variable/reference styling in the initial HTML, retaining the same paragraph layout when TipTap takes ownership; hydration must not insert empty-to-filled message fields.

Input is the application request. A criterion is expected behavior attached to a dataset case or step. Judge instructions explain how to assess it against the observations, reference facts and preceding conversation. Observations expose recorded text, structured output, events and human pauses. Preview shows the actual variables and exact rendered request before an explicit model call. A run recording without case expectations has no criterion; absent optional context is visible rather than fabricated.

Save draft preserves authoring work. Save version snapshots owned content and model/evidence settings. The version history selects immutable content or the current draft. It belongs only to Content, collapses to a narrow rail on desktop, and uses the tab-row picker on smaller screens. Preview uses the full width. History expansion and version selection persist in the URL. Renaming changes asset metadata without publishing a version or overwriting unsaved instruction edits. Dataset relations refer to exact judge versions. Dataset selection UI is deferred to the dataset workflow. Production rules and automatic experiment scoring are outside this implementation pass; existing code-managed suite execution and grading remain unchanged.

Each judge version pins one shared, immutable score-group version. New judges use the built-in Assessment group, which requires a written `assessment` and has no implicit pass/fail. Custom groups retain assessment and add text, boolean, numeric (0–1 score, integer rating, custom range) and single/multiple category fields. Guidance, bounds, direction and explicit abstention policies travel with the version. All fields are requested in one structured model response and validated atomically. Invalid output is a visible execution error; its reported usage remains inspectable. Older published judges retain the legacy pass/reason/evidence contract.

Score group uses the existing inline DataTable and shared multi-level drawer stack. There is no repeated Score groups page heading inside the tab. Creation lives in the existing table toolbar and a row Edit action opens the group draft. Group management stays available while viewing a saved judge. Group names open the next layer; selection is a radio choice, and Use this version selects an inspected published version on the underlying judge draft. The retained drawer owns the authoring state so navigation does not discard unsaved instructions. Group history belongs only to Fields, while Output illustrates the response shape. The built-in group is immutable; custom groups support draft revision checks, immutable publication, duplication and archival. Archived versions remain readable for saved judge references but cannot be assigned to new drafts.

The Recording picker uses the shared Combobox for recent runs/cases and exact run-ID lookup. Every run result includes its environment, which travels in the selected target; there is no separate run-ID or environment field. Configuration calls the evidence choice What the judge sees, with Final response only and Full event evidence. Response-only run evidence contains the captured input and final output without intermediate events; full evidence retains the bounded public event trajectory.

The database adds dedicated judge definitions, versions, dataset relations and preview jobs. Earlier review assets are copied into independent drafts; their original managed Prompts and previous wrapper versions/results remain intact. Preview workers claim only explicit preview jobs. No production scheduling or automatic experiment assessment runs through this path.

Usage telemetry counts authoring requests separately from claimed preview model attempts. Approved properties exclude instructions, evidence, arbitrary names and identifiers. Scoped preview records retain the content snapshot, rendered request, verdict, usage, safe error and source recording for customer inspection.

Full feature and guided-tour validation remain pending UI approval. Targeted
preview verification is complete as described below. This iteration is a local
review candidate, not a merge-ready completion claim.

Refresh diagnosis: the shared TipTap editor previously emitted no server content. The judge's two fields appeared only after hydration and shifted Configuration down. The editor now renders matching paragraph/variable/reference content until TipTap takes over. Initial recordings and the read-only sample preview are fetched in the server page; only explicit preview polling and user-triggered run lookup run on the client. Judge dates use the shared UTC formatter so browser locale/timezone cannot change the initial text.

Local review checks include telemetry-db build, API and Studio type checks,
changed-file Biome check, and browser inspection. Existing/new judge fields had
matching server/hydrated dimensions with no observed layout shifts; the sample
Preview result was present in initial HTML. Drawer opening, expansion and browser
Back/Forward were inspected, along with desktop/mobile layout and the picker.

Preview selection now loads captured input/response before inference, clears the
previous recording's result, and cancels stale evidence reads. Missing input is
visible. Final-response previews without captured output are blocked in the UI
and rejected before a job is queued. Full-event judges can still assess retained
public events independently of response-content capture. Input/output capture
stays opt-in; `kortyx-prompts` supports the explicit local-review environment
flag without changing its default.

Targeted verification: four judge-evidence regression tests passed; the two
example transport tests and example type check passed. Browser authoring saved
an independent Intent classification review version. Two explicit OpenAI
gpt-4.1-mini previews against fresh example runs passed (password reset → support,
purchase request → sales), with the actual input/output present in rendered judge
messages and no browser errors. A content-free recording was blocked in the UI;
the API returned 400 with no queued preview job. These checks do not replace the
remaining full feature, tour, compatibility and CI validation.

## Score-group review acceptance and completion assessment

Acceptance: new judges select Assessment; each supported field can be authored and previewed; group selection preserves unsaved judge content; saved judges/results pin immutable definitions; archived or cross-project groups cannot be assigned; legacy results remain readable. The primary review surfaces are judge Content / Score group / Preview, group Fields / Output, nested drawer navigation and read-only sample help.

Migration 0020 adds scoped group assets/versions and nullable preview results. It preserves existing judge definitions and verdicts. The application normalizes new drafts to Assessment, while reading old saved snapshots with their original response contract. Apply migrations before starting the new API, then update Studio with the matching API/contracts; the model-service extension accepts an optional structured-output schema. Custom hosts must honor that schema for score-group previews. No new SDK integration or package is introduced. Review database migrations and backups before deployment; no deployment is authorized by this local UI review.

Usage telemetry reuses the bounded evaluator operation with `score_groups` resources and approved tab/help enums. It records logical authoring operations separately from model attempts, excluding field labels, descriptions, prompts, identifiers and results. Customer preview records retain the exact group definition, per-field states, usage and safe validation failures. Existing opt-out and delivery infrastructure is unchanged.

Local review verification and remaining checks are recorded after the implementation checks below. Full regression, private-host adapter verification and final-head CI remain pending; this local candidate is not yet a merge-ready completion claim.


Local score-group checks (2026-11-22):

- Contracts: `pnpm --filter @kortyx/telemetry-contracts exec vitest run test/score-groups.test.ts` — 13 passed. Covers all field families, bounds, abstentions, required Assessment, missing/unexpected fields and pinned result validation.
- Storage: `DATABASE_URL=<isolated QA database> pnpm --filter @kortyx/telemetry-db exec vitest run test/judge-score-groups.integration.test.ts test/judge-preview-evidence.test.ts` — 7 passed. Covers tenant isolation, immutable group/judge snapshots, revision conflicts, built-in protection, archival and evidence behavior. Migration 0020 applied successfully to isolated QA and local review databases; `db:check` passed.
- API: `pnpm --filter @kortyx/api exec vitest run test/security.test.ts test/evaluator-score-group-worker.test.ts` — 21 passed. Covers scoped read-only access, denied writes, environment denial, dynamic output schema, atomic invalid-output failure with retained usage and legacy verdict compatibility.
- Studio: targeted page-help registry/plan and root layout tests — 25 passed. Shared drawer stack/state/drawer and overlay-layer tests — 49 passed. Covered drawers are now below the active backdrop and inert; closing the child restores its expanded parent. Page-owned inspectors also sit below a covering route backdrop.
- Usage telemetry: existing quality/client suites — 34 passed, including opt-out and privacy behavior. Website Studio help-link suite — 73 passed. Contracts, database, API and Studio type checks passed; contracts/database/usage package builds passed. Changed-file Biome and whitespace checks passed.
- Browser: created a group with Assessment, Score 0–1, Rating 1–5, custom number, boolean, single category, multiple categories and text. Saved/selected it without losing unsaved judge instructions. A real gpt-4.1-mini preview against the captured example support run returned valid values for every field, including an empty multiple-category list. A separate default Assessment preview against the sales run returned only the written assessment, with no implicit verdict. Publishing group v2 left the saved judge and preview on v1, including after refresh. Checked nested drawer Back/Forward, mobile overflow, creation/editing from a saved judge, immediate selection after creation, and the backdrop over an expanded judge with pointer and keyboard dismissal. No browser errors were observed.
- Guidance: completed Explain this page for judge Content / Score group and group Fields / Output; verified read-only sample group drawers. The affected current-page help explains selection, typed outputs, version pinning and explicit abstentions. Existing code-managed evaluation chapters are unchanged; their application execution/criteria behavior is outside this feature.

Release assessment: `studio-v0.26.4` and the current main baseline have no Studio-authored judge route. The new score-group tables and nullable result column are additive to that stable baseline. The previous in-branch judge-authoring API is unreleased; existing saved snapshots retain their legacy contract. Keep the default rolling strategy, apply the additive migration before the new API, then update Studio. A new Studio talking to the previous API cannot author these groups, so API-first ordering is required. This source/migration assessment is not a mixed-version deployment test. Full regression, private model-service adapter verification and final-head CI remain pending before merge; no publishing or deployment has been performed.


Score-group metadata follow-up: Group name and Description are edited through the header’s Rename score group modal, shared with the judge details dialog. Unnamed groups open the same naming modal on their first save. Metadata updates merge only name/description under the existing project scope and revision check; they preserve saved output versions and unsaved local field edits. Metadata-only changes do not create a group draft/version in history. New field versions retain the asset’s current metadata. No schema migration or SDK/provider change is required; the additive metadata route uses studio:write and the existing bounded authoring telemetry operation. Read-only sample and built-in Assessment boundaries remain unchanged.


Rename verification: the scoped group storage suite passed 4 tests, including metadata-only updates, immutable versions, stale-revision denial and cross-project denial; API security passed 18 tests. Studio page-help registry/plan passed 24 tests and website help links passed 73 tests. API, database, contracts and Studio type checks passed, with contracts/database builds and changed-file Biome checks. Browser checks covered naming on first save, renaming from a saved group, preserved unsaved field edits, failure/retry, cancellation, refresh, mobile layout and both existing judge dialog paths; temporary fixtures were archived. Completed affected current-page help and confirmed sample group controls remain read-only. Full feature regression, private-host verification and CI remain pending as recorded above.
