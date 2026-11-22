# Studio Evaluators

## User journeys

Evaluators is a reusable library. A dataset selects defaults for its experiments. A production rule selects recorded runs. Each path pins a published evaluator version. Existing suite criteria and deterministic checks retain their verdicts.

The library uses the existing Studio table, search, page help, and New evaluator action. Rows show name, model, score group, publication state, and last update. Empty state explains creating a judge and offers the same primary action. Missing provider configuration offers a Settings link and permits authoring drafts.

The editor uses Studio’s shared DetailPage surface, a compact detail header with Back, Save draft, Publish version and an overflow action menu, and shared underline DetailTabs for Configuration, Preview, Rules, Executions, and Datasets. Draft edits require Save draft. Publish creates an immutable version and detects concurrent edits. Editing a published evaluator starts from its saved draft. Archive preserves published history and prevents new assignments.

Configuration presents General, Judge and Scoring sections in the main pane, with output fields and collapsed published-version history in a quiet side pane. Assessment is selected initially. Its field preview shows the required written conclusion. Create judge prompt and Create score group open focused dialogs. The score-group dialog provides an editor with text, boolean, numeric, and categorical fields. Numeric fields require bounds and direction. Categorical fields require explicit labels. Additional fields may allow abstention. The assessment field remains required. Group edits create immutable versions.

Preview is a two-column workspace. The left side selects a recorded run or saved experiment case, then shows exact evidence and rendered messages. The right side shows operational status, typed field results, evidence references, tokens, and cost availability. A model call uses the saved draft and explicit request identity. Preview runs are labelled in execution history. Editing configuration marks previous preview output as belonging to an earlier saved revision. No application execution is triggered.

Rules are scoped to the evaluator and pin a published version. Create rule collects name, environment, completed or paused stage, optional workflow filter, sample percentage, and daily call limit. Rules start disabled. Match preview lists representative eligible runs without dispatching models. Activation is explicit. Sampling is stable per target snapshot. Daily limits apply across workers and reserve slots transactionally. Rules exclude experiment traffic and evaluator telemetry. Creation time establishes the live window. Historical targets can be assessed manually.

Datasets is a many-to-many selection of target/dataset and published evaluator version. Defaults resolve at experiment admission and are frozen with each child execution. Experiment setup shows the selected defaults and supports explicit replacement. Reassessing existing saved cases uses recorded observations. Assessment results supplement existing checks and criterion verdicts.

## Interface sketch

```text
Evaluators                                           New evaluator
Search evaluators…
Name                 Model        Score group      Published   Updated
Candidate quality    Configured   Candidate quality v2         …

Candidate quality                             Save draft   Publish
Configuration | Preview | Rules | Executions | Datasets

Preview
Recorded evidence                     Judge result
Run / saved experiment case           Completed / Error
Exact rendered messages               Assessment
Captured / omitted evidence           Grounded · true
Run preview                           Relevance · 4 / 5
                                      Tokens · cost · event references
```

## Architecture and acceptance

Shared runtime schemas validate field constraints, complete group results, immutable evaluator versions, references, rules, and executions. PostgreSQL stores scoped definitions, versions, groups, bindings, rule policies, jobs, and accepted group results. Default text and richer groups use the same result envelope. Existing user feedback contracts retain compatibility.

Admission freezes the prompt closure, group schema, evaluator configuration, and bounded evidence. Queue ownership uses PostgreSQL row locks and lease fencing. Expired running jobs become visible errors rather than repeating potentially billable provider calls. Intentional retry creates a new request identity. Worker timeouts bound execution and shutdown. The application response and ordinary telemetry ingestion remain independent of provider requests.

OSS starts the worker alongside the API and in the dedicated worker host. Cloud uses the same scoped repository operations through its trusted worker adapter. Private activation and deployment need independent verification. All API reads and writes use authorized project/environment scope. Writes require Studio write permission, inference additionally requires eval permission. Browsers receive no provider keys. Sample project remains read-only.

Acceptance covers draft creation, concurrent edit rejection, default and rich group preview, malformed output, missing evidence, permission and environment isolation, publish and archive, rule matching/sampling/admission, duplicate deliveries, worker interruption, dataset defaults and experiment overrides, exact prompt/version provenance, responsive and keyboard flows, page help, docs, and telemetry privacy.

## Research

Langfuse documents evaluator configuration with representative samples beside it, followed by an optional production rule. Its model, prompt, score type, and variable mapping informed the preview workspace. Kortyx uses a multi-field score group and pinned publication step.
https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge

LangSmith documents reusable evaluators across offline and online paths, including dataset-bound evaluation. This informed reusable dataset defaults and separate production rules.
https://docs.langchain.com/langsmith/evaluation-types

## Usage measurement

`studio.evaluator` records API and browser request attempts, with origin separating each surface. `studio.evaluator.execution` records one claimed judge attempt and its operational outcome. The worker denominator includes previews, manual assessments, rules, and experiment cases through the bounded `evaluator_source` enum. Compare successful worker outcomes with all worker attempts for reliability. Request acceptance and score values do not imply completed assessment. The shared allowlist excludes evaluator names, IDs, rubric text, model responses, and source recording content. Customer evidence and diagnosis stay in the authorized execution records.
