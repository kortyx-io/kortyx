import {
  type PruneRuntimeResult,
  type RuntimeMaintenance,
  resolvePruneOptions,
} from "../maintenance";
import type { PostgresRuntimeStore } from "./store";

export function createRuntimeMaintenance(
  store: PostgresRuntimeStore,
): RuntimeMaintenance {
  return {
    setup: () => store.setup(),
    async prune(options = {}) {
      const { now, batchSize: batch } = resolvePruneOptions(options);
      return (await store.query(
        store.sql.begin(async (sql) => {
          const deleted = {
            pendingRequests: 0,
            sessionCheckpoints: 0,
            graphCheckpoints: 0,
            sessions: 0,
            runs: 0,
          };
          const locks =
            await sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`kortyx:runtime:${store.scope}`}, 0)) AS acquired`;
          if (!locks[0]?.acquired)
            return { skipped: true, hasMore: false, deleted };
          const pending =
            await sql`DELETE FROM kortyx_runtime_pending_requests WHERE (scope, token) IN (
          SELECT scope, token FROM kortyx_runtime_pending_requests
          WHERE scope = ${store.scope} AND expires_at <= ${now} ORDER BY expires_at LIMIT ${batch}
        ) RETURNING token`;
          deleted.pendingRequests = pending.length;
          const checkpoints =
            await sql`DELETE FROM kortyx_runtime_session_checkpoints WHERE (scope, id) IN (
          SELECT c.scope, c.id FROM kortyx_runtime_session_checkpoints c
          JOIN kortyx_runtime_sessions s ON s.scope = c.scope AND s.id = c.session_id
          WHERE c.scope = ${store.scope}
            AND (NOT ${store.liveSession(sql, now)} OR NOT ${store.liveCheckpoint(sql, now)})
          ORDER BY c.created_at LIMIT ${batch}
        ) RETURNING id`;
          deleted.sessionCheckpoints = checkpoints.length;
          // Remove large runs incrementally rather than cascading an entire run's history in one batch.
          const graph =
            await sql`DELETE FROM kortyx_runtime_graph_checkpoints WHERE (scope, run_id, ns, id) IN (
          SELECT g.scope, g.run_id, g.ns, g.id FROM kortyx_runtime_graph_checkpoints g
          JOIN kortyx_runtime_runs r ON r.scope = g.scope AND r.id = g.run_id
          WHERE g.scope = ${store.scope} AND NOT ${store.liveRun(sql, now)}
            AND NOT EXISTS (SELECT 1 FROM kortyx_runtime_session_checkpoints c WHERE c.scope = r.scope AND c.run_id = r.id)
          ORDER BY g.position LIMIT ${batch}
        ) RETURNING id`;
          deleted.graphCheckpoints = graph.length;
          const sessions =
            await sql`DELETE FROM kortyx_runtime_sessions WHERE (scope, id) IN (
          SELECT s.scope, s.id FROM kortyx_runtime_sessions s
          WHERE s.scope = ${store.scope} AND NOT ${store.liveSession(sql, now)}
            AND NOT EXISTS (SELECT 1 FROM kortyx_runtime_session_checkpoints c WHERE c.scope = s.scope AND c.session_id = s.id)
            AND NOT EXISTS (SELECT 1 FROM kortyx_runtime_pending_requests p WHERE p.scope = s.scope AND p.session_id = s.id)
          ORDER BY s.last_activity LIMIT ${batch}
        ) RETURNING id`;
          deleted.sessions = sessions.length;
          const runs =
            await sql`DELETE FROM kortyx_runtime_runs WHERE (scope, id) IN (
          SELECT r.scope, r.id FROM kortyx_runtime_runs r
          WHERE r.scope = ${store.scope} AND NOT ${store.liveRun(sql, now)}
            AND NOT EXISTS (SELECT 1 FROM kortyx_runtime_graph_checkpoints g WHERE g.scope = r.scope AND g.run_id = r.id)
            AND NOT EXISTS (SELECT 1 FROM kortyx_runtime_session_checkpoints c WHERE c.scope = r.scope AND c.run_id = r.id)
            AND NOT EXISTS (SELECT 1 FROM kortyx_runtime_pending_requests p WHERE p.scope = r.scope AND p.run_id = r.id)
          ORDER BY r.last_activity LIMIT ${batch}
        ) RETURNING id`;
          deleted.runs = runs.length;
          return {
            skipped: false,
            hasMore: Object.values(deleted).some((count) => count === batch),
            deleted,
          };
        }),
      )) as PruneRuntimeResult;
    },
  };
}
