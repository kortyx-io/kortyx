import { randomUUID } from "node:crypto";
import { PersistenceError } from "@kortyx/core/errors";
import type { FrameworkAdapter } from "../adapter";
import { createRedisFrameworkStore } from "../redis/redis-store";
import { PostgresCheckpointSaver } from "./checkpointer";
import {
  createRuntimeMaintenance,
  type RuntimeMaintenance,
} from "./maintenance";
import { createPostgresPendingRequestStore } from "./pending-request-store";
import { createPostgresSessionCheckpointStore } from "./session-checkpoint-store";
import {
  PostgresRuntimeStore,
  positiveInteger,
  type RuntimeRetentionPolicy,
} from "./store";

export type CreatePostgresFrameworkAdapterOptions = {
  connectionString: string;
  /** Isolates applications sharing the runtime tables. Default: "default". */
  namespace?: string;
  /** Interrupt lifetime, independent of checkpoint retention. Default: 15 minutes. */
  ttlMs?: number;
  retention?: RuntimeRetentionPolicy;
  /** Optional payload cache. All writes and token consumption remain authoritative in PostgreSQL. */
  redis?: {
    url: string;
    ttlMs?: number;
    /** Maximum cache operation wait; default: 25 ms, maximum: 1000 ms. */
    timeoutMs?: number;
  };
};

export type PostgresFrameworkAdapter = FrameworkAdapter & {
  kind: "postgres";
  checkpointer: PostgresCheckpointSaver;
  maintenance: RuntimeMaintenance;
  /** Closes owned connections. Call after in-flight executions have completed. */
  close: () => Promise<void>;
};

export function createPostgresFrameworkAdapter(
  options: CreatePostgresFrameworkAdapterOptions,
): PostgresFrameworkAdapter {
  const ttlMs = positiveInteger("ttlMs", options.ttlMs ?? 15 * 60 * 1000);
  const cacheTtlMs = positiveInteger(
    "redis ttlMs",
    options.redis?.ttlMs ?? 15 * 60 * 1000,
  );
  const cache = options.redis
    ? createRedisFrameworkStore({
        url: options.redis.url,
        prefix: "kortyx:pg-cache:",
      })
    : undefined;
  const store = new PostgresRuntimeStore(
    options.connectionString,
    options.namespace ?? "default",
    options.retention ?? {},
    cache,
    cacheTtlMs,
    options.redis?.timeoutMs,
  );
  const saver = new PostgresCheckpointSaver(store);
  return {
    kind: "postgres",
    ttlMs,
    checkpointer: saver,
    pendingRequests: createPostgresPendingRequestStore(store),
    sessionCheckpoints: createPostgresSessionCheckpointStore(store, saver),
    maintenance: createRuntimeMaintenance(store),
    // Completed runs remain available until maintenance applies retention.
    cleanupRun: async (runId) =>
      store.transaction((sql) => store.touchRun(sql, runId)),
    acquireRunLease: async ({ runId, sessionId, onLost }) => {
      const token = randomUUID();
      const renew = async () => {
        await store.transaction(async (sql) => {
          if (sessionId) await store.touchSession(sql, sessionId);
          const rows =
            await sql`UPDATE kortyx_runtime_runs SET lease_until = ${Date.now() + 120_000}, last_activity = ${Date.now()}
            WHERE scope = ${store.scope} AND id = ${runId} AND lease_token = ${token}
              AND lease_until > ${Date.now()} RETURNING id`;
          if (!rows.length)
            throw new PersistenceError("The runtime execution lease was lost.");
        });
      };
      await store.transaction(async (sql) => {
        if (sessionId) await store.touchSession(sql, sessionId);
        const rows =
          await sql`INSERT INTO kortyx_runtime_runs AS r (scope, id, last_activity, lease_token, lease_until, session_id)
          VALUES (${store.scope}, ${runId}, ${Date.now()}, ${token}, ${Date.now() + 120_000}, ${sessionId ?? null})
          ON CONFLICT (scope, id) DO UPDATE SET last_activity = EXCLUDED.last_activity,
            revision = r.revision + 1, lease_token = EXCLUDED.lease_token,
            lease_until = EXCLUDED.lease_until, session_id = EXCLUDED.session_id
          WHERE r.lease_until <= ${Date.now()} RETURNING id`;
        if (!rows.length)
          throw new PersistenceError("This runtime run is already executing.");
      });
      let renewing: Promise<void> | undefined;
      let stopped = false;
      let deadline: NodeJS.Timeout;
      const lost = (cause: unknown) => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        clearTimeout(deadline);
        onLost(cause);
      };
      const armDeadline = () => {
        clearTimeout(deadline);
        // Abort before the database lease expires, including when a renewal is hung on I/O.
        deadline = setTimeout(
          () =>
            lost(new PersistenceError("Execution lease renewal timed out.")),
          90_000,
        );
        deadline.unref();
      };
      const timer = setInterval(() => {
        if (stopped || renewing) return;
        renewing = renew()
          .then(() => {
            if (!stopped) armDeadline();
          })
          .catch(lost)
          .finally(() => {
            renewing = undefined;
          });
      }, 30_000);
      timer.unref();
      armDeadline();
      return async () => {
        stopped = true;
        clearInterval(timer);
        clearTimeout(deadline);
        await renewing;
        await store.transaction(async (sql) => {
          await sql`UPDATE kortyx_runtime_runs SET lease_token = NULL, lease_until = 0, last_activity = ${Date.now()}
            WHERE scope = ${store.scope} AND id = ${runId} AND lease_token = ${token}`;
        });
      };
    },
    close: () => store.close(),
  };
}
