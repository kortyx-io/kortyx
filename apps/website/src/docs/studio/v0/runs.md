---
id: v0-studio-runs
title: "Inspect a run"
description: "Find a workflow execution, read its status and steps, inspect child calls, and understand missing content or incomplete completion evidence."
keywords: [kortyx, studio, guides]
sidebar_label: "Inspect a run"
section: "debugging"
---
# Inspect a run

A run is a workflow execution in your application. Cloud and self-hosted Studio use the same inspection views. Studio observes execution; it does not replace your application runtime.

## Find a run

Open **Runs**, choose the project and environment, and narrow the time range. Search for a run, session, workflow, user, or error. Open a row to inspect its overview, execution, trace, events, model inputs/outputs, and feedback where available.

If the list is empty, clear filters and verify the application sent telemetry to this project's endpoint with its SDK write key. See [Connect Your Project](/docs/studio/connect-project) and [Search and Filters](/docs/studio/exploring-data).

## Status and completion

Status describes execution, not answer quality. A failed run has execution failure evidence. An interrupted run has paused for human input; **Waiting for input** and **Input expired** describe its associated interrupt.

> **Good to know:** A response can finish while background work continues. Check the final run status and [trace](/docs/studio/trace) before deciding the run is done. [Handled tool denials or faults](/docs/studio/metrics#tool-outcomes) do not automatically fail the workflow.

## Child workflows

Runs defaults to root executions. Enable **Include child workflows** in Filters to inspect individual calls. Opening a child selects it within its parent execution. Session run counts continue to count roots.

A child returns to its caller. Waiting, resumption, return, failure, and cached reuse are distinct states. Forked branches can inherit calls from their source; inherited evidence is not newly executed work. See [Sessions](/docs/studio/sessions#checkpoints-and-branches).

## Trace and events

Use Trace for nested spans, model/provider requests, tool attempts, and human waits. Nested spans overlap: do not add all their durations to estimate total time.

Events shows captured lifecycle facts and their payloads. **Occurred** is the emitter timestamp; **Received** is ingestion time. Ingest delay can reflect buffering, network delay, or clock differences. A missing terminal event leaves incomplete evidence rather than proving success.

## Captured content

Prompt, input, and output content is excluded by default. Your application controls capture; enabling it in server configuration affects future telemetry. **Not captured** means evidence is unavailable, not that the original value was empty. Large content can be omitted with a capture-limit marker.

Use payload controls to inspect clean/raw representations, wrap long values, or copy authorized captured data. See [capture configuration](/docs/studio/connect-project#choose-what-content-studio-may-store).

## Feedback

Ratings supplied by your application and human correctness reviews are distinct from execution status and automated eval grades. A negative rating does not mark a run failed. Connect feedback through your authenticated backend; see [Collect response feedback](/docs/studio/feedback#collect-response-feedback).

Next: [Understand metrics](/docs/studio/metrics), [Inspect sessions](/docs/studio/sessions), or [Inspect interrupts](/docs/studio/interrupts).
