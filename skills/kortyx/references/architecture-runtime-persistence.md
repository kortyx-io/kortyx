# Runtime Persistence

Separate three storage concerns.

## Kortyx Runtime Persistence

Stores short-lived execution state:

- pending interrupts
- paused-run checkpoints
- user-facing session checkpoints for rollback, fork, regenerate, and undo
- short-lived runtime state

Choose among the current built-in models:

- **Memory:** local development, tests, and small single-process demos. It is not
  shared or restart-safe.
- **Redis:** shared, low-latency runtime state with native TTL. Use it when the
  desired history fits a bounded expiry window and several app instances must
  resume the same work.
- **PostgreSQL:** authoritative durable runtime history with retention and
  maintenance. Use it for longer-lived checkpoint, rollback, fork, and session
  history.
- **PostgreSQL plus Redis:** PostgreSQL remains authoritative; Redis caches
  checkpoint payloads to reduce repeated-read latency. Redis never controls
  visibility or token consumption in this mode.

By default, `createAgent(...)` uses env-based runtime persistence selection.

```ts
import { createAgent } from "kortyx";

export const agent = createAgent({
  workflows: [workflow],
  defaultWorkflowId: "general-chat",
});
```

Default env selection:

- PostgreSQL if `KORTYX_POSTGRES_URL` exists (explicit setup required), optionally cached using Redis.
- Otherwise Redis if `KORTYX_REDIS_URL`, `REDIS_URL`, or `KORTYX_FRAMEWORK_REDIS_URL` exists.
- Otherwise in-memory.
- TTL can be set with `KORTYX_FRAMEWORK_TTL_MS` or `KORTYX_TTL_MS`.

Use explicit Redis config when shared TTL-oriented runtime state is sufficient:

```ts
import { createAgent, createRedisFrameworkAdapter } from "kortyx";

const frameworkAdapter = createRedisFrameworkAdapter({
  url: process.env.KORTYX_REDIS_URL!,
  ttlMs: 15 * 60 * 1000,
  maxSessionCheckpoints: 50,
});

export const agent = createAgent({
  workflows: [workflow],
  defaultWorkflowId: "general-chat",
  frameworkAdapter,
});
```

## Application Database

Stores product data:

- users, orgs, tickets, orders
- visible conversation history
- documents, embeddings, search indexes
- audit records and durable business events

## Rule

Kortyx runtime persistence is execution state, not the app data layer.

## Checkpoint Retention And Scale

Memory and Redis user-facing session checkpoint retention defaults to the last 50
checkpoints per session. Use `maxSessionCheckpoints` to lower or raise that cap.
PostgreSQL instead uses configured history/session retention windows and has no
50-checkpoint cap.

Redis-backed persistence applies TTL to Kortyx runtime state and shares state across app instances. The same Redis connection handles pending interrupts, internal graph checkpoints, and user-facing session checkpoints.

In-memory persistence has no cross-process sharing and no restart safety. It caps session checkpoints by count per session, but does not have a global session checkpoint memory cap or TTL. Do not recommend it for hundreds of users or long-lived production sessions.

## Decision Rules

- No interrupts/resume and no paused runs: default local behavior is usually enough.
- Short-lived interrupt/resume across production workers: use Redis or PostgreSQL.
- Durable rollback/fork/regenerate history: prefer PostgreSQL.
- Multiple server instances: use Redis, PostgreSQL, or PostgreSQL plus Redis; do
  not use process-local memory.
- Durable history plus faster repeated payload reads: PostgreSQL plus Redis.
- Need visible conversation history or audit records: use the app database.
- For server-owned visible chat, use the route lifecycle hooks described in
  `references/server-owned-chat-transcripts.md`; runtime checkpoints alone do
  not create a product transcript.
- Need longer pause windows: set TTL intentionally and make the UX handle expiry.

## PostgreSQL Durable Runtime History

Use `createPostgresFrameworkAdapter({ connectionString, namespace, ttlMs, retention })` for durable runtime history. PostgreSQL is authoritative. Optionally combine it with `createRedisFrameworkAdapter({ url, ttlMs })` using `createCachingFrameworkAdapter({ storage, cache, timeoutMs: 25 })`; Redis then caches checkpoint payloads. This is runtime execution persistence, separate from the app's business data and semantic memory.

Run `await persistence.maintenance.setup()` explicitly in a deployment/migration command before serving requests. The app schedules `await persistence.maintenance.prune({ batchSize: 500 })`; the adapter owns safe deletion and dependency checks. No automatic retention timer or maintenance HTTP endpoint is installed. `result.deleted`, `result.skipped`, and `result.hasMore` support job monitoring and repeated batches. Call `await persistence.close()` after executions finish on shutdown.

PostgreSQL setup applies bundled, ordered SQL migrations under a schema advisory lock, committing each migration's changes and version together. Reruns skip applied versions; a failed migration rolls back and retries resume at its unapplied version. Earlier successful migrations remain committed. Setup rejects newer schemas and gaps in recorded history; deployment must stop on failure. Future schema changes add immutable numbered migrations without another library. Applied SQL is verified against a stored SHA-256 checksum; editing it causes setup to reject. Migration advisory and DDL lock waits are capped at five seconds, preserving stricter database settings; a timeout rolls back that migration and requires retry. This bounds lock acquisition, not migration execution time. The original version-only v1 ledger adopts the current v1 checksum once, without rerunning schema SQL; its prior contents cannot be verified retroactively. Use compatible additive changes during rolling deployments. Schema migrations do not automatically convert workflow-state JSON or transfer data between backends.

Retention is separate from approval and cache lifetime:

- `retention.checkpointHistoryDays` defaults to 30, without a 50-checkpoint cap.
- `retention.inactiveSessionDays` defaults to 30 since runtime activity; browsing history does not extend it.
- `ttlMs` defaults to 15 minutes for interrupts; configure longer approval windows explicitly.
- the cache adapter’s `ttlMs` defaults to 15 minutes for cache payloads, which can reload from PostgreSQL.
- the helper’s `timeoutMs` defaults to 25 milliseconds per cache operation (maximum 1000). Cache fills are asynchronous and bounded; errors/timeouts bypass Redis for five seconds.

Retained session heads, unexpired pauses, and executing runs are protected. Reads enforce expiry before maintenance physically removes records. Session expiry ends access to its history. Rollback preserves abandoned branches, identified by checkpoint summary `branchStatus`; forks own complete paused snapshots and independent tokens. Expired approvals cannot be revived through rollback/fork.

`createFrameworkAdapterFromEnv()` selects PostgreSQL first if `KORTYX_POSTGRES_URL` is provided; existing Redis URL settings then supply optional caching. It never implicitly uses the app's `DATABASE_URL`. All built-in adapters share `maintenance.setup()`, `maintenance.prune()`, and `close()` through `ManagedFrameworkAdapter`; existing custom `FrameworkAdapter` implementations remain compatible. Redis prune delegates expiry to native TTL; memory prune removes expired approvals, while its session history stays count-limited. Explicit setup is still required.

Durability supports resume/rollback/fork with compatible workflow code. It does not promise exact historical reproduction across code changes or exactly-once external side effects.

Durable PostgreSQL acknowledgements add database round trips. Graph checkpoint saves overlap token generation, while cache fills and scheduled maintenance run outside the response path. Session continuation reads, execution ownership, and durable pause publication still need acknowledgements. Do not promise zero latency overhead or move those required commits into an unacknowledged background task; measure time to first token against Redis in the actual deployment.
