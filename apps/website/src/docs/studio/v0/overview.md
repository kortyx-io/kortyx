---
id: "v0-studio-overview"
title: "Use Kortyx Studio"
description: "Connect your application, inspect its workflow runs, find slow or failed steps, and test changes with prompts and evaluations."
keywords: ["kortyx", "studio", "overview"]
sidebar_label: "Overview"
section: "get-started"
---
# Use Kortyx Studio

Kortyx Studio shows what happened when your application ran an agent. Follow a run from its first input through model calls, tools, pauses, and the final result.

Your application runs the agent. Studio receives its activity and lets you inspect it. You can use managed Cloud or run Studio yourself.

## Choose your path

- [Explore the sample project](/docs/studio/sample-project) to learn the interface before connecting an app.
- [Get started with Cloud](/docs/cloud/get-started) for a managed installation.
- [Run Studio locally](/docs/self-hosting/run-locally) to try it on your machine.
- [Connect your application](/docs/studio/connect-project) if Studio is already set up.
- [Explore your first run](/docs/studio/first-run) if your application is already sending data.
- [Deploy Studio yourself](/docs/self-hosting) to operate a team installation.

## Use Studio

Start by [opening one run](/docs/studio/first-run). Once you can follow its steps, choose the question you need to answer:

- Why did it fail? [Inspect the trace and errors](/docs/studio/trace).
- Why was it slow or expensive? [Investigate performance](/docs/studio/slow-runs).
- What happened across several messages? [Follow a session](/docs/studio/sessions).
- Will a change improve the answer? [Run an evaluation](/docs/studio/first-eval).
- How do I change instructions safely? [Create and test a prompt](/docs/studio/create-prompt).

## What the system contains

The SDK application executes your workflows. A telemetry API stores the activity, and Studio displays it. Cloud operates the API, database, and Studio for you; self-hosting puts those services on your infrastructure. The [core concepts](/docs/studio/concepts) explain how runs, sessions, and workflow maps fit together.

## What Studio captures

Studio can show workflow steps, model timing, token counts, costs, and errors. Your application chooses what to send. Prompt text and inputs/outputs are excluded by default; [content capture](/docs/studio/connect-project#choose-what-content-studio-may-store) requires an explicit application setting.

## Child workflow visibility

A workflow can call another workflow and use its result. Studio shows these child calls inside the parent execution. [Inspect child workflows](/docs/studio/runs#child-workflows) for waiting, returned, inherited, or reused work.

## Evaluate workflow behavior

Evaluations run example conversations against your application and check the results. They execute your real agent through an authenticated endpoint. Start with [your first evaluation](/docs/studio/first-eval), then [read and compare results](/docs/studio/evaluation-results).
