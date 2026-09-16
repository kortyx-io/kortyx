# @kortyx/runtime

[![npm version](https://img.shields.io/npm/v/@kortyx/runtime.svg)](https://www.npmjs.com/package/@kortyx/runtime)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/runtime.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Graph execution, node registries, workflow registries, framework adapters, and runtime persistence for Kortyx.

Most application code should import these APIs from `kortyx`. Use `@kortyx/runtime` directly when you are wiring custom infrastructure or framework adapters.

## Install

```bash
pnpm add @kortyx/runtime
```

```bash
npm install @kortyx/runtime
```

## Key APIs

- `createInMemoryWorkflowRegistry(...)`
- `createFileWorkflowRegistry(...)`
- `registerNode(...)`
- `getRegisteredNode(...)`
- `createInMemoryFrameworkAdapter(...)`
- `createRedisFrameworkAdapter(...)`
- `createPostgresFrameworkAdapter(...)`
- `createFrameworkAdapterFromEnv(...)`

## Persistence

Runtime persistence stores framework execution state such as pending interrupts and resume tokens. Business data should remain owned by your application.

```ts
import { createRedisFrameworkAdapter } from "@kortyx/runtime";

export const framework = createRedisFrameworkAdapter({
  url: process.env.KORTYX_REDIS_URL,
});
```

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Runtime persistence](https://kortyx.io/docs/production/persistence)
- [Framework adapters](https://kortyx.io/docs/production/framework-adapters)
- [Node resolution](https://kortyx.io/docs/reference/node-resolution)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).

## PostgreSQL and retention

Use `createPostgresFrameworkAdapter` for durable runtime history. PostgreSQL is authoritative. Optionally attach a Redis adapter as a checkpoint payload cache with `createCachingFrameworkAdapter({ storage, cache })`.

```ts
import {
  createPostgresFrameworkAdapter,
  createRedisFrameworkAdapter,
  createCachingFrameworkAdapter,
} from "kortyx";

const storage = createPostgresFrameworkAdapter({
  connectionString: process.env.KORTYX_POSTGRES_URL!,
  namespace: "my-app",
  ttlMs: 7 * 24 * 60 * 60 * 1000, // Approval lifetime, independent of history.
  retention: { checkpointHistoryDays: 30, inactiveSessionDays: 30 },
});

// Optional Redis payload caching; omit the helper to use storage alone.
const cache = createRedisFrameworkAdapter({
  url: process.env.REDIS_URL!,
  ttlMs: 15 * 60 * 1000,
});
const persistence = createCachingFrameworkAdapter({ storage, cache, timeoutMs: 25 });

// Run during deployment before serving requests.
await persistence.maintenance.setup();

// Pass persistence as createAgent({ workflows, frameworkAdapter: persistence }).
// Your scheduled job/worker performs storage maintenance:
const result = await persistence.maintenance.prune({ batchSize: 500 });

// After in-flight executions finish, close owned connections on shutdown.
await persistence.close();
```

History and inactive sessions default to 30 days, without a 50-checkpoint cap. Interrupts default to 15 minutes; set `ttlMs` explicitly for longer pauses. Current session heads, unexpired pauses, and executing runs are protected. Rollback preserves abandoned branches until retention expires. Reads enforce expiry even before cleanup runs. The app owns scheduling; Kortyx owns safe, bounded pruning.

`KORTYX_POSTGRES_URL` takes precedence over Redis during env-based selection, with Redis used as a cache when configured. `DATABASE_URL` is not used implicitly. Call `maintenance.setup()` before traffic for every built-in adapter; PostgreSQL creates its schema, while Redis and memory need no schema. `maintenance.prune()` and `close()` are also available on every built-in adapter.

PostgreSQL setup applies the SDK's numbered SQL migrations in order, using the existing PostgreSQL client. Each migration commits its changes and version together under a schema lock; reruns skip applied versions. Failed migrations roll back and stop setup, while earlier successful migrations remain committed. Retries resume at the first unapplied version. Newer schemas and gaps in recorded history are rejected. Migrations run only through explicit setup, never in request handlers. Released migrations are immutable; future schema changes add a consecutive migration. Applied SQL is verified against a stored SHA-256 checksum; editing it causes setup to reject. Migration advisory and DDL lock waits are capped at five seconds, preserving stricter database settings; a timeout rolls back that migration and requires retry. This bounds lock acquisition, not migration execution time. The original version-only v1 ledger adopts the current v1 checksum once, without rerunning schema SQL; its prior contents cannot be verified retroactively. Use compatible additive changes during rolling deployments; no automatic down migrations or workflow-state conversions are provided.

Existing factories remain supported. Their shared `ManagedFrameworkAdapter` lifecycle contract requires implementations for every built-in backend; existing custom `FrameworkAdapter` implementations remain compatible. Redis prune reports zero explicit deletions because native TTL owns expiry. Memory prune removes expired approvals in bounded batches; its session history remains count-limited.

Configure the caching helper before traffic. It returns the exact storage adapter and preserves all current/future methods. Currently PostgreSQL storage with Redis caching is supported; unsupported combinations, repeated bindings, and sharing an already-owned cache are rejected. Cache `ttlMs` comes from the Redis adapter; approval `ttlMs` comes from PostgreSQL. The returned adapter owns both connections: close it after executions finish and do not independently use its cache input as another storage backend. Cache keys are separate from standalone Redis runtime keys. Data transfer between storage backends is outside this contract.

Run real-service integration coverage with `KORTYX_TEST_POSTGRES_URL=... KORTYX_TEST_REDIS_URL=... pnpm --filter @kortyx/runtime test:integration:postgres`. Use a disposable test database. Redis is optional for these tests.

Graph checkpoints are saved asynchronously while tokens stream; cache fills do not block authoritative reads. Cache operations default to a 25 ms budget, and cache failures bypass Redis for five seconds. Required PostgreSQL reads and durable acknowledgements still add latency. After building the SDK, compare persistence overhead using an immediate mock model with `KORTYX_TEST_POSTGRES_URL=... KORTYX_TEST_REDIS_URL=... node scripts/benchmark-runtime-persistence.cjs` from the repository root. The benchmark reports generation start, first token, and execution completion at p50/p95; use disposable services and measure production network conditions separately.
