---
id: "v0-studio-evaluators"
title: "Judges"
description: "Author versioned judges with Kortyx-aware context, define typed score groups and preview results against recorded evidence."
sidebar_label: "Judges"
section: "evaluations"
---
# Judges

The Evaluators library contains specialized judges. Each judge owns its instructions, evaluation-context template, model configuration and selected score-group version. Judge content is independent of the ordinary Prompts library.

Select a judge to open it in the shared detail drawer while keeping the library visible. Use **Expand detail** for the full workspace or **Close detail** to return to the library. Browser Back/Forward follows drawer navigation. Opening a judge URL directly or refreshing shows its full page, as with Prompts.

## Write judge instructions

Open **Evaluators → New judge**. Write the instructions with the same editor used for Prompts. Use the header’s **Rename judge** action to set its name and description; these fields stay outside Content. Saving an unnamed draft opens the naming dialog. Explain how the judge should assess the response, which evidence matters, and how to handle missing facts. Select the configured backend model and evidence scope under Configuration.

**What the judge sees** has two choices. **Final response only** uses the recorded final response without tool calls or intermediate event history. **Full event evidence** also includes retained public execution events, such as tool calls, results and human pauses. Missing final responses remain explicit; neither option invents an answer.

**Save draft** preserves work without changing saved versions. **Save version** freezes the current instructions, context and configuration. Content has the same collapsible version history pattern as Prompts, with a version picker on smaller screens. Select a version to read it, or use **New version** to edit a draft. Version history is shown only on Content; Score group and Preview use the full workspace. Concurrent edits require reloading the current revision.

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

## Score groups

Open a judge’s **Score group** tab to select one published group version from the table. New judges select the built-in **Assessment** group automatically. It always remains available and contains one required text field, `assessment`. The built-in group is read-only; duplicate it or choose **New score group** to customize an output definition.

A group can contain up to 20 fields, including the required assessment. Authoring requests are limited to 64 KB. Select a group’s name to inspect it, or its **⋯ → Edit** action to modify its draft in the next detail drawer. **New score group** and group editing remain available when viewing a saved judge; managing a shared group does not change that judge’s selection. The group header’s **Rename score group** action opens a modal for its name and description. Renaming updates the shared asset without publishing a version or saving local field edits. Creating an unnamed group opens the same naming modal when you first save. **Save version** publishes an immutable group version. **Use this version** selects it on the open judge draft; save a judge version to freeze that selection with its instructions. Unsaved judge instructions remain in the underlying drawer. The **Active** column marks the current group. Open a row’s **⋯** menu and choose **Score with this group**, or choose a version in its drawer and click **Use this version**. The row menu also provides **Edit**, **Rename**, **Duplicate** and **Archive**. Selecting from a saved judge opens its draft automatically and preserves existing draft instructions. **Save draft** keeps the choice as work in progress; **Save version** freezes it with the judge. Groups without a published version show **Save a version to use**.

| Field | Use and configuration |
| --- | --- |
| Text | Written assessments, explanations or extracted text; minimum and maximum length |
| Boolean | A yes/no check, such as whether a required disclaimer appears |
| Score | A decimal value from 0 to 1, with explicit grading guidance; this is not automatically a probability or confidence estimate |
| Rating | A whole-number rubric, initially 1–5; configurable bounds |
| Number | A custom numeric range, optionally restricted to whole numbers |
| Category | One configured category or multiple categories; multiple selection can return an empty list when none applies |

In **Fields**, choose a field in the left-hand list to inspect or edit it. In a narrow drawer or on mobile, use the searchable field picker. **Add field** offers each type with a short explanation. Only the selected field’s settings are shown. Its color and icon identify the type, rather than indicating a good or bad result.

Start with the field name and **Grading guidance**, then configure its scale or categories. The **Example output** card illustrates the shape of a value and updates with the configuration; it does not invoke the judge or predict its answer. Use the judge’s **Preview** tab for real results. **Advanced** contains output keys, category keys and text-length limits. Removing a field asks for confirmation; removing a category offers **Undo** until another setting changes.

Numeric fields specify whether higher or lower is better, or have no ordering. Category keys are stable machine-readable values; labels and meanings explain their interpretation. Each field has grading guidance. Custom fields may allow **Not applicable** or **Insufficient evidence** with a reason instead of a value. Assessment always requires text. The judge returns all fields in one response; invalid types, missing fields or values outside the configured bounds produce a visible execution error, rather than a negative quality score.

Editing a shared group creates a new version. Existing judge versions and preview results retain their original group definition and field meanings. Archived groups cannot be selected for new use, while saved references remain readable. The built-in Assessment group cannot be archived. Changes to score groups do not change code-managed checks or automatically grade datasets.

## Preview recorded evidence

Save the draft or select a saved version, then open **Preview**. The **Recording** picker searches recent runs and saved experiment cases. Paste a full run ID to look up an older run. Each result shows its environment, which is carried with the selection; no separate environment input is needed. **Inspect evidence** shows the filled variables, selected recording and exact request without invoking a model. For multi-step cases, inspect the recording to choose a step and criterion.

Selecting a recording loads its captured input and response automatically. Missing
input is shown explicitly; a judge comparing against the user's request needs a
recording with input capture. **Final response only** cannot run without captured
response content. Enable the permitted input/output content capture in your
application and record a new execution; old recordings cannot recover omitted
content. Selecting another recording clears the previous result. **Inspect
evidence** reloads the evidence; **Filled variables** and the rendered-request
disclosure show the exact context sent to the judge.

**Run preview** invokes the configured judge model and can incur a charge. It assesses retained evidence without rerunning the application or its tools. The preview shows the selected group’s typed field values, reasons and supporting excerpts, together with tokens and reported cost. The default Assessment group produces a written assessment without an implicit pass/fail verdict. Older saved judge versions retain their original pass/reason/evidence result. Rate-card costs are labeled estimates; unavailable pricing remains explicit. The runtime supplies this response contract independently of the reusable rubric.

Only retained evidence is available. Strings, arrays and nesting are bounded; secret and continuation fields are excluded. Recordings are limited to 500 events and 256 KB. Evidence limitations are included in the inspected request. Missing events do not prove that an action did not occur.

## Scope of this authoring pass

Dataset-to-judge relations are stored separately as exact judge-version references. Dataset creation and judge-selection controls will be added to the dataset workflow later. The judge editor has Content, Score group and Preview tabs. Production rules and automatic experiment scoring are outside this authoring workflow. Existing code-managed dataset cases, checks and experiment grading continue working as before.

The sample project contains a fictional read-only judge and preview. Its controls do not invoke a model or modify your project.

## Backend setup and retention

Configure the existing backend judge model connection. `KORTYX_EVALUATOR_MODELS` optionally allows additional model IDs. Preview workers use `KORTYX_EVALUATOR_WORKER_MODE=embedded|external|disabled`; the default follows the bundled evaluation worker. Credentials remain on the backend. Cloud hosts must explicitly supply an authorized model connection and worker lifecycle.

Preview inference has a 60-second deadline and a 4,096-token output limit. Interrupted worker claims become visible errors and require an explicit new preview, avoiding an automatic repeat of a potentially billable request. Reported usage is retained on response errors.

Archiving prevents new use while retaining saved content. Preview evidence is retained independently of source telemetry. Deleting the project removes its judge assets, score groups, versions, dataset relations and previews.
