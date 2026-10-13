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
same execution ID. Graceful worker shutdown leaves the Studio run recoverable by a new worker.
Disconnect and worker shutdown detach the observer; they do
not request cancellation. Cancellation remains cooperative, and capacity stays
reserved through teardown. Each execution has a 30-minute cooperative deadline.

Studio displays Queued, Retrying, Reconnecting and Status unknown. Unknown means
that an attempt may have executed: inspect the consumer before starting a new run.
A lost ownership lease is recorded as unknown and never automatically reassigned.
An explicit cancellation acknowledges the uncertainty and releases the reservation;
confirm that the old owner has stopped before doing this. Exactly-once external
side effects still require consumer-owned idempotency/transactions.

## Consumer capacity and storage

```ts
import { createEvalRouteHandler, createPostgresEvalExecutionStore } from "kortyx";

const executionStore = createPostgresEvalExecutionStore({
  connectionString: process.env.EVAL_EXECUTION_DATABASE_URL!,
  namespace: "my-application/development",
});
await executionStore.setup();
const handleEvals = createEvalRouteHandler({
  evals,
  serviceKey: process.env.EVAL_SERVICE_KEY!,
  executionStore,
  maxActiveRuns: 10,
  maxActiveAttempts: 20,
  maxQueuedExecutions: 1000,
});
// Forward GET, POST and DELETE to handleEvals without stripping headers/query.
// During shutdown: stop incoming traffic, await handleEvals.close(), then
// await executionStore.close(). Long-running hosts must keep execution alive.
```

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
Requested concurrency is additionally enforced within the group. Separate Studio
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

The PostgreSQL store creates three namespaced execution tables and an independent
checksum migration ledger on setup, under an advisory lock. It does not modify
session checkpoint migrations or Studio telemetry tables. Run setup with a migration
role before traffic if the runtime role cannot create tables. Schema history is
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
