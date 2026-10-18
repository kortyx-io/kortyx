---
id: "v0-studio-trace"
title: "Inspect a trace and errors"
description: "Follow overlapping model and tool calls in a run trace, inspect recorded errors, and recognize when execution evidence is missing."
keywords: ["kortyx", "studio", "trace"]
sidebar_label: "Inspect a trace and errors"
section: "debugging"
---
# Inspect a trace and errors

Open a run from **Runs**, then choose **Trace**. The timeline shows operations recorded during that execution. Expand a span to inspect its nested calls.

## Find the step that needs attention

Start with failed or long-running operations. Select a model call to inspect its provider, timing, usage, and captured inputs/outputs. Inspect a tool attempt for its result, denial, fault, cancellation, or replay state.

> **Good to know:** The agent can handle a denied tool and continue. Follow later steps and the [final run status](/docs/studio/runs#status-and-completion); the [tool outcome definitions](/docs/studio/metrics#tool-outcomes) distinguish denials, faults, and cached reuse.

## Read timing

Nested operations and parallel calls overlap. A parent span includes time spent on its children. Adding every duration counts some time twice.

Long waits can be compressed in the trace. The displayed quiet period explains that compression. Use the recorded durations when comparing time, especially for interruptions that waited for a person.

## Inspect errors and captured data

Open the failed model or workflow step and read its available diagnostics. A provider failure and a later structured-output processing failure can occur at different stages. Inspect the operation where Studio records the failure.

Your app controls payload capture. Missing text or a missing terminal event leaves incomplete evidence. Check **Events** for recorded activity and distinguish **Occurred**, when the app reported it happened, from **Received**, when Studio received it.

Next: [Understand run status](/docs/studio/runs#status-and-completion) or [investigate slow runs](/docs/studio/slow-runs).
