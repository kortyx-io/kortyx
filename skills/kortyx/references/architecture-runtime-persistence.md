# Runtime Persistence

Separate three storage concerns.

## Kortyx Runtime Persistence

Stores short-lived execution state:

- pending interrupts
- paused-run checkpoints
- user-facing session checkpoints for rollback, fork, regenerate, and undo
- short-lived runtime state

Use in-memory for local demos. Use Redis in production if interrupt/resume or checkpoint rollback/fork must survive restarts, deploys, or multiple app instances.

By default, `createAgent(...)` uses env-based runtime persistence selection.

```ts
import { createAgent } from "kortyx";

export const agent = createAgent({
  workflows: [workflow],
  defaultWorkflowId: "general-chat",
});
```

Default env selection:

- Redis if `KORTYX_REDIS_URL`, `REDIS_URL`, or `KORTYX_FRAMEWORK_REDIS_URL` exists.
- Otherwise in-memory.
- TTL can be set with `KORTYX_FRAMEWORK_TTL_MS` or `KORTYX_TTL_MS`.

Use explicit Redis config when the app should own the setting in code:

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

User-facing session checkpoint retention defaults to the last 50 checkpoints per session.

Use `maxSessionCheckpoints` to lower or raise that cap. Lower values reduce storage cost but shorten rollback history.

Redis-backed persistence applies TTL to Kortyx runtime state and shares state across app instances. The same Redis connection handles pending interrupts, internal graph checkpoints, and user-facing session checkpoints.

In-memory persistence has no cross-process sharing and no restart safety. It caps session checkpoints by count per session, but does not have a global session checkpoint memory cap or TTL. Do not recommend it for hundreds of users or long-lived production sessions.

## Decision Rules

- No interrupts/resume and no paused runs: default local behavior is usually enough.
- Interrupt/resume in production: use Redis.
- Rollback/fork/regenerate in production: use Redis.
- Multiple server instances: use Redis.
- Need visible conversation history or audit records: use the app database.
- Need longer pause windows: set TTL intentionally and make the UX handle expiry.
