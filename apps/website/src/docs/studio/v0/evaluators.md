---
id: "v0-studio-evaluators"
title: "Evaluators"
description: "Create reusable judges, preview recorded evidence, connect dataset experiments, and configure production assessment rules."
sidebar_label: "Evaluators"
section: "evaluations"
---
# Evaluators

Evaluators assess recorded application evidence using a versioned prompt, a server-configured judge model, an evidence scope, and a score group. Use the same published evaluator for saved runs and dataset experiments.

## Create and publish a judge

Open **Evaluators → New evaluator**. Enter a name, select a saved prompt and exact version, choose the judge model, and select response or trajectory evidence. Use **Create judge prompt** to open a focused dialog when needed. The prompt is saved in the shared Prompts library. Its `evidence` variable contains the selected recording and omissions. Prompts can include pinned prompt dependencies.

The editor uses Studio’s standard detail surface and tabs. **Save draft** preserves the editable configuration. **Publish version** freezes the prompt and its dependencies, model configuration, evidence policy, and score-group schema. Existing rules, queued jobs, and experiments retain their selected published versions. Concurrent edits require reloading the current revision.

## Score groups

**Assessment** is selected initially. Its required text field contains the judge's conclusion and limitations. Use **Create score group** to add boolean, numeric, categorical, or additional text fields. Numeric fields require a range and direction. Categories define allowed labels. Additional fields may allow `insufficient_evidence` or `not_applicable`.

The judge returns every field in one response. An invalid or missing required field makes the execution an error. An accepted value of `false` or zero remains a quality result. Assessment text has no numeric average. Customize Assessment to create your own group. For an existing custom group, Create next group version preserves earlier definitions. Historical results retain the selected group version. The Configuration side pane previews output fields and contains collapsed published-version history.

## Preview a recording

Save the draft, then open **Preview**. Select a recent recorded run or saved experiment case, or enter a run ID. **Inspect evidence** shows the rendered request and evidence without invoking the judge. **Run preview** invokes the judge against the saved draft and records an identifiable preview execution. It incurs model usage.

Review the assessment, field values, evidence references, tokens, and cost. Cost is explicitly unavailable when pricing evidence is missing. Rate-card costs are labeled estimates. **Evaluate with published version** starts a separate saved assessment using the selected published configuration. Previews remain identifiable in execution history and are excluded from saved assessment lists.

Only retained evidence is available. Response scope includes recorded run inputs, outcomes, outputs and interaction boundaries. Trajectory scope adds the captured run events. Evidence excludes credential and continuation fields, is bounded to 500 events and 256 KB, and discloses bounded strings, arrays, and nesting. Oversized evidence is rejected. Captured data is untrusted evidence. It cannot prove uncaptured actions or frontend presentation. Field references identify recorded events or the immutable evidence snapshot.

## Connect datasets

Open an evaluator's **Datasets** section, choose an application, dataset, and published evaluator version, then save the default. A dataset can use several evaluators. Experiment setup displays defaults and allows an explicit replacement or an empty selection. The application continues to supply its dataset cases and ordinary execution behavior.

Experiment admission freezes each selected evaluator configuration. After the application execution finishes, the worker assesses the saved case observations. Existing deterministic checks and criterion verdicts retain their original meanings. A text assessment alone does not satisfy a required pass/fail expectation. Results appear in evaluator execution history and the source dataset run's Configuration section.

## Configure production rules

Publish an evaluator, then open **Rules**. Select its version, environment, completed-run or human-pause stage, optional workflow filter, sampling percentage and daily judge-call limit. Preview up to 20 matching runs from the last 24 hours before activation. Previewing matches makes no judge calls.

Rules start disabled. Activation applies to newly arriving eligible recordings. Sampling is deterministic for the rule and run. The daily limit counts admitted executions in UTC, including executions that later fail. It bounds request volume; provider prices determine spend. Runs skipped by sampling or the daily admission cap are not backfilled automatically. Experiments with explicit evaluation attribution are excluded from production rules.

Rules assess saved evidence asynchronously. They do not invoke the application endpoint or replay its tools. A valid human pause can be assessed independently of a later completed run. Identical rule/version/target/evidence deliveries share an execution identity. Intentional reassessment uses a new request identity.

## Operate the worker

Self-hosted API instances run the evaluator worker when the evaluation worker is enabled and a judge connection is configured. Set `KORTYX_EVAL_JUDGE_MODEL`, `KORTYX_EVAL_JUDGE_API_KEY`, and the existing judge API/base URL settings. `KORTYX_EVALUATOR_MODELS` optionally allows additional comma-separated model IDs on that connection. Set `KORTYX_EVALUATOR_WORKER_MODE=external` on web-only API replicas when using the dedicated evaluation worker host, or `disabled` to suspend admission. The default is embedded when the API evaluation worker is enabled. Credentials stay on the backend. A separate application model connection is independent of the judge connection.

Assessment evidence is retained independently of the original telemetry. Archiving preserves versions and assessments. Deleting the project removes its evaluator assets, dataset bindings and executions. Plan retention for these snapshots alongside other project data.

Each worker processes one judge request at a time, with a 60-second inference deadline and a 4,096-token output limit. Graceful shutdown waits for active requests. Expired claims become visible errors and require an explicit new assessment, avoiding an automatic repeat of a potentially billable model call. A failed response retains reported usage and publishes no partial score group.

Cloud integrations must supply an authorized worker lifecycle through the shared scoped worker operations. Worker availability is explicit. An installation without an active evaluator worker can author drafts but cannot run assessments or activate rules.

The header’s action menu contains **Archive evaluator**. Archiving requires confirmation, disables rules and removes dataset defaults while preserving history.

The sample project includes a fictional, read-only published evaluator and assessment. Its controls do not invoke a provider or modify your project.
