---
id: "v0-cli-inspect"
title: "Inspect runs and sessions from the CLI"
description: "Read workflow runs, sessions, interrupts, and diagnostic findings through a supported Studio connection without browser automation."
keywords: ["kortyx", "cli", "inspect"]
sidebar_label: "Inspect runs and sessions from the CLI"
section: "studio-commands"
---
# Inspect runs and sessions from the CLI

These commands require a Studio connection with read access. Use a local or self-hosted project key; Cloud telemetry keys cannot read Studio data. [Set up a connection](/docs/cli/connections) first.

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



Next: [Command reference](/docs/cli/reference).

> **Good to know:** `--include-content` can return only content the app captured. Check [capture configuration](/docs/studio/connect-project#choose-what-content-studio-may-store) and [missing-data troubleshooting](/docs/studio/troubleshooting) before assuming the original value was empty.
