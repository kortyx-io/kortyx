---
id: "v0-cli-evaluation-automation"
title: "Automate evaluation runs"
description: "Enqueue an evaluation after deployment using a supported Studio connection, protect credentials, and inspect the eventual saved result."
keywords: ["kortyx", "cli", "evaluation", "automation"]
sidebar_label: "Automate evaluation runs"
section: "studio-commands"
---
# Automate evaluation runs

Use automation after the application and its evaluation endpoint are deployed and ready. This flow requires a supported Studio project credential; Cloud CLI login is not implemented.

## Optional post-deployment GitHub Actions step

Install and pin `kortyx` or `@kortyx/cli` in the application's lockfile. After your
existing deployment and readiness check, enqueue a suite:

```yaml
- name: Start conversation evals
  continue-on-error: true
  env:
    KORTYX_DEPLOY_EVAL_KEY: ${{ secrets.KORTYX_DEPLOY_EVAL_KEY }}
  run: >-
    pnpm exec kortyx studio evals runs start product-ambiguity
    --target catalog --environment staging
    --api-url https://api.example.com
    --api-key-env KORTYX_DEPLOY_EVAL_KEY
    --json
```

This step returns after enqueueing and does not wait for grades or gate the
deployment. Inspect results in Studio or with `runs get`. Ensure the CI runner can
reach the Studio API, and the Studio API can reach the deployed consumer endpoint.
Use a key scoped to the intended project with `studio:read` and `eval:run`.
Each invocation creates a new run; your deployment workflow owns trigger frequency.

> **Good to know:** A saved comparison does not freeze your application or external data. Keep the deployed revision and test actor stable, then use the [comparison guide](/docs/studio/evaluation-results#read-results-and-compare) to interpret changes.

## Deployment and scheduled CI examples

Kortyx has no native cron scheduler. CI can invoke the same CLI after a successful
deployment/readiness check, or on a schedule. Pin a compatible CLI in the lockfile,
provide a Studio project key with `studio:read`, `eval:run`, and environment access,
and ensure the CI runner can reach the Studio API.

Example post-deployment job step (after readiness):

```yaml
- name: Evaluate deployed application
  continue-on-error: true # Report results initially; remove when trusted as a release gate.
  env:
    KORTYX_DEPLOY_EVAL_KEY: ${{ secrets.KORTYX_DEPLOY_EVAL_KEY }}
  shell: bash
  run: |
    set +e
    pnpm exec kortyx studio evals runs start --all \
      --target catalog --environment staging --judge studio \
      --api-url https://api.example.com --api-key-env KORTYX_DEPLOY_EVAL_KEY \
      --source deployment --commit "$GITHUB_SHA" \
      --deployment-url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
      --idempotency-key "deploy-$GITHUB_RUN_ID" --wait --timeout 1800 --json > eval-results.json
    eval_exit=$?
    if jq -e '.run' eval-results.json >/dev/null 2>&1; then
      jq -r '"Evaluation: \(.run.name) — \(.run.status)\nSuites: \(.run.completedSuites)/\(.run.suiteCount)\nPassed: \(.run.counts.passed), failed: \(.run.counts.failed), errors: \(.run.counts.error)"' eval-results.json >> "$GITHUB_STEP_SUMMARY"
      jq -r '"[Open evaluation](https://studio.example.com/evals/evaluations/\(.run.id))"' eval-results.json >> "$GITHUB_STEP_SUMMARY"
    fi
    exit "$eval_exit"
```

For nightly checks, invoke that CLI step in a workflow with these triggers and
change `--source deployment` to `--source schedule`:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: '0 2 * * *' # UTC
```

A trigger owns frequency and idempotency. `--commit` must identify the application
actually deployed; in a scheduled workflow, discover that commit from your
application's version endpoint instead of assuming the checked-out CI commit is
running on the server. An evaluation pins suite and judge definitions, but does
not freeze the deployment or external data while execution is in progress.

The grouped API is `/v1/studio/evals/evaluations`: POST creates a selection, GET
lists grouped/legacy history; `/:id` returns summary and suites, `/:id/results`
returns detailed results, and POST `/:id/cancel` cancels remaining work. Existing
`/v1/studio/evals/runs` endpoints continue to serve individual suite executions.
Apply migration `0007_evaluation_runs` before deploying the new API. Browser and
CLI grouped operations require a compatible Studio/API release.

Next: [Inspect saved results](/docs/cli/evaluations#inspect-and-cancel).
