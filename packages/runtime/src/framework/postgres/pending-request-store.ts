import type postgres from "postgres";
import type {
  PendingRequestRecord,
  PendingRequestStore,
} from "../pending-requests";
import { clone, type PostgresRuntimeStore, positiveInteger } from "./store";

export async function savePendingRequest(
  store: PostgresRuntimeStore,
  sql: postgres.TransactionSql,
  record: PendingRequestRecord,
): Promise<void> {
  positiveInteger("interrupt ttlMs", record.ttlMs);
  const expiresAt = record.createdAt + record.ttlMs;
  if (
    !Number.isSafeInteger(record.createdAt) ||
    record.createdAt < 0 ||
    !Number.isSafeInteger(expiresAt)
  )
    throw new TypeError("Interrupt timestamps must be safe integers.");
  if (expiresAt <= Date.now()) {
    await store.query(
      sql`DELETE FROM kortyx_runtime_pending_requests WHERE scope = ${store.scope} AND token = ${record.token}`,
    );
    return;
  }
  if (record.sessionId) await store.touchSession(sql, record.sessionId);
  await store.touchRun(sql, record.runId);
  await store.query(sql`INSERT INTO kortyx_runtime_pending_requests (scope, token, run_id, session_id, expires_at, record)
    VALUES (${store.scope}, ${record.token}, ${record.runId}, ${record.sessionId ?? null}, ${expiresAt},
      ${sql.json(clone(record) as unknown as postgres.JSONValue)})
    ON CONFLICT (scope, token) DO UPDATE SET run_id = EXCLUDED.run_id, session_id = EXCLUDED.session_id,
      expires_at = EXCLUDED.expires_at, record = EXCLUDED.record`);
}

export function createPostgresPendingRequestStore(
  store: PostgresRuntimeStore,
): PendingRequestStore {
  return {
    async list() {
      const rows =
        await store.query(store.sql`SELECT record FROM kortyx_runtime_pending_requests
        WHERE scope = ${store.scope} AND expires_at > ${Date.now()} ORDER BY token`);
      return rows.map((row) => row.record as PendingRequestRecord);
    },
    async get(token) {
      const rows =
        await store.query(store.sql`SELECT record FROM kortyx_runtime_pending_requests
        WHERE scope = ${store.scope} AND token = ${token} AND expires_at > ${Date.now()}`);
      return rows[0] ? (rows[0].record as PendingRequestRecord) : null;
    },
    async take(token) {
      return store.transaction(async (sql) => {
        const rows = await sql`DELETE FROM kortyx_runtime_pending_requests
          WHERE scope = ${store.scope} AND token = ${token} RETURNING record, expires_at`;
        return rows[0] && Number(rows[0].expires_at) > Date.now()
          ? (rows[0].record as PendingRequestRecord)
          : null;
      });
    },
    async save(record) {
      await store.transaction((sql) => savePendingRequest(store, sql, record));
    },
    async delete(token) {
      await store.transaction(async (sql) => {
        await sql`DELETE FROM kortyx_runtime_pending_requests WHERE scope = ${store.scope} AND token = ${token}`;
      });
    },
    async update(token, patch) {
      await store.transaction(async (sql) => {
        // Match the session -> run -> pending lock order used by save/rollback.
        const found =
          await sql`SELECT run_id, session_id FROM kortyx_runtime_pending_requests
          WHERE scope = ${store.scope} AND token = ${token}`;
        if (!found[0]) return;
        if (found[0].session_id)
          await store.touchSession(sql, found[0].session_id);
        await store.touchRun(sql, found[0].run_id);
        const rows =
          await sql`SELECT record FROM kortyx_runtime_pending_requests
          WHERE scope = ${store.scope} AND token = ${token} AND expires_at > ${Date.now()} FOR UPDATE`;
        if (!rows[0]) return;
        const previous = rows[0].record as PendingRequestRecord;
        await savePendingRequest(store, sql, {
          ...previous,
          ...patch,
          token: previous.token,
          runId: previous.runId,
          sessionId: previous.sessionId,
          createdAt: previous.createdAt,
          ttlMs: previous.ttlMs,
        });
      });
    },
  };
}
