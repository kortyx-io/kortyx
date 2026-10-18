---
id: "v0-studio-first-run"
title: "Explore your first run"
description: "Open a real workflow run in Studio, follow its model and tool steps, and check the result before exploring the rest of your data."
keywords: ["kortyx", "studio", "first", "run"]
sidebar_label: "Explore your first run"
section: "get-started"
---
# Explore your first run

You need an application that has sent at least one request to Studio. Finish [Cloud setup](/docs/cloud/get-started) or [local setup](/docs/self-hosting/run-locally) first. If you already have Studio but no data, [connect your project](/docs/studio/connect-project).

## 1. Find the request

Send one request through your application's normal interface. Note the approximate time. Open **Runs** in Studio and select a time range containing that request. In Cloud, check the organization and project in the navigation bar too.

Open the matching row. You should see the workflow name, status, and run details. If the row is missing, clear search and filters, then follow [missing data checks](/docs/studio/troubleshooting).

## 2. Follow its steps

Open **Execution** to follow the workflow's steps and any child calls. Open **Trace** to inspect model calls, tool attempts, and waiting time. Choose one model call and inspect its model/provider, timing, and usage when available.

Inputs and outputs may say **Not captured**. The app must enable capture before sending that content; enabling it later cannot recover older payloads.

> **Good to know:** A pause symbol can mean the app is waiting for a person. Read the [interrupt lifecycle](/docs/studio/interrupts#read-the-lifecycle) before treating a pause as a failure.

## 3. Check how it ended

Read the run status. If it failed, open the failed step and inspect its error. If it paused for input, open the associated interrupt. A delivered answer can precede completion of background work.

For a conversation, follow its session link to see the related runs. Your app must have supplied a shared session ID for them to appear together.

You have finished this walkthrough when you can identify the request, explain the steps Studio recorded, and find its result or reason for stopping.

Next: [Investigate a slow run](/docs/studio/slow-runs) or [inspect a trace](/docs/studio/trace).
