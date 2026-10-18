---
id: "v0-cli-local-evaluations"
title: "Run evaluations without Studio"
description: "Execute your application evaluation instance in the terminal, inspect local results, and control environment loading without a Studio connection."
keywords: ["kortyx", "cli", "local", "evaluations"]
sidebar_label: "Run evaluations without Studio"
section: "application-commands"
---
# Run evaluations without Studio

## Run locally without Studio

Export the existing `createEvals` instance as `evals` (or the default export) from
an application module such as `src/evals/index.ts`. Use a dedicated eval module
that initializes the agent and suites without starting your HTTP server.
TypeScript and JavaScript entries use the CLI's existing module loader and nearest
`tsconfig.json` path aliases. The loader stays active for lazy workflow imports
until execution finishes. Keep initialization synchronous; do asynchronous
identity setup inside `createEvals.setup`.

Add a script to your application's `package.json`:

```json
{
  "scripts": {
    "eval": "kortyx evals run --entry ./src/evals/index.ts"
  }
}
```

```sh
pnpm eval
pnpm eval --suite product-ambiguity --case choose-blue --repetitions 3
pnpm exec kortyx evals list --entry ./src/evals/index.ts
pnpm eval --suite product-ambiguity --concurrency 2 --json > eval-results.json
```

The command calls the exported instance's `run()` directly. Your existing setup,
permission binding, custom executor, interrupt responders, cleanup and code judge
all run in the application process. No Studio, consumer HTTP endpoint, target
configuration or Studio key is required. Semantic criteria require a code judge;
interaction and structured-output checks alone require no judge. Workflow models,
tools and authentication still need their usual application configuration.

The CLI loads `.env` then overlays `.env.local` before importing the entry.
In a monorepo it loads defaults from the Git or pnpm workspace root down to the
app directory, with nearer files taking precedence. Existing shell variables
always win.
To select other files, repeat `--env`; later files override earlier ones:

```sh
pnpm eval --env /private/development.env --env /private/eval.env
```

For a one-line package script without repeated flags, remember paths in a
**gitignored** `.env.evals.json` in the app or workspace root:

```json
{
  "envFiles": ["/private/development.env", "/private/eval.env"]
}
```

Keep the profile and referenced files owner-only (`chmod 600`). Relative paths
in the profile resolve from its directory. The nearest profile replaces default
env loading; discovery stops at a Git or pnpm workspace boundary. Explicit
`--env` flags replace both the profile and defaults, and resolve from the
invocation directory. Missing configured files fail before loading the app;
credentials are never printed. The CLI handles loading directly, so no launcher
script or shell exports are required. Package scripts in monorepos can forward
with `pnpm --filter my-agent eval`.

Model credentials remain application-owned, for example `OPENROUTER_API_KEY`
for an OpenRouter app judge. Studio's judge settings are not used by this command.

Omitting `--suite` runs all configured suites in definition order. `--case` accepts
space-separated case IDs and requires `--suite`. `--repetitions` and `--concurrency`
override the SDK's run settings; omitted flags preserve them. `--export NAME`
selects another named instance instead of `evals`/default.

Interactive terminals show an animated suite progress bar, one live row per active
attempt, elapsed time, and the actual setup, workflow, interrupt-response, judging
and cleanup phases. Every completed step and case gets its own result, followed
by a colored suite verdict and counts. Long calls keep animating; concurrent
attempts remain distinct. The bar measures completed attempts, not estimated model
completion. Application logs/warnings are preserved above the live display.
Piped output is plain text with per-case start and step results; `--no-color` or
`NO_COLOR` disables color/live progress. Explicit `--color` forces the interactive
report, including when `NO_COLOR` is set. `--json` always disables the terminal UI.
`--json` replaces the report with one JSON object containing `schemaVersion: 1`, `status`, aggregated
`counts`, and full SDK `runs` (including observations). Keep application logs off
stdout when consuming JSON. Configuration/import failures use stderr.

Exit status is `0` when all selected suites pass, `1` for failed/errored runs or
configuration errors, and `130` for cancellation. Ctrl+C forwards an abort signal,
allows SDK cleanup and stops later suites. Cancellation remains cooperative: app
code must honor its signal. Results are returned in the terminal/JSON; this local
command does not save eval records to Studio. Agent telemetry, if configured by
the application, continues to follow its existing settings.

Next: [Connected evaluations](/docs/cli/evaluations) if you need Studio to save and display the results.

> **Good to know:** Local execution returns results in the terminal. To save and compare evaluation records in Studio, use [connected evaluations](/docs/cli/evaluations) and the [results guide](/docs/studio/evaluation-results). Your configured agent telemetry continues independently.
