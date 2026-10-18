---
id: v0-studio-workflows
title: "Explore workflow maps"
description: "Read source-discovered and observed workflow paths, inspect node states, and interpret traffic, timing, and health for a selected period."
keywords: [kortyx, studio, guides]
sidebar_label: "Explore workflow maps"
section: "debugging"
---
# Explore workflow maps

Workflows combines source-published structure with execution observations. Use it to understand the graph before a run and investigate how real traffic moves through it.

## Declared and observed connections

Publish the catalog with your application release using [Connect Your Project](/docs/cli/topology#publish-the-declared-workflow-catalog). Source discovery can show resolvable child calls before traffic exists. Unresolvable dynamic targets rely on runtime observations.

**Observed calls** overlays recorded child calls and their metrics. Disable it to concentrate on source-discovered structure; this does not remove source connections. Purple dotted child calls return to their caller; blue dashed handoffs transfer execution.

> **Good to know:** A declared connection can appear before it has run. [Publish topology](/docs/cli/topology) to show paths from source; [open a real run](/docs/studio/first-run) to see which path an execution took.

## Inspect a selection

Select a workflow, node, or connection to open its inspector. Inspect the available version, calls, success/failure, latency, usage, and cost. A connection with recorded traffic can link to an example execution. An unexecuted connection shows source/target details.

## Metrics and scope

Environment, time range, workflow/version, and metric selection change the displayed observations. Refresh metrics after publishing a catalog or generating new traffic. Missing metrics mean no matching evidence is available; they do not prove zero latency or cost.

Success/failure describes recorded execution outcomes. Tool denials and handled faults should be investigated through the run trace before treating them as workflow failures. Compare metrics over equivalent filters and versions.

## Workflow health

Workflow health summarizes recorded activity for the selected period. **Unknown** means no matching runs. **Healthy** means an error rate below 5% and an interrupt rate below 25%. **Degraded** means an error rate of at least 5% or an interrupt rate of at least 25%. **Failing** means an error rate of at least 20%. **Idle** means the latest recorded activity is more than seven days old.

The Health view's emphasis controls highlight individual nodes using separate thresholds: error rate above 3%, p95 latency above two seconds, or interrupt rate above 10%. Volume emphasizes recorded run counts; cost shows recorded average cost. These highlights do not redefine workflow health.

## Node states

Hover or focus a state symbol to read its explanation. An interrupted node's pause symbol means at least one run paused for input at that node. A retry uses an orange dot, border, and circular arrow. A failure means at least one run containing the node failed; it does not by itself identify the failing operation. A warning represents a recorded warning signal.

Healthy means no failure, pause-at-this-node, or retry signal was recorded for matching runs. No node activity means the node did not run in the selected period. These are period summaries; open a run to inspect its event sequence. The run topology instead shows the node's state within that individual execution.

Next: [Metrics](/docs/studio/metrics), [Runs](/docs/studio/runs), or [Child workflow integration](/docs/sdk/guides/child-workflows).
