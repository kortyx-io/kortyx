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

## Current self-hosted boundary

The first self-hosted release is intentionally small: one Project, one Studio instance, one telemetry API instance, and PostgreSQL. Local development and a controlled single-instance server deployment are supported.

Built-in OIDC, users, granular RBAC, multiple Project administration, official cloud modules, high availability, and published capacity guarantees are not claimed yet.

> **Security boundary:** Local CLI deployments bind to loopback by default. Before remote exposure, add HTTPS and a trusted access boundary such as a VPN or identity-aware proxy. Basic Auth must never cross an unencrypted connection.

Kortyx Studio is source-available under the Elastic License 2.0. The Kortyx framework, CLI, telemetry API, and supporting packages are Apache-2.0.
