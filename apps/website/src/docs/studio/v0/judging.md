---
id: "v0-studio-judging"
title: "Configure evaluation judging"
description: "Choose an application or Studio judge, define evidence-based checks, and distinguish answer quality failures from judge execution errors."
keywords: ["kortyx", "studio", "judging"]
sidebar_label: "Configure evaluation judging"
section: "evaluations"
---
# Configure evaluation judging

A judge checks a conversation's answers against the requirements in your suite. An application judge uses a check registered by your app. A Studio judge uses a model configured for Studio.

## Choose a judge

When launching a suite, select **Studio judge** or an available **App judge**. Studio saves that choice with the run. Missing judge configuration produces an error; it does not silently switch judges.

In Cloud, connect a supported provider in [Settings > Providers](/docs/cloud/evaluations#provider-credentials). Self-hosted operators configure the [Studio API's judge](/docs/self-hosting/configure-evaluations#studio-judge-configuration). Your application's workflow model remains configured in the app.

## Judge criteria and evidence

Write checks against the answer and evidence your app actually produces. If a check requires a successful product lookup, emit the relevant tool result with `toolExecution.emit: true`. The judge cannot verify a lookup from an unsupported claim in the answer alone.

Use `createEvals.defaults.evidence` for default evidence selection and `suite.evidence` for case-suite overrides. Keep credentials and private account tokens out of suites and evidence. See [the SDK evidence guide](/docs/sdk/guides/conversation-evals#compact-judge-evidence) for the supported fields.

> **Good to know:** Tool evidence and cost telemetry serve different purposes. `toolExecution.emit: true` supplies judge evidence; [normal telemetry](/docs/studio/connect-project) records the calls used for [workflow cost attribution](/docs/studio/evaluation-results#eval-run-costs).

## Read a verdict

Inspect each criterion's result and reason in the saved run. A completed workflow can fail a quality check. A judge request that fails, times out, or returns an invalid verdict is an evaluation error.

Next: [Read and compare results](/docs/studio/evaluation-results).

## Deterministic checks

Suite authors can add built-in `expect.checks` for exact or contained literal text, regex, observed
tool calls, exact tool arguments, and completed structured-output values. These
checks execute in the application before semantic judging for either judge
location. All must pass; failures stop that case and skip semantic judging for the
step. Inspect **Deterministic checks** in the suite definition and case inspector
for definitions, results, reasons, and supporting evidence. **Not assessed** means
no recorded check verdict, not a pass. These results are separate from model
criteria. See [SDK deterministic checks](/docs/sdk/guides/conversation-evals#deterministic-checks)
for examples, tool emission requirements, and the current-step evidence boundary.
