---
id: "v0-studio-evals"
title: "Evaluate workflow changes"
description: "Test real application conversations, inspect their answers, compare saved results, and configure meaningful evaluation checks in Studio."
keywords: ["kortyx", "studio", "evals"]
sidebar_label: "Overview"
section: "evaluations"
---
# Evaluate workflow changes

An evaluation runs example conversations through your application's real agent and checks what happened. Use it to test an instruction, model, or workflow change before relying on it.

## Start with one conversation

Follow [Run your first evaluation](/docs/studio/first-eval). You will define a case, expose an authenticated application endpoint, connect it to Studio, and run it once. Your application supplies its normal model, tools, and test-user permissions.

If setup is already complete, open **Evals**, select the application and suite, choose a judge, and run the cases you need.

## Read results and compare

Check execution and answer quality separately. A conversation can execute successfully and fail a requirement. Compare saved runs using the same cases and relevant settings; the comparison shows differences but cannot establish their cause. [Read evaluation results](/docs/studio/evaluation-results).

## Studio judge configuration

Choose a model-backed Studio judge or a check provided by your application. Cloud users configure [provider connections](/docs/cloud/evaluations#provider-credentials); self-hosted operators configure the [API service](/docs/self-hosting/configure-evaluations#studio-judge-configuration). [Configure judging](/docs/studio/judging) explains criteria and evidence.

## Evaluation settings and timeout reporting

Repetitions control how often each case runs. Concurrency controls how many attempts may run at once. Case and overall timeouts bound different parts of execution. The interface identifies where each effective setting came from. [Look up evaluation settings](/docs/studio/evaluation-reference#evaluation-settings-and-timeout-reporting).

## Timing and cost

Saved runs separate workflow and judge model costs. A partial total includes only recorded costs with known prices. Inspect execution and grading time separately when a run is slow. [Understand evaluation timing and cost](/docs/studio/evaluation-results#timing-and-cost).

## Application setup and automation

Register your endpoint through [Cloud Settings](/docs/cloud/evaluations) or [self-hosted configuration](/docs/self-hosting/configure-evaluations). Use [CLI evaluations](/docs/cli/evaluations) where your installation supplies a supported Studio connection. Local terminal evaluations can also run directly in the application without Studio.
