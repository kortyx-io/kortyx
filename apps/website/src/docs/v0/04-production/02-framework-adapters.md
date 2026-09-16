---
id: v0-runtime-framework-adapters
title: "Runtime Persistence Adapters"
description: "Choose and configure the backend Kortyx uses for interrupt/resume checkpoints."
keywords: [kortyx, runtime-persistence, framework-adapter, redis, postgresql, retention, ttl]
sidebar_label: "Runtime Adapters"
---
# Runtime Persistence Adapters

This page explains the backend Kortyx uses to store runtime state for paused runs.

In code, the API is named `frameworkAdapter`.

Read this page if:

- you use interrupts or resume
- you need paused runs to survive restarts
- you want to choose between in-memory, Redis, and PostgreSQL

If you are only testing locally, you can usually use the default and come back later.

## What this adapter stores

- pending interrupt requests
- checkpoints for paused runs
- user-facing session checkpoints for rollback, fork, regenerate, and undo
- short-lived runtime state with a TTL

> **Good to know:** This adapter is only for Kortyx runtime state. Keep your app's business data in your own DB or service layer.

## Recommended path

For most apps:

1. local dev: pass nothing and use the default
2. production resume: set `KORTYX_REDIS_URL`
3. only create adapters manually when you want explicit control in code

> **Good to know:** `createFrameworkAdapterFromEnv()` is not a third backend. It is the default helper that chooses between in-memory, Redis, and PostgreSQL.

## Where this is used

Most apps do not need to pass `frameworkAdapter` manually.

If you do nothing, `createAgent(...)` falls back to `createFrameworkAdapterFromEnv()`.

That means:

- `KORTYX_POSTGRES_URL` present -> PostgreSQL, with optional Redis caching
- otherwise Redis env var present -> Redis
- otherwise -> in-memory

You pass `frameworkAdapter` to `createAgent(...)` only when you want explicit control.

```ts
import { createAgent, createRedisFrameworkAdapter } from "kortyx";

const frameworkAdapter = createRedisFrameworkAdapter({
  url: process.env.KORTYX_REDIS_URL!,
  ttlMs: 15 * 60 * 1000,
  maxSessionCheckpoints: 50,
});

export const agent = createAgent({
  workflows: [...],
  defaultWorkflowId: "general-chat",
  frameworkAdapter,
});
```

```js
import { createAgent, createRedisFrameworkAdapter } from "kortyx";

const frameworkAdapter = createRedisFrameworkAdapter({
  url: process.env.KORTYX_REDIS_URL,
  ttlMs: 15 * 60 * 1000,
  maxSessionCheckpoints: 50,
});

export const agent = createAgent({
  workflows: [...],
  defaultWorkflowId: "general-chat",
  frameworkAdapter,
});
```

## In-memory

Use this for local development, demos, or quick testing.

```ts
import { createInMemoryFrameworkAdapter } from "kortyx";

const frameworkAdapter = createInMemoryFrameworkAdapter({
  ttlMs: 15 * 60 * 1000,
  maxSessionCheckpoints: 50,
});
```

```js
import { createInMemoryFrameworkAdapter } from "kortyx";

const frameworkAdapter = createInMemoryFrameworkAdapter({
  ttlMs: 15 * 60 * 1000,
  maxSessionCheckpoints: 50,
});
```

- stores pending requests in process memory
- keeps checkpoints only in that running process
- is not restart-safe
- is not shared across multiple app instances
- caps session checkpoints by count per session
- does not have a global session checkpoint memory cap or session checkpoint TTL

## Redis

Use this when paused runs must survive process restarts, deploys, or multiple app instances.

```ts
import { createRedisFrameworkAdapter } from "kortyx";

const frameworkAdapter = createRedisFrameworkAdapter({
  url: process.env.KORTYX_REDIS_URL!,
  ttlMs: 15 * 60 * 1000,
  maxSessionCheckpoints: 50,
});
```

```js
import { createRedisFrameworkAdapter } from "kortyx";

const frameworkAdapter = createRedisFrameworkAdapter({
  url: process.env.KORTYX_REDIS_URL,
  ttlMs: 15 * 60 * 1000,
  maxSessionCheckpoints: 50,
});
```

- stores pending requests, internal checkpoints, and session checkpoints in Redis
- supports resume after restart
- works better when you have more than one app instance
- uses the same Redis connection for all Kortyx runtime persistence key spaces
- applies TTL to Redis-backed runtime state

`maxSessionCheckpoints` controls how many user-facing session checkpoints are retained per session. The default is `50`.

## Default env-based selection

This is the default behavior used by `createAgent(...)` when you do not pass `frameworkAdapter`.

```ts
import { createFrameworkAdapterFromEnv } from "kortyx";

const frameworkAdapter = createFrameworkAdapterFromEnv();
```

```js
import { createFrameworkAdapterFromEnv } from "kortyx";

const frameworkAdapter = createFrameworkAdapterFromEnv();
```

Resolution:

- PostgreSQL if `KORTYX_POSTGRES_URL` exists (explicit schema setup required)
- otherwise Redis if any of these exist: `KORTYX_REDIS_URL`, `REDIS_URL`, `KORTYX_FRAMEWORK_REDIS_URL`
- otherwise in-memory

TTL env variables:

- `KORTYX_FRAMEWORK_TTL_MS`
- `KORTYX_TTL_MS`

## Practical recommendation

- start with the default in local dev
- use Redis in production if you rely on interrupt/resume, rollback, fork, or regenerate
- lower `maxSessionCheckpoints` for high-volume apps when users do not need deep rollback history
- do not use this adapter as a replacement for your app database

## What to read next

Go back to [Runtime Persistence](./01-persistence.md) if you want the high-level distinction between Kortyx runtime state and your app's business data.

## PostgreSQL durable history

For month-long runtime history, use the PostgreSQL adapter. PostgreSQL is the source of truth; Redis optionally caches checkpoint payloads. The runtime schema is separate from your business tables and Studio telemetry.

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
  // Optional:
  redis: { url: process.env.REDIS_URL!, ttlMs: 15 * 60 * 1000 },
});

// Deployment command, before serving requests:
await persistence.maintenance.setup();

const agent = createAgent({ workflows, frameworkAdapter: persistence });

// Application-owned scheduled job or worker:
const result = await persistence.maintenance.prune({ batchSize: 500 });
```

`maintenance.prune()` is a server-side library method. Your app schedules it; Kortyx determines what is safe to delete. No cleanup timer or HTTP endpoint is installed automatically. If your scheduler calls an HTTP endpoint, create and authorize that endpoint in your app.

| Setting | Default | Meaning |
| --- | --- | --- |
| `retention.checkpointHistoryDays` | 30 | Rolling history window, with no 50-checkpoint cap |
| `retention.inactiveSessionDays` | 30 | Session inactivity window |
| `ttlMs` | 15 minutes | Independent interrupt/approval lifetime |
| `redis.ttlMs` | 15 minutes | Cache lifetime; a miss reloads from PostgreSQL |
| `redis.timeoutMs` | 25 milliseconds | Maximum wait for a cache operation; configurable up to 1000 ms |

The current head of a retained session, unexpired pauses, and executing runs are protected. Reads enforce expiry before physical cleanup. Session expiry ends access to its history; choose a session window at least as long as the history window if you want the full history available after inactivity. Browsing history does not extend session lifetime. Rollback retains abandoned branches, which checkpoint summaries identify through `branchStatus`.

Cleanup removes at most `batchSize` parent records per table (maximum 1000), with graph writes deleted with their owning checkpoint. Inspect `result.deleted`, `result.skipped`, and `result.hasMore` to monitor or repeat the job. Calls are transactional and retry-safe. Call `await persistence.close()` on host shutdown after executions finish.

Env-based selection uses PostgreSQL when `KORTYX_POSTGRES_URL` exists, optionally caching through the configured Redis URL. It does not use the application's `DATABASE_URL`. Complete explicit setup before traffic:

```ts
const persistence = createFrameworkAdapterFromEnv();
if (persistence.kind === "postgres") {
  await persistence.maintenance.setup();
}
```

Durable storage supports resume, rollback, and fork. Continue with compatible workflow code and state contracts. Exact reproduction across code/model/tool changes requires additional versioned artifacts and side-effect idempotency; storage alone cannot provide it.

Switching an existing application from Redis persistence to PostgreSQL starts a separate runtime store; existing Redis checkpoints and approval tokens are not automatically migrated. Plan the transition so outstanding approvals can finish on the original adapter. PostgreSQL is required even for Redis cache hits, because it validates visibility and revisions. Reuse an adapter per application process to reuse its database connection pool.

Approval consumption is atomic across workers, but a worker crash after consumption does not automatically retry the resume. External actions, such as payments or API writes, still need application-owned idempotency. Retention cleanup deletes Kortyx runtime records for the configured namespace; it does not undo those external actions or delete your business records.

PostgreSQL durability adds database round trips; it does not promise zero added response latency. Tokens stream while the engine saves graph checkpoints asynchronously, and cache population does not delay authoritative reads. Session restoration, execution lease acquisition, and durable pause publication still require acknowledgements. Cache lookups have the configured time budget, and a Redis failure bypasses the cache for five seconds. Maintenance runs through your scheduled job. Measure time to first token and execution completion against Redis using your actual database location, workload, and concurrency.
