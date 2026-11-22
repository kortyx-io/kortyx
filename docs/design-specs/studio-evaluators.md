# Studio judge authoring

Judges are specialized, independently versioned prompts. They own instructions, a typed evaluation-context template and a backend model selection. They do not reference ordinary managed Prompt assets.

The editor reuses Studio's DetailPage surface, compact asset header, version-history column and PromptEditor. Content and Preview are the only tabs. Content puts Judge instructions first, Evaluation context in a collapsed disclosure, and model/evidence settings under Configuration. The editor offers known Kortyx variables and disables ordinary Prompt inclusion.

Input is the application request. A criterion is expected behavior attached to a dataset case or step. Judge instructions explain how to assess it against the observations, reference facts and preceding conversation. Observations expose recorded text, structured output, events and human pauses. Preview shows the actual variables and exact rendered request before an explicit model call. A run recording without case expectations has no criterion; absent optional context is visible rather than fabricated.

Save draft preserves authoring work. Save version snapshots owned content and model/evidence settings. The version history selects immutable content or the current draft. Dataset relations refer to exact judge versions. Dataset selection UI is deferred to the dataset workflow. Scoring and production rules are outside this implementation pass; existing code-managed suite execution and grading remain unchanged.

Preview uses the existing pass/reason/evidence response shape. The runtime supplies the output contract independently of the rubric so future compatible scoring integrations can use the same instructions without embedding a score schema in the judge editor.

The database adds dedicated judge definitions, versions, dataset relations and preview jobs. Earlier review assets are copied into independent drafts; their original managed Prompts and previous wrapper versions/results remain intact. Preview workers claim only explicit preview jobs. No production scheduling or automatic experiment assessment runs through this path.

Usage telemetry counts authoring requests separately from claimed preview model attempts. Approved properties exclude instructions, evidence, arbitrary names and identifiers. Scoped preview records retain the content snapshot, rendered request, verdict, usage, safe error and source recording for customer inspection.

Testing and final validation are intentionally held until the user has reviewed the UI. This iteration is a local review candidate, not a merge-ready completion claim.
