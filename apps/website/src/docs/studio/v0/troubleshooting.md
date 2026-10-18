---
id: "v0-studio-troubleshooting"
title: "Find missing or incomplete data"
description: "Check workspace selection, filters, application telemetry, and capture settings when runs or payloads are missing from Studio."
keywords: ["kortyx", "studio", "troubleshooting"]
sidebar_label: "Find missing or incomplete data"
section: "reference"
---
# Find missing or incomplete data

## No runs appear

1. Send one request through the real application. Publishing a workflow map alone creates no run.
2. Check the time range, search, filters, and environment label. In Cloud, confirm the selected organization and project.
3. Check that the application's server uses the intended API endpoint and telemetry write key. A browser sign-in does not connect your application.
4. Confirm the telemetry adapter is attached to the agent and that the application has loaded its server configuration. Follow [connection verification](/docs/studio/connect-project#verify-the-connection).

For Cloud setup problems, follow [Cloud troubleshooting](/docs/cloud/troubleshooting). For container or database problems, use [self-hosted operations](/docs/self-hosting/operations#troubleshoot-in-order).

## Inputs or outputs are missing

Your application excludes prompt and input/output content by default. Enable only the capture you need, run another request, and inspect the new run. Old content cannot be recovered by changing capture settings. Large payloads may be omitted with a capture-limit marker.

## Cost or timing is missing

A provider or older SDK may not have reported the required values. Missing values remain unknown. Use the [metric definitions](/docs/studio/metrics) to distinguish incomplete evidence from zero usage.

> **Good to know:** Capture settings affect future telemetry. After [changing capture configuration](/docs/studio/connect-project#choose-what-content-studio-may-store), send a new request; Studio cannot recover old content that the application never sent.

## A run is waiting

Open its interrupt to inspect the question and whether it has an answer. Your application owns resuming the workflow. An answered interrupt does not prove the workflow subsequently finished.

Next: [Inspect a run](/docs/studio/runs) or [inspect interrupts](/docs/studio/interrupts).
