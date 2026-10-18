---
id: v0-studio-interrupts
title: "Understand pauses for input"
description: "Inspect a workflow interrupt, read its request and response, check timing and expiry, and distinguish an answer from successful resumption."
keywords: [kortyx, studio, guides]
sidebar_label: "Understand pauses for input"
section: "debugging"
---
# Understand pauses for input

An interrupt pauses workflow execution for human input and preserves a checkpoint. Cloud and self-hosted Studio expose the same lifecycle inspection. Your application supplies the interaction UI, validates the response, and resumes the workflow.

## Read the lifecycle

| State | Meaning |
| --- | --- |
| Waiting for input | A response has not resolved the request and its captured expiry has not passed. |
| Input expired | The request's expiry boundary has passed. |
| Resolved | Resolution was recorded; inspect the resume outcome separately. |
| Cancelled | Cancellation was recorded. |
| Failed | Failure was recorded; inspect the available error evidence. |

> **Good to know:** A resolved interrupt can belong to a run that is still working. Open the [linked run](/docs/studio/runs#status-and-completion) to check whether it resumed and finished. [Interrupt integration](/docs/sdk/guides/interrupts-and-resume) explains how your application continues execution.

## Inspect the request and response

Open an interrupt to see its request, contract/type, captured options, response, timing, and linked run/session. Static options, free-form input, dynamic pickers, and structured contracts are different interaction modes. Unknown means older or incomplete telemetry did not establish the mode.

For an interrupt inside a child workflow, follow the ancestry and waiting call in the parent execution. Do not infer that the child returned merely because an attempt span ended.

## Understand timing

Studio can derive expiry from the captured timestamp before another event arrives. Pending requests show elapsed wait and, when captured, time until expiry. Resolved/cancelled/failed requests show time to their terminal boundary. Human wait contributes to wall time and is separate from active execution.

## Recover in your application

Studio is an inspection surface. Collect and validate the response in your application, then resume with its authorized runtime path. Expired or cancelled requests require the recovery policy implemented by that application. An empty list is normal for workflows that never request human input.

Next: [Interrupt integration](/docs/sdk/guides/interrupts-and-resume), [Inspect runs](/docs/studio/runs), or [Metrics](/docs/studio/metrics).

## Interrupt behavior in Studio

Studio observes interrupt lifecycle events; your application still presents the request and sends the resume response.

- Pending interrupt state expires after 15 minutes by default.
- Configure the application TTL with `KORTYX_FRAMEWORK_TTL_MS`, or with `frameworkAdapter.ttlMs`.
- Studio derives **Expired** from the durable `expiresAt` timestamp.
- A late response cannot resume the expired run, although application fallback may handle it as a new run.
- A dynamic picker may correctly report zero embedded options because the client resolves choices from its own data source.

For runtime behavior and replay-safe side effects, read [Interrupts and Resume](../../sdk/v0/03-guides/02-interrupts-and-resume.md).

