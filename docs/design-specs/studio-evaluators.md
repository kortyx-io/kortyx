# Studio judge authoring

Judges are specialized, independently versioned prompts. They own instructions, a typed evaluation-context template and a backend model selection. They do not reference ordinary managed Prompt assets.

The library opens a judge in Studio's shared multi-level detail drawer, preserving the library underneath. The drawer supports expansion, close and browser Back/Forward through the existing detail stack. A direct link or refresh renders the same editor as a full DetailPage, matching Prompts navigation. The editor reuses the compact asset header, version-history column and PromptEditor. Content and Preview are the only tabs. Content puts Judge instructions and Evaluation context in always-visible editors, followed by model/evidence settings under Configuration. Name and description are edited through Rename judge in the header overflow menu. The editor offers known Kortyx variables and disables ordinary Prompt inclusion.

Route reads belong to the server page: library, judge detail and recent recordings load in parallel, with the read-only sample preview loaded before rendering. The client owns unsaved authoring state, explicit mutations and active preview polling. The shared prompt editor renders its text and variable/reference styling in the initial HTML, retaining the same paragraph layout when TipTap takes ownership; hydration must not insert empty-to-filled message fields.

Input is the application request. A criterion is expected behavior attached to a dataset case or step. Judge instructions explain how to assess it against the observations, reference facts and preceding conversation. Observations expose recorded text, structured output, events and human pauses. Preview shows the actual variables and exact rendered request before an explicit model call. A run recording without case expectations has no criterion; absent optional context is visible rather than fabricated.

Save draft preserves authoring work. Save version snapshots owned content and model/evidence settings. The version history selects immutable content or the current draft. It belongs only to Content, collapses to a narrow rail on desktop, and uses the tab-row picker on smaller screens. Preview uses the full width. History expansion and version selection persist in the URL. Renaming changes asset metadata without publishing a version or overwriting unsaved instruction edits. Dataset relations refer to exact judge versions. Dataset selection UI is deferred to the dataset workflow. Scoring and production rules are outside this implementation pass; existing code-managed suite execution and grading remain unchanged.

Preview uses the existing pass/reason/evidence response shape. The runtime supplies the output contract independently of the rubric so future compatible scoring integrations can use the same instructions without embedding a score schema in the judge editor.

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
