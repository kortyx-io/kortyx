---
id: "v0-cli-reference"
title: "CLI command reference"
description: "Look up application, Studio, evaluation, connection, and local installation commands with their credential and hosting requirements."
keywords: ["kortyx", "cli", "reference"]
sidebar_label: "CLI command reference"
section: "reference"
---
# CLI command reference

Use `kortyx --help` and `kortyx <group> --help` for the flags available in your installed release.

| Command group | Purpose | Connection |
| --- | --- | --- |
| `topology push` | Publish source-discovered workflow maps | Cloud or self-hosted telemetry endpoint and write key |
| `evals list`, `evals run` | Execute the app's exported eval instance locally | No Studio connection |
| `connections add/list/use/remove` | Manage local connection profiles | A supported Studio credential when adding a remote profile |
| `studio inspect` | Inspect a run/session URL | Supported Studio read access |
| `studio runs/sessions/interrupts/workflows` | Read project execution data | Supported Studio read access |
| `studio prompts` | Read, change, test, or transfer prompt versions | Supported Studio connection and required permissions |
| `studio evals` | Diagnose, start, inspect, or cancel saved evaluations | Supported Studio connection and required permissions |
| `studio start/stop/restart/status/logs` | Operate local containers | Local Docker installation |
| `studio credentials/reset` | Manage local credentials or reset data | Local installation; reset is destructive |

## Cloud availability

Cloud supports topology publication with a project telemetry key. The CLI has no Cloud account sign-in flow. Studio read, prompt-management, and remote-evaluation commands therefore require a supported self-hosted connection. Your Cloud browser session and ingestion key do not provide those CLI credentials.

## Output and secrets

Use `--json` where the command supports it for structured output. Read each command's guide for its exit status and whether success means a completed operation or an accepted request. Requesting captured content may expose application data even when recognizable credentials are redacted.

Next: [Connections](/docs/cli/connections), [inspection](/docs/cli/inspect), [prompts](/docs/cli/prompts), or [evaluations](/docs/cli/evaluations).
