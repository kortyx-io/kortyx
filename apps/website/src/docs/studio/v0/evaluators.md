---
id: "v0-studio-evaluators"
title: "Judges"
description: "Author versioned judge instructions with Kortyx-aware context and preview recorded evidence."
sidebar_label: "Judges"
section: "evaluations"
---
# Judges

The Evaluators library contains specialized judges. Each judge owns its instructions, evaluation-context template and model configuration. Judge content is independent of the ordinary Prompts library.

Select a judge to open it in the shared detail drawer while keeping the library visible. Use **Expand detail** for the full workspace or **Close detail** to return to the library. Browser Back/Forward follows drawer navigation. Opening a judge URL directly or refreshing shows its full page, as with Prompts.

## Write judge instructions

Open **Evaluators → New judge**. Write the instructions with the same editor used for Prompts. Use the header’s **Rename judge** action to set its name and description; these fields stay outside Content. Saving an unnamed draft opens the naming dialog. Explain how the judge should assess the response, which evidence matters, and how to handle missing facts. Select the configured backend model and evidence scope under Configuration.

**What the judge sees** has two choices. **Final response only** uses the recorded final response without tool calls or intermediate event history. **Full event evidence** also includes retained public execution events, such as tool calls, results and human pauses. Missing final responses remain explicit; neither option invents an answer.

**Save draft** preserves work without changing saved versions. **Save version** freezes the current instructions, context and configuration. Content has the same collapsible version history pattern as Prompts, with a version picker on smaller screens. Select a version to read it, or use **New version** to edit a draft. Version history is shown only on Content; Preview uses the full workspace. Concurrent edits require reloading the current revision.

## Evaluation context

The always-visible **Evaluation context** editor supplies the runtime variables. Its initial template includes criterion, input, observation, reference facts and preceding conversation. **Insert variable** lists supported inputs and descriptions. Unknown variable paths and ordinary Prompt inclusions are rejected.

| Variable | Meaning |
| --- | --- |
| `criterion` or `criterion.text` | The dataset step's expected behavior, when supplied |
| `input` | The user message or response to human input |
| `observation` | Captured answer, structured output, events and human pause |
| `observation.text` | Recorded response text |
| `observation.events` | Selected public events, including tool inputs, results and errors |
| `observation.structured` | Captured public structured outputs |
| `observation.interrupt` | Recorded human-input request, when available |
| `reference` | Reference facts supplied by the dataset |
| `conversation` | Earlier recorded inputs and observations |

A criterion describes the expected behavior; it is separate from the application's user input and the judge's reusable instructions. Optional context can be unavailable. The preview exposes what was actually captured. Referencing a nested field that is absent produces a visible template error.

Instructions and context are rendered as separate message roles internally. The authoring interface uses their judging responsibilities rather than requiring authors to configure a chat transcript.

## Preview recorded evidence

Save the draft or select a saved version, then open **Preview**. The **Recording** picker searches recent runs and saved experiment cases. Paste a full run ID to look up an older run. Each result shows its environment, which is carried with the selection; no separate environment input is needed. **Inspect evidence** shows the filled variables, selected recording and exact request without invoking a model. For multi-step cases, inspect the recording to choose a step and criterion.

**Run preview** invokes the configured judge model and can incur a charge. It assesses retained evidence without rerunning the application or its tools. The preview shows the existing experiment-style verdict: passed, reason and supporting excerpts, together with tokens and reported cost. Rate-card costs are labeled estimates; unavailable pricing remains explicit. The runtime supplies this response contract independently of the reusable rubric.

Only retained evidence is available. Strings, arrays and nesting are bounded; secret and continuation fields are excluded. Recordings are limited to 500 events and 256 KB. Evidence limitations are included in the inspected request. Missing events do not prove that an action did not occur.

## Scope of this authoring pass

Dataset-to-judge relations are stored separately as exact judge-version references. Dataset creation and judge-selection controls will be added to the dataset workflow later. The judge editor has Content and Preview tabs. It does not expose scoring or production rules. Existing code-managed dataset cases, checks and experiment grading continue working as before.

The sample project contains a fictional read-only judge and preview. Its controls do not invoke a model or modify your project.

## Backend setup and retention

Configure the existing backend judge model connection. `KORTYX_EVALUATOR_MODELS` optionally allows additional model IDs. Preview workers use `KORTYX_EVALUATOR_WORKER_MODE=embedded|external|disabled`; the default follows the bundled evaluation worker. Credentials remain on the backend. Cloud hosts must explicitly supply an authorized model connection and worker lifecycle.

Preview inference has a 60-second deadline and a 4,096-token output limit. Interrupted worker claims become visible errors and require an explicit new preview, avoiding an automatic repeat of a potentially billable request. Reported usage is retained on response errors.

Archiving prevents new use while retaining saved content. Preview evidence is retained independently of source telemetry. Deleting the project removes its judge assets, versions, dataset relations and previews.
