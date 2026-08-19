---
id: v0-studio-cli-commands
title: "Kortyx Studio CLI Commands"
description: "Start, inspect, stop, upgrade, reset, and manage credentials for a local Kortyx Studio installation."
keywords: [kortyx, studio, cli, commands, docker, credentials]
sidebar_label: "CLI Commands"
---
# Kortyx Studio CLI Commands

The `kortyx studio` commands manage the local Docker-based installation. Run them through the public `kortyx` package:

```bash
npx kortyx studio --help
```

Local state is stored in `~/.kortyx/studio` by default. Commands reuse that state, so credentials and database data survive ordinary stop, restart, CLI upgrades, and repeated starts.

## Everyday commands

| Command | Purpose | Preserves data? |
| --- | --- | --- |
| `npx kortyx studio start` | Create or update the stack and wait until healthy | Yes |
| `npx kortyx studio status` | Show container state and local endpoints | Yes |
| `npx kortyx studio logs` | Follow API, Studio, bootstrap, and database logs | Yes |
| `npx kortyx studio logs --no-follow` | Print recent logs and return | Yes |
| `npx kortyx studio credentials` | Print the current local connection details | Yes |
| `npx kortyx studio credentials --format dotenv --service-name my-agent` | Print copyable server-side SDK variables | Yes |
| `npx kortyx studio restart` | Recreate the stack and wait until healthy | Yes |
| `npx kortyx studio stop` | Stop the containers | Yes |

> **Good to know:** Start is idempotent. Running it again is the normal way to bring back a stopped installation or apply a changed image tag or port configuration.

## Start options

Choose different host ports:

```bash
npx kortyx studio start \
  --studio-port 7300 \
  --api-port 7400
```

Pin both Studio images to an immutable published release:

```bash
npx kortyx studio start --image-tag vX.Y.Z
```

Use an alternate state directory or local username:

```bash
npx kortyx studio start \
  --home /path/to/private/studio-state \
  --username operator
```

The same `--home` value must be supplied to later commands. Alternatively, set `KORTYX_STUDIO_HOME` for the shell or automation that manages that installation.

## Print or rotate local credentials

Print the current browser and SDK connection values:

```bash
npx kortyx studio credentials
```

Print only the server-side SDK variables for an application:

```bash
npx kortyx studio credentials --format dotenv --service-name my-agent
```

This format intentionally omits the browser password and local state path, but
it still includes a secret telemetry write key. Keep the output server-side.

Replace the browser password and both application API-key secrets:

```bash
npx kortyx studio credentials --rotate
```

Rotation updates the local environment atomically, applies new key verifiers, recreates affected services, and attempts rollback if the application fails. The previous telemetry key becomes invalid, so update and restart every local SDK producer.

The database password and API-key pepper are deliberately preserved.

## Generate credentials for remote deployment

```bash
npx kortyx studio credentials --generate
```

This produces an unpersisted credential set without creating local Studio state. Store it immediately in the deployment's secret manager. It cannot be printed again later.

See [Credentials and Secrets](./05-credentials-secrets.md) before using generated values on a server.

## Publish a workflow catalog

Catalog publication is a top-level Kortyx command rather than a Studio
lifecycle command:

```bash
npx kortyx topology push --entry src/lib/agent.ts
```

It publishes declared workflow topology before traffic arrives without
creating runs. Use `--dry-run` to inspect the projection locally. See [Connect
Your Project](./03-connect-project.md#publish-the-declared-workflow-catalog) for
the complete connection flow.

## Reset local data

```bash
npx kortyx studio reset --confirm
```

> **Destructive command:** Reset permanently deletes the local PostgreSQL volume. It preserves generated credentials, so the next `studio start` creates an empty database and bootstraps those keys again.

Back up any telemetry you need before resetting. See [Operations and Troubleshooting](./07-operations.md#back-up-a-local-installation).

## Local CLI versus remote operation

The current CLI manages the local Compose stack. It does not SSH into servers, edit a remote database, or replace your cloud platform's deployment tools.

For remote environments, use [Deploy on a Server](./06-deploy-server.md), inject secrets through the platform, and operate the same container contract through your infrastructure tooling.
