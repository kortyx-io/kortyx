---
id: "v0-cli-local-studio"
title: "Manage a local Studio installation"
description: "Start, stop, inspect, and reset the CLI-managed Docker installation while preserving local credentials and data across ordinary restarts."
keywords: ["kortyx", "cli", "local", "studio"]
sidebar_label: "Manage a local Studio installation"
section: "local-installation"
---
# Manage a local Studio installation

These commands manage Docker containers on your machine. They do not operate a Cloud installation or log in to a remote server. For prerequisites and the complete first-run path, follow [Run Studio locally](/docs/self-hosting/run-locally).

Local state is stored in `~/.kortyx/studio` by default. Supply the same `--home` on later commands when using another directory.

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

## Preserve active evaluations

The table's data-preservation column describes stored data. It does not promise
that an in-flight evaluation survives `stop`, `restart`, a changed image, credential
rotation, or `reset`. If evaluations are configured, [prepare worker retirement](/docs/self-hosting/deployment-lifecycle)
while the consumer still accepts later cases, and wait for durable Studio results
before replacing Studio services. If the consumer application is also being
replaced, drain it after Studio saves those results.

These CLI commands do not coordinate worker and consumer retirement. The built-in
updater refuses configured evaluation targets; keep automatic updates paused and
use controlled maintenance. A fixed Compose stop timeout can force-kill long
work. Direct stop/reset remains operator teardown, and older images lack the new
drain hooks. [Check the first-upgrade procedure](/docs/self-hosting/deployment-lifecycle#upgrade-from-older-releases)
before using the new signals.

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

Studio image tags use the Studio release version, not the CLI package version.
CLI and Studio minor versions may differ while remaining compatible through the
stable Studio API protocol. `studio status` reports the configured image and the
negotiated protocol; `studio inspect` rejects only an incompatible protocol major
or a response that violates the advertised protocol.

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

See [Credentials and Secrets](/docs/self-hosting/credentials-secrets) before using generated values on a server.

## Reset local data

```bash
npx kortyx studio reset --confirm
```

> **Destructive command:** Reset permanently deletes the local PostgreSQL volume. It preserves generated credentials, so the next `studio start` creates an empty database and bootstraps those keys again.

Back up any telemetry you need before resetting. See [Operations and Troubleshooting](/docs/self-hosting/operations#back-up-a-local-installation).

> **Good to know:** A normal stop or restart preserves data. Before a destructive reset, make a [backup](/docs/self-hosting/operations#back-up-a-local-installation) and keep the matching [credentials and pepper](/docs/self-hosting/credentials-secrets#backup-and-incident-response).

## Local CLI versus remote operation

Lifecycle commands manage the local Compose stack; read commands query the
Studio HTTP API. Read commands cannot execute/resume runs, approve interrupts,
publish topology, or administer remote projects. The CLI does not SSH into
servers, edit a remote database, or replace your cloud platform's deployment tools.

For remote environments, use [Deploy on a Server](/docs/self-hosting/deploy-server), inject secrets through the platform, and operate the same container contract through your infrastructure tooling.

Next: [Back up or restore local data](/docs/self-hosting/operations).
