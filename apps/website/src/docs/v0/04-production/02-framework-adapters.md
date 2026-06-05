---
id: v0-runtime-framework-adapters
title: "Runtime Persistence Adapters"
description: "Choose and configure the backend Kortyx uses for interrupt/resume checkpoints."
keywords: [kortyx, runtime-persistence, framework-adapter, redis, ttl]
sidebar_label: "Runtime Adapters"
---
# Runtime Persistence Adapters

This page explains the backend Kortyx uses to store runtime state for paused runs.

In code, the API is named `frameworkAdapter`.

Read this page if:

- you use interrupts or resume
- you need paused runs to survive restarts
- you want to choose between in-memory and Redis

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

> **Good to know:** `createFrameworkAdapterFromEnv()` is not a third backend. It is the default helper that chooses between in-memory and Redis.

## Where this is used

Most apps do not need to pass `frameworkAdapter` manually.

If you do nothing, `createAgent(...)` falls back to `createFrameworkAdapterFromEnv()`.

That means:

- no Redis env var -> in-memory
- Redis env var present -> Redis

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

- Redis if any of these exist: `KORTYX_REDIS_URL`, `REDIS_URL`, `KORTYX_FRAMEWORK_REDIS_URL`
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
