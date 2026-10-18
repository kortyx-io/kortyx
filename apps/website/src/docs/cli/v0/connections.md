---
id: "v0-cli-connections"
title: "Configure CLI connections"
description: "Save API and browser URLs with environment-variable credential references, select the intended project, and understand current Cloud limits."
keywords: ["kortyx", "cli", "connections"]
sidebar_label: "Configure CLI connections"
section: "get-started"
---
# Configure CLI connections

Connections identify the Studio API a command should call and where its credentials come from. Profiles keep API keys out of the connection file.

## Supported credentials

Local Studio supplies a managed read key. Self-hosted installations can supply project-scoped keys with the permissions a command needs. Cloud account login is not implemented in the CLI; a Cloud telemetry write key cannot replace a Studio read or management credential.

## Connect local, staging, or another project

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

> **Good to know:** A pasted Studio URL must match a configured connection. If it is rejected, check the API/browser URL pair before retrying; [inspection](/docs/cli/inspect) preserves run and branch context without guessing which project key to send.

## Match permissions to the task

Read commands need `studio:read`. Starting and cancelling connected evaluations also needs `eval:run`. Prompt authoring and promotion require their corresponding permissions. Request a key scoped to the intended project and task.

Next: [Inspect runs](/docs/cli/inspect) or [connected evaluations](/docs/cli/evaluations).
