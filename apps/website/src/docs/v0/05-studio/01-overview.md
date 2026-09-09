---
id: v0-studio-overview
title: "Kortyx Studio Overview"
description: "Understand what Kortyx Studio observes, how it relates to the SDK runtime, and which setup path to follow."
keywords: [kortyx, studio, observability, telemetry, self-hosted, runs]
sidebar_label: "Studio Overview"
---
# Kortyx Studio Overview

Kortyx Studio is the self-hosted observability interface for applications built with the Kortyx SDK. It turns telemetry from your server-side agents into a readable history of sessions, runs, workflow transitions, model calls, interrupts, timing, token usage, and cost.

Studio observes your application; it does not execute its workflows. Your Kortyx agents continue to run if Studio is unavailable.

> **Start here:** If your Kortyx application already runs locally, follow [Run Studio Locally](./02-run-locally.md). You can see a first run in about five minutes.

## What the system contains

| Component | What it does | Where it runs |
| --- | --- | --- |
| Kortyx SDK application | Executes your workflows and emits telemetry | Your application server |
| Telemetry API | Authenticates and stores Studio telemetry | Local Docker or your infrastructure |
| Kortyx Studio | Reads telemetry and presents the interface | Local Docker or your infrastructure |
| PostgreSQL | Stores runs, sessions, projections, and key verifiers | Local Docker or managed PostgreSQL |

The SDK sends telemetry with a Project-scoped write key. Studio reads it with a separate server-side read key. Human access is protected independently.

## Choose your path

### Develop on your machine

Use the CLI-managed stack when you want to inspect an SDK project locally:

1. [Run Studio Locally](./02-run-locally.md)
2. [Connect Your Project](./03-connect-project.md)
3. Keep the [CLI Commands](./04-cli-commands.md) nearby

The CLI starts Studio, the telemetry API, and PostgreSQL with Docker Compose. It also generates the local credentials and waits until the complete stack is healthy.

### Deploy for a team

Use an operator-managed deployment when Studio must run beyond one developer's laptop:

1. Read [Credentials and Secrets](./05-credentials-secrets.md)
2. Follow [Deploy on a Server](./06-deploy-server.md)
3. Plan backup and upgrades with [Operations and Troubleshooting](./07-operations.md)
4. Map your platform to the [Configuration Reference](./08-configuration-reference.md)

The portable deployment uses the same images with externally managed PostgreSQL, secrets, HTTPS, and access control.

## What Studio captures

Structural telemetry can show:

- sessions, runs, status, and duration;
- workflow and node transitions;
- model/provider calls and generation timing;
- token usage and reported cost;
- interrupt creation, resolution, and expiry; and
- the trace and raw event story for an execution.

Prompt, input, and output content is excluded by default. The SDK application decides whether that content may be sent. See [Connect Your Project](./03-connect-project.md#choose-what-content-studio-may-store).

## Child workflow visibility

The SDK's [child workflow API](../03-guides/06-child-workflows.md) is visible in the **Execution** tab of a run. Expand calls beneath their calling node, inspect captured input and returned data, and follow nested nodes and generations. The lifecycle distinguishes waiting, resuming, returning, failure, and cached reuse.

**Runs** defaults to root executions. Enable **Include child workflows** to search and filter individual child calls. Opening a child row selects that call inside its parent execution; it does not create an independent runtime run. Session counts continue to count roots.

Forks and rollbacks have separate branch histories. Inherited calls link to their source execution; new work and cached reuse remain distinguishable. Interrupt details show the child ancestry and link to the waiting call. Studio observes these operations; resume and fork still happen in your application.

On **Workflows**, the CLI discovers resolvable `useWorkflow` calls from node and custom-hook source and publishes dotted purple call/return links before any runs occur. No call declarations are needed. **Observed calls**, enabled by default, overlays execution metrics and adds dynamic targets discovered during runs. Turning it off keeps source-discovered paths visible. Click a link with recorded traffic to inspect an example call; an unexecuted path opens its source/target details. These relationships stay separate from `transitionTo` handoffs.

Run `kortyx topology push --entry src/lib/agent.ts --dry-run --json` to inspect discovered calls, then publish without `--dry-run`. Unresolvable targets produce CLI warnings and rely on runtime observations.

Input and returned data require explicit telemetry content capture. Child payloads over the capture limit are omitted with a marker. Older SDKs retain their generic trace view; an ended attempt span alone cannot establish that a child returned.
