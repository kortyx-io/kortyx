---
id: "v0-self-hosting-evaluation-operations"
title: "Operate evaluation workers"
description: "Understand saved evaluation jobs, worker leases, cancellation, and crash recovery before running multiple self-hosted Studio workers."
keywords: ["kortyx", "self-hosting", "evaluation", "operations"]
sidebar_label: "Operate evaluation workers"
section: "operate"
---
# Operate evaluation workers

## Persistence and execution lifecycle

Apply `packages/telemetry-db/drizzle/0005_eval_runs.sql` through the regular
migration runner before starting the updated API. Each queued record stores its
suite and revision, selection, target and environment. PostgreSQL row locking
allows a worker replica to claim a record once. A lease and heartbeat track active
execution. Progress is saved incrementally; the final result contains public
observations (including emitted execution events), expected behavior, optional
references, grader version, reasons,
and evidence. Studio receives scoped SSE change notifications backed by PostgreSQL
`LISTEN`/`NOTIFY`, then reads the saved result. Runs, case drawers and history
update on changes; completed runs also receive late workflow billing updates.
Live mode is on by default for eval views and can be paused with `?live=false`.
The connection pauses while the tab is hidden or offline, reconciles on reconnect,
and uses a 30 to 60 second refresh fallback during an outage. There is no periodic
polling while connected. A browser reload does not terminate the run.
Caller-visible observations may contain business data and require the same access
and retention policy as ordinary Studio session data.

A consumer disconnect, timeout, or worker crash is an execution error rather than
a failed behavioral grade. An expired lease is marked unknown/error and is never
automatically retried: replaying application workflows can repeat side effects.
Operators should inspect consumer execution before explicitly starting another run.
Cancellation wins the final-storage race when its request is already saved.
The worker actively closes an aborted response reader to signal the consumer; custom setup, tools and cleanup must honor the
signal. A worker shutdown does not promise rollback or prove remote cleanup.

Studio supports saved-run comparison, including per-case outcomes, criterion
verdicts, repeated attempts and workflow inspection through stacked drawers.
Comparison describes observed differences. Its context notice identifies missing
actor/data/prompt identity; it does not establish why an outcome changed.

Suites are authored by the application. Prompt selections can be tested through the current [prompt evaluation controls](/docs/studio/prompts#evidence-and-promotion).


> **Good to know:** A browser reload does not end a saved evaluation. Inspect [result status and timing](/docs/studio/evaluation-results) before starting another run; the [CLI result commands](/docs/cli/evaluations#inspect-and-cancel) can inspect and cancel through a supported connection.

## Concurrent execution recovery

Studio isolates each case and repetition: a refused attempt becomes an Error while
siblings continue, and completed evidence remains inspectable. Compatible consumers
queue accepted jobs, deduplicate admission, honor bounded Retry-After backoff and
let Studio reconnect by event cursor. Cancellation is explicit and cooperative;
capacity remains occupied through cleanup. Retrying, Reconnecting and Status unknown
are visible in case inspection. Inspect an unknown attempt before running it again.

`createEvalRouteHandler` uses a memory execution store by default. For replicas and
restart recovery, pass `createPostgresEvalExecutionStore({connectionString,namespace})`
from `kortyx`, sharing the namespace, service key, suites and capacity settings.
Defaults allow one evaluation group, twenty attempts and a thousand queued jobs.
Forward GET, POST and DELETE with all headers and query parameters. Keep the host
alive while accepted execution runs; close the handler before closing its store.
Lost running leases are never replayed automatically; queued jobs can recover.
External side effects still require application-owned idempotency. Upgrade SDK
consumers first, then API and Studio together; older consumers retain legacy streams.

Next: [Back up and upgrade Studio](/docs/self-hosting/operations).
