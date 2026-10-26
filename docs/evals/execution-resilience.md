# Resilient evaluation execution

Studio schedules each selected case and repetition independently, including a
single-suite evaluation. A refused or disconnected attempt becomes an Error with
its own safe error code; other attempts and suites continue. Completed results,
session links and captured steps remain available. Errors are not scored as Failed.

## Admission and observation

New Studio and SDK consumers negotiate `jobs-v1` using response headers on the
existing authenticated manifest GET. The manifest JSON and node/workflow shapes
are unchanged. Studio submits a stable UUID for each run/case/repetition, the
original submission timestamp and the discovered storage generation. The consumer
atomically stores and deduplicates admission before running the case. Reusing an
identity with different content returns 409. Deduplication history is retained for
at least the 24-hour submission window plus a five-minute clock-skew margin, even with shorter retention settings.

A 429 or 503 retries only the affected admission, with at most three retries and
jitter. `Retry-After` accepts seconds or an HTTP date. A delay exceeding 60 seconds
fails with `EVAL_RETRY_DELAY_EXCEEDED`; the overall worker deadline also applies.
Discovery GETs can retry safely. Legacy POSTs retry only when the authenticated
consumer explicitly returns `accepted: false`. Arbitrary POST network failures,
legacy dropped streams and unsafe consumer node/model operations are never replayed.

Accepted jobs live independently of HTTP connections. Studio reconnects with
`GET ?executionId=<uuid>&after=<sequence>`, using the same generation and service
key. Events have contiguous cursors; duplicates are skipped and missing events
fail observation. Explicit user cancellation uses authenticated DELETE with the
same execution ID. A planned Studio worker drain finishes the claimed evaluation,
including its later cases and durable Studio result, before retirement. Detaching
a negotiated observer does not request cancellation; a killed worker still needs
its documented lease/recovery handling. Cancellation remains cooperative, and capacity stays
reserved through teardown. Each execution has a 30-minute cooperative deadline.

Studio displays Queued, Retrying, Reconnecting and Status unknown. Unknown means
that an attempt may have executed: inspect the consumer before starting a new run.
A lost ownership lease is recorded as unknown and never automatically reassigned.
An explicit cancellation acknowledges the uncertainty and releases the reservation;
confirm that the old owner has stopped before doing this. Exactly-once external
side effects still require consumer-owned idempotency/transactions.

## Consumer capacity and storage

```ts
import { createEvalRouteHandler, createPostgresFrameworkAdapter } from "kortyx";

const persistence = createPostgresFrameworkAdapter({
  connectionString: process.env.KORTYX_POSTGRES_URL!,
  namespace: "my-application/development",
});
await persistence.maintenance.setup();
const handleEvals = createEvalRouteHandler({
  evals,
  serviceKey: process.env.EVAL_SERVICE_KEY!,
  executionStore: persistence.evalExecutions,
  maxActiveRuns: 10,
  maxActiveAttempts: 20,
  maxQueuedExecutions: 1000,
});
// Forward GET, POST and DELETE to handleEvals without stripping headers/query.
// Planned retirement, after Studio has finished its claimed evaluations:
await handleEvals.drain(); // Keep HTTP, cancellation and the store alive.
// Wait for observers/Studio to persist results, then retire HTTP connections.
await handleEvals.close();
// After workflow executions also finish:
await persistence.close();
```

This adapter-owned capability requires a release containing `evalExecutions`;
older SDK versions continue to use the standalone factory. Upgrade agent/runtime
together and run adapter setup with the migration role before serving traffic.
The existing table SQL and checksums remain unchanged.

Use migration credentials only in the deployment command that calls
`maintenance.setup()`. Serving processes create a fresh adapter using restricted
runtime credentials and pass its `evalExecutions` to the route without calling
setup. On first use, adapter-owned eval storage validates the recorded version,
checksum and required table columns without running DDL. Missing or incompatible
schemas reject with guidance to run setup using a compatible SDK and migration
credentials; do not edit applied history to bypass a mismatch.

The serving role needs schema `USAGE`, `SELECT`, `INSERT`, `UPDATE` and `DELETE`
on `kortyx_eval_execution_namespaces`, `kortyx_eval_execution_jobs` and
`kortyx_eval_execution_events`, plus `SELECT` on
`kortyx_eval_execution_migrations`. It needs neither schema `CREATE` nor write
access to the ledger. The adapter can create a new namespace row through DML,
and preserves the generation of an existing namespace.

The PostgreSQL framework adapter exposes `evalExecutions`, reusing its connection
pool, namespace, migration setup and shutdown. Pass the same `persistence` to
`createAgent({ frameworkAdapter: persistence, ... })`. Optional Redis checkpoint
caching preserves this capability; eval admission, leases and events always use
PostgreSQL. Workflow checkpoint storage alone does not change the eval route's
memory default: explicitly pass `executionStore: persistence.evalExecutions`.

All replicas must connect to the same database with a stable namespace. A load
balancer may discover one replica, submit to another, and reconnect to a third;
they see the same generation and execution history. Separate memory stores can
return `EVAL_EXECUTION_STORE_CHANGED` even without any restart. Do not include a
process ID, hostname or deployment revision in the namespace. Stop or drain old
memory-backed consumers before switching traffic to PostgreSQL-backed consumers;
their in-flight memory records cannot be recovered from the new store.

The existing `createPostgresEvalExecutionStore({ connectionString, namespace })`
remains supported for eval-only hosts or independent database/pool ownership.
Call its `setup()` before traffic and its `close()` after handlers and observers
finish. The standalone factory retains automatic setup on first use for backwards
compatibility, which requires migration privileges on a fresh process. Use the
adapter-owned capability when migration and serving roles are separate.
Keep standalone storage when it needs a namespace different from workflow
storage; changing an existing eval database or namespace changes its generation. To tune the adapter-owned store, use
`createPostgresFrameworkAdapter({ ..., evalExecutions: { leaseMs, retentionMs,
maxBytes, maxJobBytes, queueTimeoutMs } })`. Eval retention and lease settings are
independent of workflow checkpoint retention and approval TTL.

The default memory store works within one process; share a single instance between
handlers if they share capacity. A restarted memory store has a new generation,
so old requests cannot silently execute twice. Use the PostgreSQL store for replica
coordination and restart recovery. Studio persists the admission generation before POST and reads it on worker recovery.
A changed generation stops recovery before another POST. Previously recorded legacy
attempts are fenced as unknown. Custom durable `EvalJobStore` implementations must
provide `executionGeneration` to restore these receipts and `executionEvidence`
to retain already captured steps/session links; omit recovery methods only for stores
that never reclaim previously dispatched work.

Replicas must use the same namespace, service
key, suite definitions and capacity settings. Queued jobs recover on another
replica; running jobs with an expired lease become unknown instead of replaying.
Service-key rotation changes the private job scope; drain before rotation.

The defaults allow one active evaluation group, twenty active attempts and a
thousand queued executions. A group is one evaluation, not one HTTP request.
Requested concurrency is additionally enforced within the group. Changed group
concurrency is rejected even while siblings are queued; older conflicting queued
records cannot block unrelated eligible jobs. Separate Studio
evaluations share consumer capacity and queue instead of exhausting the consumer.
A suite-level legacy request reserves its requested concurrency immediately.
Applications must size these limits for their providers and shared resources.

Waiting admission expires after thirty minutes. Completed/cancelled jobs are pruned
after the configured retention (at least 24 hours plus the five-minute margin); unknown jobs require inspection
and cancellation. Defaults cap retained payload/evidence at 128 MB per store
namespace, 32 MB per job and 10,000 events per job. A safe terminal error can exceed
the normal evidence cap so the failure itself remains observable. Full capacity
returns 503 plus `Retry-After: 2` and `accepted: false`; large individual requests
return a safe storage-limit error. Payloads can contain prompts and application data:
use a dedicated restricted database role, appropriate encryption/backups and a
namespace per application/environment. These are customer execution records, not
maintainer analytics.

## Graceful consumer retirement

These hooks require a build that includes consumer retirement. The published
`kortyx@0.32.0`, `@kortyx/agent@0.39.0` and `@kortyx/runtime@0.25.0` baseline does
not expose this hook; install a coordinated release explicitly containing it.
A build from source can have unpublished changes despite matching version strings.
Do not silently substitute aborting `close()` when graceful drain is unavailable.

`handleEvals.drain()` immediately refuses new execution identities, finishes its own
active executions and a scoped snapshot of accepted queued jobs, and waits for
cleanup, terminal store writes and outstanding heartbeats. It is idempotent and
irreversible. Existing authenticated discovery, result observation and DELETE
cancellation remain available. Negotiated callers receive `503`, `accepted: false`
and `Retry-After: 2`; legacy callers receive `429` with the same non-acceptance
signal. A matching jobs-v1 POST retry for an already accepted identity reattaches
its existing result stream, including during drain; changed content returns 409.
It neither admits new work nor replays tools. Retries are bounded, so keep admission
available somewhere when Studio still needs to submit cases. `close()` retains its explicit abort behavior and
can escalate a pending drain; an aborted drain does not acknowledge success.

A consumer execution is not a whole Studio evaluation. Studio submits later
cases separately. For a single consumer, first drain Studio workers **while the
consumer is still accepting work**, wait for their claimed evaluations and durable
results, then drain the consumer. Keep the consumer's HTTP listener and store open
until result observers finish; `drain()` does not wait for every HTTP reader or
close those resources. The host owns signal handling and this orchestration.
Queued Studio evaluations wait until an eligible replacement worker starts.

For overlapping consumers, first make a compatible replacement reachable using
the same durable execution namespace, service key, suite revisions and capacity
settings. Route new admissions to it, drain the old handler, and preserve result
observation until Studio persists the outcome. The old handler only claims its
queue snapshot; submissions arriving on the replacement after that snapshot do
not extend its drain. Work already claimed by another owner remains that owner's
responsibility. A shared store preserves queued jobs and results, not live code or
running-job transfer. Separate memory stores do not provide this protocol across
replicas. Do not rotate service keys or change suite definitions mid-evaluation.

The built-in memory and PostgreSQL execution stores implement `queued(scope)` and
`claimQueued(owner, scope, limits, ids)`. Custom stores can keep ordinary execution
without them, but graceful drain refuses to succeed until both are implemented.
The snapshot must be scoped and bounded by the configured queue limit; selected
claims must preserve the same atomic lease and shared capacity rules as `claim`,
and never claim an ID outside the supplied snapshot. Upgrade `@kortyx/agent` and
`@kortyx/runtime` together before using this hook. No wire or database schema
change is required; older consumers do not gain the hook automatically.

There is no deployment drain timeout. Cancellation and existing execution budgets
still apply. An ambiguous admission/claim, missing queue evidence or unconfirmed
terminal write rejects drain with a bounded, content-free error. Keep resources
available and investigate instead of treating rejection or an operator timeout as
successful retirement. Explicit abort and forced host termination cannot guarantee
completion or exactly-once tool effects.

## Deployment and recovery

The existing per-evaluation concurrency ceiling remains 20. With the default one
active evaluation group, maximum concurrency is unchanged. The new
`maxActiveAttempts: 20` limit is shared across active groups: a consumer configured
with `maxActiveRuns: 2` could previously run 20 attempts per group (40 combined).
Set `maxActiveAttempts: 40` to preserve that combined capacity. Negotiated jobs
queue when combined capacity is occupied; requests whose individual reservation
exceeds the configured capacity are rejected rather than silently changing their
concurrency.

Upgrade consumers first, forwarding DELETE and preserving headers. Then upgrade
API and Studio together to understand new progress events. Old Studio clients keep
the request-owned stream and disconnect cancellation behavior. New Studio detects
old consumers and preserves their legacy protocol, without reconnect/replay promises.
Do not deploy new progress producers into an older strict wire reader.

Failed eval setup can be retried on the same instance after a temporary database
or lock failure; incompatible schema history still rejects every attempt. Lock
waits are capped at five seconds without relaxing stricter database settings.
Built-in stores bound heartbeat waits to one third of the lease (ten seconds by
default). A renewal failure or timeout cooperatively aborts execution and leaves
the job fenced until its lease expires to unknown. Shutdown does not await a
hung raw heartbeat forever; application execution and cleanup must still honor
cancellation. Custom stores may provide `heartbeatTimeoutMs`; otherwise the
renewal budget is twice `heartbeatIntervalMs`. Upgrade agent/runtime together.

The PostgreSQL store creates three namespaced execution tables and an independent
checksum migration ledger on setup, under an advisory lock. It does not modify
session checkpoint migrations or Studio telemetry tables. Run setup with a migration
role before traffic. Adapter-owned serving initialization performs no DDL. Schema history is
verified on startup; incompatible history fails closed. Back up the namespace and
its generation together: losing deduplication history must also reset generation.
On an unknown execution, inspect consumer activity and side effects, stop a stale
owner, explicitly cancel to release capacity, then decide whether a new run is safe.

## Observability and maintainer usage

Customer progress records include case/repetition, queue/retry/reconnect state,
retry time and HTTP status. Safe consumer failure envelopes and diagnostic IDs are
preserved. Unstarted attempts have no fabricated session link. A transport failure
retains captured conversation evidence and reports an execution issue.

Maintainer usage reuses `studio.eval` with `action: retry` and `phase: admission`
or `network`. These count retry waits, including discovery, not completed evals.
For retry incidence, compare retry features to existing `studio.eval` execution
operation counts; the ratio is retries per operation and can exceed one. It is not
a provider error rate, and bounded aggregation/opt-out/delivery loss can undercount.
Only approved enum properties are collected: never endpoints, service keys, case
names, execution IDs, prompts or raw exception text. Customer progress is independent
of maintainer usage delivery and opt-out.
