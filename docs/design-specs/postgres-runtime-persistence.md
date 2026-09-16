# Durable runtime persistence and retention

Kortyx owns the runtime persistence contract. PostgreSQL stores authoritative execution state; an optional Redis connection caches checkpoint payloads. This does not require a LangGraph upgrade or a LangGraph PostgreSQL saver package. The graph saver implements the engine's existing checkpoint interface using Kortyx's own relational format.

## Public API

```ts
import { createAgent, createPostgresFrameworkAdapter } from "kortyx";

const persistence = createPostgresFrameworkAdapter({
  connectionString: process.env.KORTYX_POSTGRES_URL!,
  namespace: "my-app",
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  retention: {
    checkpointHistoryDays: 30,
    inactiveSessionDays: 30,
  },
  redis: { url: process.env.REDIS_URL!, ttlMs: 15 * 60 * 1000 },
});

// Deployment/migration command: finish before accepting application traffic.
await persistence.maintenance.setup();

const agent = createAgent({ workflows, frameworkAdapter: persistence });

// Application-owned scheduled job or dedicated worker:
const result = await persistence.maintenance.prune({ batchSize: 500 });

// Host shutdown, after executions have finished:
await persistence.close();
```

The method is a server-side library API, not an HTTP endpoint. The application chooses its policy and schedule. The SDK implements safe deletion. No retention timer runs inside request handlers. Any HTTP scheduler trigger and its authorization remain application-owned.

## Independent lifetimes

- Redis cache TTL defaults to 15 minutes. Expiring Redis does not expire PostgreSQL state.
- Checkpoint history defaults to a rolling 30 days measured from checkpoint creation. PostgreSQL has no default 50-checkpoint count limit.
- Session retention defaults to 30 days since the last append, execution, lease renewal, rollback, fork creation, or pending-request write. Browsing history does not extend retention.
- Interrupt lifetime defaults to 15 minutes via `ttlMs`; applications explicitly configure longer approval windows. The absolute deadline is `createdAt + ttlMs`. Updates, rollback, and fork do not renew it.
- Internal graph history is retained with its run. A retained session checkpoint pins the run, including its writes. Orphan runs expire after the history inactivity window.

An inactive session's expiry ends access to all its checkpoints, even if the checkpoint history window is longer. While a session is retained, its current head is protected even when older than the history window. An unexpired interrupt or live execution protects its session and run. An expired session cannot be revived by touching its id before maintenance has purged it; use a new session id.

## Relational state

Shared `kortyx_runtime_*` tables contain namespace-scoped sessions, session checkpoints, runs, graph checkpoints, graph pending writes, and pending human requests. The migration table versions the shared schema. Setup is explicit, idempotent, transactional, and serialized with a schema advisory lock. PostgreSQL connection credentials and runtime tables are separate concerns from Studio telemetry and the application's business tables.

The engine can enqueue task writes before its asynchronous checkpoint save. Writes create an internal placeholder when necessary, preserving relational ownership and cascaded cleanup. Reads and lists exclude placeholders; saving the complete checkpoint publishes it while preserving the early writes. A failed checkpoint save can leave an unreadable placeholder, which normal orphan-run retention removes.

Session append locks its session row and assigns a monotonically increasing turn index. The checkpoint and head update commit together. Rollback moves the head and changes active lineage without deleting later checkpoints; summaries expose `branchStatus: "active" | "abandoned"`. Retained abandoned checkpoints can still be inspected, forked, or reactivated. Stream and interrupt invalidations are computed from the formerly active branch.

The PostgreSQL session store owns pending-request publication for rollback and fork. The agent prepares workflow-call branch state before publication and does not repeat token deletions or saves after the store returns; a token consumed by another worker after commit cannot be recreated by that post-processing.

Paused session checkpoints contain complete graph snapshots and pending writes. Fork copies that snapshot and generates independent run/request/token identities. Continuing a fork does not need the parent's storage. Parent ids in session records are provenance, not execution dependencies. An incomplete paused snapshot is rejected. Rolling back or forking an expired embedded approval returns `INTERRUPT_EXPIRED` instead of reviving it.

Pending consumption uses PostgreSQL `DELETE ... RETURNING`, so only one worker can consume a token. This is atomic token consumption, not a promise of exactly-once external side effects or automatic retry after a worker dies following consumption. Side-effect idempotency and business receipts remain application-owned.

## Redis cache consistency

Authoritative writes finish in PostgreSQL. Reads resolve visibility/existence and graph revision in PostgreSQL before using Redis. Redis saves the larger immutable session snapshot or graph tuple; graph cache keys include checkpoint position and the run revision, which changes on checkpoint/write mutations. Namespace and connection identity isolate cache keys.

A missing/expired cache entry is populated from PostgreSQL asynchronously; cache writes do not delay the authoritative read. Cache population is deduplicated per key and limited to ten concurrent operations per adapter, with excess population skipped. Operations have a configurable `redis.timeoutMs` budget, default 25 ms and maximum 1000 ms. A Redis error, malformed cached JSON, or timeout falls back to PostgreSQL and bypasses the cache for five seconds before retrying. Shutdown drains the bounded population tasks before closing connections. A cached payload cannot make an expired or physically removed record visible. Old cache keys disappear through their independent TTL rather than requiring a cross-store deletion transaction. Redis is optional, and PostgreSQL availability remains necessary even on a cache hit.

Session head reads validate the head, session expiry, and checkpoint protection in one database query. Without Redis, that query also returns the immutable payload. Session activity is an expiry-guarded atomic upsert; execution lease acquisition atomically inserts or claims its run. Task writes are persisted in a batch rather than through one query per channel. Repeated special write indices retain their last value, while ordinary conflicting writes retain the original value.

Durability does not imply zero response latency. The engine overlaps graph checkpoint saves with token generation, and best-effort cache fills run outside the response path. Reads needed for continuation, run ownership, and successful durable pause publication still require database acknowledgements. Moving those writes to an unacknowledged background task would introduce a loss window. Maintenance is application-scheduled, but database contention can still affect requests. Measure generation start, time to first token, and completion with the deployment's network latency and workload; local tests cannot establish a production latency guarantee.

## Cleanup and execution concurrency

The orchestrator acquires a run lease before executing nodes and releases it after the complete outcome has been persisted, including pauses and background continuation. Leases last two minutes and renew every 30 seconds only while executing. A duplicate execution of the same run is rejected. Renewal failure or a 90-second local renewal deadline aborts execution; an application crash leaves a bounded lease instead of an eternal active flag. Rollback of a session with an executing run is rejected.

Resume acquires the lease before consuming its token or restoring its graph snapshot, then transfers the lease to the orchestrator. Lease acquisition failure leaves the approval available. Preparation failure restores a consumed approval only while ownership has not been lost, and releases the lease. Resume uses the record returned by atomic consumption rather than an earlier lookup that may precede a session transition.

Ordinary mutations acquire a shared transaction advisory lock for their namespace. A prune call attempts the exclusive counterpart and reports `skipped` if a mutation or another cleanup job owns it. Cleanup therefore cannot delete between a dependency check and a write. Mutations still run concurrently, using row locks for session heads and graph write revisions.

Prune first removes expired pending requests, then unprotected session checkpoints, orphan graph checkpoints, empty expired sessions, and empty orphan runs. Every table phase removes at most `batchSize` parent records (maximum 1000). Graph writes cascade with their owning graph checkpoint; large runs are pruned checkpoint by checkpoint. `deleted` reports counts by table and `hasMore` is a conservative hint that a batch filled. Each call is one transaction and can be retried safely. The host decides whether to repeat immediately or schedule another batch.

Read-time expiry is independent of physical deletion. Late or missing maintenance jobs waste storage but do not extend approvals or session visibility. Changing retention does not recover deleted history. Hosts should monitor prune results and failures as normal job metrics; database vacuum/backup operations remain infrastructure-owned.

## Replay boundary

This supports durable resume, retained session rollback, and fork. Runtime functions/services are intentionally not serialized; the host supplies them again. Continuation uses registered workflow code. Existing execute/resume contract validation checks workflow versions; applications must preserve compatible chat workflow/state/interrupt contracts or migrate them. Versioned code artifacts, exact original model outputs for arbitrary historical re-execution, and a durable side-effect ledger are separate features. PostgreSQL persistence alone does not promise deterministic reproduction across deployments.

Existing Redis-only state is not automatically imported when PostgreSQL is enabled. Hosts must plan a cutover for outstanding approvals or provide an explicit migration. Reuse adapters per process to reuse their connection pools. Cleanup does not reverse business side effects or operate on application tables.

## Local latency measurement

The repository includes `scripts/benchmark-runtime-persistence.cjs`. Build the SDK first and run it with explicitly disposable `KORTYX_TEST_POSTGRES_URL` and `KORTYX_TEST_REDIS_URL` services. `BENCH_SAMPLES` defaults to 100; optional `BENCH_OUTPUT` writes the JSON report.

A local run on 2026-09-16 used PostgreSQL 17 and Redis 7 Docker services, ten warmup turns per adapter, 100 measured turns per adapter, a continuing session with 16 KiB state, and an immediate one-token mock model. Adapter order rotates between measured turns to reduce gradual load bias. The mock model makes runtime overhead visible without model-provider latency. Results are elapsed from `agent.streamChat()` invocation:

| Adapter | Generation start p50 / p95 | First token p50 / p95 | Completion p50 / p95 |
| --- | --- | --- | --- |
| memory | 1.39 / 4.30 ms | 2.17 / 6.50 ms | 2.18 / 6.55 ms |
| redis | 2.44 / 10.13 ms | 2.81 / 10.64 ms | 21.43 / 61.88 ms |
| postgres | 5.10 / 16.61 ms | 5.42 / 19.30 ms | 22.08 / 68.26 ms |
| postgres-redis | 5.56 / 22.17 ms | 5.91 / 22.57 ms | 22.30 / 86.49 ms |

These measurements are local observations, not an SLA or a production concurrency benchmark. Network distance, database contention, cold connections, state size, and actual model behavior affect results. Optional Redis is a payload cache rather than a way to remove required PostgreSQL acknowledgements; it can add a lookup on a miss. The parallel-streaming regression independently blocks graph checkpoint saves and proves that the first model token still reaches the client before those saves complete.
