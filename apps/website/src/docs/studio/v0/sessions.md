---
id: v0-studio-sessions
title: "Follow a conversation"
description: "Inspect related workflow runs in one session, understand application user and tenant IDs, and follow checkpoints and branch histories."
keywords: [kortyx, studio, guides]
sidebar_label: "Follow a conversation"
section: "debugging"
---
# Follow a conversation

A session groups related root runs using the session ID supplied by your application.

> **Good to know:** An application's conversation session and a [Cloud browser session](/docs/cloud/sign-in#browser-sessions) are separate. The application supplies the session ID that groups its [root runs](/docs/studio/runs#child-workflows).

## Read a session

Choose **Sessions**, select the project/environment, then open a row. Inspect the root runs, activity, accumulated usage, pending interrupts, and available checkpoint/branch history. Open a run for its trace and events.

The Runs column summarizes roots and their outcomes. Child workflow calls are inspected within parent runs and do not independently increase the root-run count. Cost and token totals depend on captured usage; missing information is not zero.

## Application identity

User and tenant IDs are optional metadata provided by the SDK application. **Not captured** means the application did not provide that evidence. These IDs describe your application's users and tenants; they do not grant access to a Studio organization or project.

## Checkpoints and branches

A checkpoint preserves resumable runtime state. Your application owns resume, rollback, and fork operations. Studio shows the available telemetry and branch history.

Forks and rollbacks have separate histories. Inherited calls link to their source, while newly executed calls and cached reuse remain distinguishable. Follow the active branch and linked parent execution when investigating an interrupt.

## Missing sessions

Check project, environment, time range, and search/filter conditions. Confirm that the application reused the intended stable session ID and sent telemetry. Session histories cannot reconstruct content that was never captured.

Next: [Inspect runs](/docs/studio/runs), [Understand metrics](/docs/studio/metrics), or [checkpoint integration](/docs/sdk/guides/session-checkpoints).
