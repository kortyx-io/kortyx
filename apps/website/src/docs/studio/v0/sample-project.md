---
id: "v0-studio-sample-project"
title: "Explore Studio with sample data"
description: "Try Studio with fictional runs, prompts, and evaluations, follow guided tours, and learn how page help differs from a real application connection."
keywords: ["kortyx", "studio", "sample", "tours", "help"]
sidebar_label: "Explore sample data and tours"
section: "get-started"
---
# Explore Studio with sample data

You can explore Studio before connecting an application. Open the project selector
and choose **Sample project**, then inspect its fictional runs, conversations,
interrupts, prompt versions, and saved evaluations. No application or model-provider
credentials are needed to browse the sample.

These controls require a Studio build that includes the sample project and tours.
Cloud workspaces show them after the corresponding Cloud update. If they are not
available yet, follow [the application connection guide](/docs/studio/connect-project).

## Read-only sample data

The sample has its own `/sample/` URLs. It shows completed examples you can inspect;
it cannot edit prompts, launch evaluations, or resume an approval in your app.
Switch back to your project when you want to inspect real activity.

> **Good to know:** A sample run demonstrates the interface. To verify your own application, [connect telemetry](/docs/studio/connect-project) and [inspect a real request](/docs/studio/first-run). Completing a tour does not establish a working connection.

## Guided tours and page help

Open **Explore → Explore Studio**, or **Help & tours** in the Studio/account menu.
Choose a chapter for one task or follow the full walkthrough. The full tour covers
orientation, debugging, conversations, approvals, prompt versions, and saved
evaluation comparisons. Additional guides cover diagnostics, evaluations still
being graded, and personal preferences.

Use **Next** and **Back** to follow the evidence. You can skip a chapter, exit, or
resume later. Progress stays in this browser; reloading does not start a tour.

Choose **Explain this page** from Explore for guidance about your current real or
sample view. It keeps the selected record, tab, filters, and project in place.
When a view has no records, opening a sample example asks for your choice first.
Use the documentation footer to read more about the feature in a new tab.

## Show or hide the sample

Open **Settings → Sample project** and change **Show sample project**. Hiding the
sample removes it from the selector; you can restore it in Settings. Hiding an
active sample returns you to your real context. This changes sample visibility,
not your recorded application data.

## Continue with your application

Use the real project's setup guide to connect its telemetry producer, publish the
[workflow catalog](/docs/cli/topology), and send one real request. Check the
project, environment, and time range before looking for its run.

Next: [Connect your application](/docs/studio/connect-project),
[inspect a run](/docs/studio/runs), or [compare saved evaluation results](/docs/studio/evaluation-results).
