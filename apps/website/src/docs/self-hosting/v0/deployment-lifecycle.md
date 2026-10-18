---
id: "v0-self-hosting-deployment-lifecycle"
title: "Deploy without abandoning evaluations"
description: "Choose a singleton or separate-worker deployment, drain evaluations safely, and understand queue, cancellation, consumer and availability boundaries."
keywords: [kortyx, studio, deployment, evaluations, draining, workers, replicas, shutdown]
sidebar_label: "Retire evaluation workers"
section: "operate"
---
# Deploy without abandoning evaluations

This guide is for operators replacing a self-hosted Studio installation or its
application evaluation endpoint. A deployment has two independent lifetimes:
HTTP requests and evaluation work. A web request can finish in seconds while an evaluation continues through
many cases, tool calls, grading and cleanup. Replacing the web application must
account for both.

Verify this procedure against a real project and application endpoint. The
read-only sample project contains fixed examples, including running evaluations;
those examples do not own worker leases or demonstrate a completed drain.

Use this guide with a release that includes the standalone worker and retirement
signals below. Older images do not acquire these capabilities from configuration
alone. Check the selected release's notes and deployment strategy before upgrading.

## Choose the smallest suitable setup

| Setup | Appropriate use | What happens during replacement |
| --- | --- | --- |
| Combined API/worker | Maintenance is acceptable | Drain, restart, resume queue |
| Separate web and worker | Independent web releases | Retire the worker separately |
| Temporary worker overlap | Compatible rolling releases | Verify replacement, drain owner |

A configured replica count of one may describe normal capacity, or a strict limit
of one process at any moment. The latter prevents overlapping worker generations:
queued work must wait until the old owner exits and its replacement starts.
During overlap, draining owners still count against the shared execution budget.
Neither configuration creates a second server or database failover automatically.

## Upgrade from older releases

The published Studio/API **0.22.0** image does not provide `SIGUSR2` preparation
or the standalone worker entry point. Do not use `SIGUSR2` as a preparation fence
for that image: an unsupported signal can be ignored by Linux PID 1 or terminate
a differently hosted process. Its `SIGTERM` stops the worker
without waiting for the whole evaluation to finish. The published `kortyx` 0.32.0 /
agent 0.39.0 / runtime 0.25.0 pair also lacks the new consumer `drain()` hook.
Use a release explicitly containing these capabilities; a newer configuration
file does not add them to older binaries.
Image updates also preserve an installation's saved Compose file. Verify the
actual service `stop_grace_period`/container stop timeout; setting
`KORTYX_API_STOP_GRACE_PERIOD` only affects templates that reference it. The local
45-second test is an example proving signal/grace behavior, not a universal
production timeout for evaluations that may take much longer.

For the first upgrade from an older embedded worker, establish a verified fence
against new evaluation submissions, explicitly settle queued work, and wait for
all active evaluations and durable results while the old services remain alive.
Then retire the old processes during controlled maintenance. An idle snapshot
without a submission fence is insufficient. Do not start overlapping old/new
workers and assume the older owner honors the new shared execution budget.

## Understand what draining preserves

Studio first saves a submission in PostgreSQL. A worker then claims an evaluation
group and owns its execution lease. **Draining stops new claims, not submission
into the queue.** It finishes all remaining work in already-claimed groups,
including later cases, grading, consumer cleanup, heartbeats and final result
writes. A claim already in flight is included.

Active evaluations stay on their original owner. They are not moved, restarted or
split between old and new workers. User cancellation and the evaluation's frozen
execution deadline continue to apply. Queue waiting does not consume that execution
deadline; a CLI wait timeout does not cancel an evaluation.

For example, if A is running and B is queued, a strict singleton drains A, exits,
then starts the replacement that claims B. Studio can accept another queued
submission while its API is available. The queue has no start-time guarantee;
monitor backlog and oldest queued age.

## Replace a singleton combined API and worker

The default API includes a worker. For planned maintenance:

1. Prevent competing deployments and verify the exact owning process/container.
2. Send `SIGUSR2` to that process. This prepares evaluation retirement while
   HTTP stays available for submission, progress, prompt reads and cancellation.
3. Wait for that owner's current `drained` state confirmation. A `failed` state
   or operator wait timeout is an incomplete operation; retain the owner and
   investigate. A drained worker cannot resume admission.
4. Send `SIGTERM` and confirm a clean process exit before starting another worker
   when the one-process limit is strict.
5. Complete any required maintenance/migrations, start the compatible replacement
   and verify API readiness, authenticated reads and queued-work progress.

The expected result is that active work finishes on its original owner and queued
work keeps its ID and status. The single API still has an HTTP interruption during
its own restart. Do not leave a healthy-but-drained process indefinitely as the
only worker.

| Signal | Meaning |
| --- | --- |
| `SIGUSR2` | Stop new evaluation claims and finish owned work; keep HTTP and dependencies available. |
| `SIGTERM` | Retire HTTP and finish owned evaluations independently, then close shared resources. Repeated signals do not become an abort. |
| `SIGINT` | Explicitly abort active worker execution and close resources. This can leave execution uncertain. |

These are the built Node entry points' Unix signal semantics. Confirm that the
platform delivers the signal to the owning process; development watchers and
process managers can handle signals differently.

HTTP drain has a 25-second bound. Evaluation drain has no fixed deployment timeout.
Container platforms can still force-kill a process after their termination grace
period. The supplied Compose default, `KORTYX_API_STOP_GRACE_PERIOD=30s`, covers
HTTP teardown only. Prepare evaluation draining before teardown, or verify that
the platform preserves the owner through every configured deadline and cleanup.
Increasing a timeout alone does not coordinate replacement.

Direct `SIGTERM` to the only combined API/worker withdraws HTTP while evaluations
finish. Use preparation first, or keep a surviving API available for cancellation
and results. An expired controller wait must not become an automatic forced abort.

## Separate the worker from web releases

On every web-only API replica, configure:

```dotenv
KORTYX_API_EVAL_WORKER_ENABLED=false
KORTYX_EVAL_MAX_CONCURRENT_EVALUATIONS=4
```

Target discovery, submission, reads and cancellation remain API functions. Keep
their existing target and applicable judge configuration on the API.

Run the same API image as a separate workload with command:

```text
node apps/api/dist/eval-worker.js
```

The worker needs `DATABASE_URL`, the same private targets and applicable judge
settings. It does not require the API-key pepper or Studio read key, and it does
not run migrations. Set the same concurrency budget on every OSS worker. The
API-only enable flag does not disable the explicit worker command.

`API_HOST` and `API_PORT` configure its private health listener, default
`0.0.0.0:6400`. Use separate ports for processes sharing a network namespace.
This listener exposes only `GET /live`, `/health` and `/ready`; it is not an API
service. A draining or drained worker is live but unready for new claims. Use
liveness for restart decisions so retirement does not trigger a destructive
restart. API readiness describes HTTP availability, not available eval capacity.

For compatible releases that permit overlap, verify the replacement before
preparing the old owner. If candidate startup fails, leave the original owner
admitting work. If the replacement fails after preparation, the original still
finishes its work but cannot claim again: repair/start a compatible eligible
owner. Do not restart an owner that still has active leases. Serialize additional
worker releases while an earlier generation drains.

## Preserve limits and compatibility

`KORTYX_EVAL_MAX_CONCURRENT_EVALUATIONS` defaults to four groups across PostgreSQL,
including draining owners. A group may contain multiple suites and parallel
attempts; this is not a provider-request or spending limit. Consumer endpoint
capacity and provider quotas remain independent.

The shared budget changes the previous per-process-only behavior. Set the same
value on all workers. Older binaries, direct claim callers without a limit and
custom stores do not automatically enforce it. Custom stores own atomic claims,
lease fencing and shared admission. Before relying on the new behavior, fence
legacy admission and verify active work is finished; an idle sample is not a fence.

Overlapping versions must agree on database, progress/result, target and judge
contracts. Follow the release's `rolling` or `recreate` marker. Run migrations
once, preserve compatible readers and dependencies for active owners, and retain
the supported rollback path. For an incompatible migration, drain workers before
changing the schema. See [High Availability](/docs/self-hosting/high-availability).

The built-in updater refuses configured eval targets before stopping services
and pauses automatic updates. This includes target files and web-only APIs whose
workers may be elsewhere. Use controlled manual maintenance for those installs.
Disable older updaters' schedules before configuring evaluations. CLI stop/reset
and direct Compose commands do not coordinate evaluation preparation themselves.

## Keep the consumer application available

The consumer application executes workflows and tools; Studio coordinates and
observes them. Its SDK endpoint exposes `await handleEvals.drain()` to stop new
POST admissions and finish its local active executions plus a bounded snapshot of
accepted queued jobs. It waits for cleanup, terminal store writes and outstanding
heartbeats. Authenticated discovery, observation and cancellation remain available.
New negotiated execution identities receive `503` with `accepted: false` and
`Retry-After: 2`; legacy callers receive `429`. A matching jobs-v1 POST retry for
an already accepted identity reattaches its stream during drain, without replaying
tools; changed content returns 409. `close()` retains its explicit abort behavior.

A consumer job is not a whole Studio evaluation: Studio submits later cases
separately. With a **single consumer**, use this order:

1. Prepare Studio worker draining while the consumer still accepts executions.
2. Wait for claimed evaluations and their durable Studio results.
3. Drain the consumer handler, keeping HTTP and its store available for observers.
4. After observers finish, retire HTTP, close the handler and close its store.
5. Start the replacement consumer and eligible Studio workers; queued Studio work
   can then start. Keep a separate API available if submissions must stay open.

Draining the only consumer first can cause later cases to exhaust bounded admission
retries and become Error. The SDK hook does not coordinate these hosts itself.

For **overlapping consumers**, first make a compatible replacement reachable with
the same durable store/namespace, service key, suite revisions and capacity limits.
Route new admissions to it, drain the old handler and retain observation until
Studio commits outcomes. The old handler claims only its fixed queued snapshot;
new submissions on the replacement do not extend retirement. Jobs already owned
by another replica remain that owner's responsibility. PostgreSQL shares queued
jobs/results; it does not transfer running code. Separate memory stores cannot
provide this cross-process recovery contract.

Drain is idempotent and irreversible, with no deployment timeout. Existing run
budgets and cancellation still apply. Ambiguous admission/ownership or an
unconfirmed terminal write rejects retirement; retain dependencies and investigate.
Upgrade agent/runtime together. Built-in stores support drain; custom execution
stores need scoped `queued` and atomic `claimQueued` capabilities or drain refuses
success. Wire formats and database schema are unchanged; an older consumer does
not gain this hook. Do not change suite definitions or rotate service keys during
active evaluations. See [Conversation Evals](/docs/sdk/guides/conversation-evals).

This only retires the eval endpoint. Other application requests, chat/workflow
streams, tools and telemetry flushing still need their own host lifecycle.

If a worker or host crashes, its next eligible claim/reconciliation pass records
an expired lease as uncertain/error rather than blindly repeating tool calls.
The consumer may still be running. Inspect it before explicitly starting another
evaluation. Partial results are not evidence of a completed successful suite.

## Check other deployment dependencies

| Surface | What to preserve |
| --- | --- |
| Prompt serving | A reachable API for applications resolving prompts, or their documented snapshot/cache policy. |
| Telemetry and writes | Durable acknowledgements; stable event IDs for ingestion retries. Retry other mutations only under their documented idempotency contract. |
| Live Studio updates | Reconnect SSE and reread persisted state. Notifications are invalidations, not a durable event replay log. |
| Sessions and open tabs | Compatible shared secrets/session storage, retained old JS/CSS and a refresh boundary that protects unsaved drafts. Replicas alone do not implement these. |
| Database and resources | Migration ownership, rollback compatibility, private connectivity and capacity for overlapping pools/processes. |

## Reliability targets and SLAs

Measure HTTP availability, submission-to-start delay and infrastructure-caused
evaluation interruptions separately. A correctly failed assertion, explicit user
cancellation or configured execution deadline is a different outcome from a
deployment interrupting work.

An SLI is a measurement, an SLO is its reliability target, and an SLA defines a
customer commitment and consequences when its objectives are missed. Define the
scope, measurement window and responsibilities before selecting a percentage.
These lifecycle contracts do not create an uptime SLA. Self-hosted commitments
must distinguish software support from the operator's infrastructure. See
[Google SRE's definitions](https://sre.google/sre-book/service-level-objectives/).

Next: use [Operations and Troubleshooting](/docs/self-hosting/operations) for maintenance,
[High Availability](/docs/self-hosting/high-availability) for web replicas, and the
[Configuration Reference](/docs/self-hosting/configuration-reference) for settings.
