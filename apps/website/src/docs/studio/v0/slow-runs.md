---
id: "v0-studio-slow-runs"
title: "Investigate a slow run"
description: "Separate model latency, tool execution, and time waiting for a person so you can find what made a workflow run slow."
keywords: ["kortyx", "studio", "slow", "runs"]
sidebar_label: "Investigate a slow run"
section: "performance"
---
# Investigate a slow run

Open a run with an unexpectedly long duration. Compare its overview with the trace before changing model or application settings.

## Separate work from waiting

Look for an interrupt or a long quiet period. A person taking time to answer can make wall time much longer than the time spent doing work. Multiple model/tool calls can also overlap.

Open **Trace** and inspect the operations that span the slow part of the run. Their timestamps show whether calls happened in sequence or at the same time.

## Check model timing

Time to first token (TTFT) measures how long a streaming request waited before its first output. Streaming duration measures the time spent sending the answer. Finalization covers work after the stream ended, when reported.

> **Good to know:** A slow first response and a long answer are different problems. Compare the same model and similar requests, then check [TTFT and stream timing](/docs/studio/metrics#model-timing). For pauses while a person answers, inspect [interrupt timing](/docs/studio/interrupts#understand-timing).

## Compare a broader period

Use **Workflows** to inspect timing across recorded runs in the selected period. Median (p50) is the middle observation; p95 describes the value that 95 out of 100 observations fall at or below. Check the sample count before treating a percentile as representative.

Next: [Metric definitions](/docs/studio/metrics) or [token usage and cost](/docs/studio/costs).
