---
id: v0-studio-cli-commands
title: "Kortyx Studio CLI Commands"
description: "Manage local Studio and inspect runs, sessions, and interrupts through read-only project connections."
keywords: [kortyx, studio, cli, commands, docker, credentials]
sidebar_label: "CLI Commands"
---
# Kortyx Studio CLI Commands

The `kortyx studio` commands manage the local Docker-based installation and provide read-only debugging against local or remote Studio APIs. Run them through the public `kortyx` package:

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

> **Good to know: Publication runs in your application's deployment environment.** The CLI imports the application entry module and calls the telemetry API with its write key. Include it in CI/CD for each application release. For a private API, run from an allowed network, for example in a one-off ECS task using the application's release image; the GitHub runner can launch that task without reaching the private API itself. Deploying Studio does not run this command for your applications.

## Reset local data

```bash
npx kortyx studio reset --confirm
```

> **Destructive command:** Reset permanently deletes the local PostgreSQL volume. It preserves generated credentials, so the next `studio start` creates an empty database and bootstraps those keys again.

Back up any telemetry you need before resetting. See [Operations and Troubleshooting](./07-operations.md#back-up-a-local-installation).

## Read-only run and session debugging

Inspect a Studio link directly, without browser automation:

```bash
npx kortyx studio inspect "http://localhost:6300/runs/<run-id>" --json
npx kortyx studio inspect "https://studio.example.com/sessions/<session-id>" --connection staging --json
```

Inspection returns project context, entity details, the latest execution events,
branch-aware child calls, and diagnostic findings. Findings are evidence, not
an automated root-cause conclusion: retries and human interruptions may be
expected. Link selectors such as `call` and `branch` are retained as context,
not applied as API filters.

```bash
npx kortyx studio runs get <run-id> --connection staging --json
npx kortyx studio sessions get <session-id> --connection staging --json
npx kortyx studio interrupts get <interrupt-id> --connection staging --json
npx kortyx studio runs list --connection staging --status failed --range 1h --json
npx kortyx studio workflows list --connection staging --range all --json
npx kortyx studio catalogs --connection staging --json
npx kortyx studio doctor --connection staging --json
```

Lists default to 25 items over 24 hours. Use `--limit` (up to 100) and pass
`page.nextCursor` as `--cursor` for the next page. Short time ranges are `1h`,
`24h`, `7d`, `30d`, and `all`. Supply both `--started-after` and
`--started-before` for custom ISO datetime boundaries. Run lists support
`--include-children`; workflow metrics currently span environments.

Detail output defaults to the latest 100 events and explicitly reports omitted
events, calls, and findings. Increase `--event-limit` when needed (up to 10000).
Captured content is omitted by default; `--include-content` returns it only if
it was captured. Resume tokens and recognizable credentials remain redacted,
but arbitrary application content may still contain sensitive data. Missing
telemetry/content does not prove an action did not happen.

### Connect local, staging, or another project

Local Studio is automatically available as `local` after `studio start`, using
its managed Studio read key. For remote access, securely inject a project-scoped
read key into an environment variable, then register the API/browser URL pair:

```bash
npx kortyx connections add staging \
  --api-url https://api.example.com \
  --studio-url https://studio.example.com \
  --api-key-env KORTYX_STAGING_READ_KEY \
  --environment staging

npx kortyx connections list --json
npx kortyx connections use staging
npx kortyx studio doctor --connection local --json
```

Profiles store locators and environment-variable references in
`~/.kortyx/connections.json`, never raw remote keys. Use `--config-home` or
`KORTYX_CONFIG_HOME` for another configuration directory. Read keys need
`studio:read`; browser passwords and telemetry-write keys are not interchangeable.
Use a different profile/key for each project, even when projects share a URL.
Remote account login and project/key administration are not implemented.

For IDs, selection is `--connection`, then `KORTYX_CONNECTION`, the saved
default, and finally `local`. Pasted URLs must match a configured Studio or API
base URL; unknown or ambiguous URLs fail without sending credentials. Explicit
selection must also match the pasted URL. Agents should select a connection
per command instead of changing the shared default. Remote connections require
HTTPS and any existing VPN/network access; redirects are not followed.

## Local CLI versus remote operation

Lifecycle commands manage the local Compose stack; read commands query the
Studio HTTP API. Read commands cannot execute/resume runs, approve interrupts,
publish topology, or administer remote projects. The CLI does not SSH into
servers, edit a remote database, or replace your cloud platform's deployment tools.

For remote environments, use [Deploy on a Server](./06-deploy-server.md), inject secrets through the platform, and operate the same container contract through your infrastructure tooling.
