---
id: v0-studio-metrics
title: "Metric definitions"
description: "Look up execution and model timing, token usage, partial prices, and tool outcomes so you can interpret Studio values and missing evidence."
keywords: [kortyx, studio, reference]
sidebar_label: "Metric definitions"
section: "reference"
---
# Metric definitions

Studio metrics describe captured execution evidence. The definitions are shared by Cloud and self-hosted Studio. Missing evidence is shown as unavailable, partial, unknown, or not captured rather than fabricated as zero.

## Execution timing

Wall time follows elapsed execution time and can include human waits. Active execution and human wait are different measurements. Nested spans and parallel work can overlap, so summing span durations does not reproduce wall time.

**Resumptions** counts continuations identified after interrupt resolution; a resumption continues the logical run rather than creating an independent root run. **Largest quiet period** is the longest gap between adjacent captured events. It can contain provider work, tool work, human wait, or unobserved time; it is not proof of process inactivity.

**Compressed waits** shorten quiet periods longer than five seconds on the trace axis only; the recorded wall-clock duration remains visible in the story and inspector.

**Activity over wall time** counts events in time buckets. **Slowest completed spans** ranks recorded completed operations and excludes operations without completion evidence.

## Model timing

A **model** is the AI system your app calls; its **provider** is the service that runs it. Studio displays the names sent by your app. A missing name does not mean the request never happened.

**TTFT** means time to first token: provider request start to the first observed text chunk. It includes queueing, setup, and model work before output appears. It applies to streaming calls with text output; non-streaming calls can show not applicable.

**Output stream** spans the first-to-last observed output chunk. It is an observation window, not pure model compute. **Finalization** spans the last chunk to completion. Older calls without sufficient timestamps remain unclassified.

**Median TTFT** uses captured applicable TTFT values, not missing calls as zero. Model/provider identity may be unavailable even when requests were recorded.

## Tokens

Usage comes from provider reports. Input, output, cached, and reasoning categories vary by provider/model and should not be assumed additive without that provider's definitions. Missing usage is not a zero-token call.

## Cost and pricing

Cost covers recorded model calls. Studio can use provider-reported charges or estimates from recorded usage and model rates. Pricing status explains the available evidence.

A partial amount is a known subtotal: actual cost may be higher. Unknown cost differs from confirmed zero. Multiple currencies remain separate. Infrastructure and external tool fees are excluded. Average cost divides known costs by all runs in the selection, including runs with incomplete cost data.

Evaluation costs separate workflow and judge model calls. See [Evaluation timing and cost](/docs/studio/evals#timing-and-cost).

> **Good to know:** For a missing price, check [partial cost totals](/docs/studio/costs#recognize-partial-prices). For a slow model request, use [the latency walkthrough](/docs/studio/slow-runs); a missing metric is not a measured zero.

## Tool outcomes

Actual attempts, denied calls, handled faults, cancelled attempts, and cached reuse are different facts. Cached reuse is not another tool execution. A handled tool outcome does not automatically mark the containing workflow failed.

Next: [Inspect the trace](/docs/studio/runs#trace-and-events) or [Compare evaluation results](/docs/studio/evals#read-results-and-compare).
