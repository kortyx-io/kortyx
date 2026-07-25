# Studio live refresh

KTX-18 replaces fixed browser polling with project-scoped invalidations. The
stream tells Studio _what became stale_; server components remain responsible
for querying, filtering, sorting, pagination, authorization, and rendering.

## Commit-to-screen flow

1. Telemetry ingestion inserts previously unseen events and refreshes the
   affected Studio projections in one database transaction.
2. That transaction calls `pg_notify` once with a versioned, payload-free
   invalidation for `runs`, `sessions`, and/or `interrupts`.
3. Each API process owns one PostgreSQL `LISTEN` connection. It validates the
   message and fans it out only to subscribers for the authenticated
   organization and project.
4. `GET /v1/studio/changes` emits coalesced SSE `change` events. Slow consumers
   retain at most one merged pending invalidation.
5. The OSS Studio route handler proxies the stream with its server-only Studio
   API key. The browser connects to the same-origin route and never receives
   that key.
6. The shared live-refresh controller asks the Next router to refresh the
   current server-rendered route. Existing URL state preserves filters, sort,
   pagination, panels, drawers, and the table scroll restoration key.

The change contract contains only its schema version, change ID, timestamp,
organization ID, project ID, and affected resource names. Raw event payloads,
prompts, outputs, user IDs, and entity data never enter the notification bus.

## Client behavior

- Enabling Live performs an immediate synchronization, then connects SSE.
- Bursts are leading/trailing coalesced so only one refresh is active.
- Hidden or offline tabs close the stream and show `paused`.
- Focus, visibility, and network recovery reconnect and synchronize.
- An unhealthy stream reconnects after three seconds and enables randomized
  30–60 second fallback refreshes. Successful SSE connection disables polling.
- Manual refresh uses the same guarded refresh path.
- The Live button exposes `off`, `connecting`, `live`, `reconnecting`, and
  `paused` through accessible text and a theme-aware tooltip.

## Load model

The database cost is one dedicated listener per API process, not one listener
per browser. Browser connections terminate at the API tier (through the
temporary OSS Next bridge), and an ingestion transaction emits one small
notification per inserted batch rather than per event or row.

SSE removes the query amplification of a five-second timer. With fixed polling,
`users × open tabs ÷ interval` read requests arrive even when nothing changes.
With invalidations, idle users hold inexpensive connections and read traffic
occurs only after relevant commits.

Before a managed-cloud launch, measure and set:

- maximum SSE connections per API instance and graceful load shedding;
- proxy/load-balancer idle timeouts above the 15-second heartbeat;
- file-descriptor and memory limits;
- connection duration, reconnect rate, fan-out size, coalesced-change count,
  fallback polling, refresh latency, and dropped/invalid notification metrics.

## Replaceable bus boundary

`StudioChangeBus` isolates route subscribers from PostgreSQL transport.
`createPostgresStudioChangeBus` is appropriate for the initial single-region
deployment. A managed deployment can replace it with Redis, NATS, Kafka, or
another regional broker without changing the SSE route or Studio client.

The current Next proxy intentionally doubles long-lived connections for the OSS
auth boundary. Managed Cloud should terminate authenticated SSE directly at a
gateway/API edge and use a distributed bus when API replicas span processes,
hosts, or regions.

## Regression boundary

- Contract tests reject unexpected payload fields.
- Database integration coverage verifies post-commit notification and duplicate
  suppression.
- Bus and SSE tests verify one listener, malformed-message rejection,
  project isolation, resource filtering, headers, and delivery.
- Controller tests verify burst coalescing, degraded fallback, and
  hidden/offline pausing.
- Playwright ingests a real event and verifies that the filtered run list
  updates without manual refresh or URL-state loss.
