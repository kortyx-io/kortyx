import { randomUUID } from "node:crypto";
import { KortyxError, PersistenceError } from "@kortyx/core/errors";
import type postgres from "postgres";
import { captureGraphSnapshot } from "../graph-snapshot";
import type { PendingRequestRecord } from "../pending-requests";
import type {
  CheckpointSummary,
  SessionCheckpointRecord,
  SessionCheckpointStore,
} from "../session-checkpoints";
import type { PostgresCheckpointSaver } from "./checkpointer";
import { savePendingRequest } from "./pending-request-store";
import { clone, type PostgresRuntimeStore, type RuntimeSql } from "./store";

const unique = (values: Array<string | undefined>): string[] => [
  ...new Set(values.filter((value): value is string => Boolean(value))),
];
const notFound = (id: string) =>
  new KortyxError(
    "NOT_FOUND",
    `Checkpoint "${id}" was not found or has expired.`,
    {
      category: "request",
      retryable: false,
      safeMessage: "The requested checkpoint was not found or has expired.",
    },
  );
const assertInterruptsLive = (requests: PendingRequestRecord[]): void => {
  if (
    requests.some((request) => request.createdAt + request.ttlMs <= Date.now())
  )
    throw new KortyxError(
      "INTERRUPT_EXPIRED",
      "The checkpoint contains an expired interrupt.",
      {
        category: "request",
        retryable: false,
        safeMessage: "This checkpoint's approval or input request has expired.",
      },
    );
};

export function createPostgresSessionCheckpointStore(
  store: PostgresRuntimeStore,
  saver: PostgresCheckpointSaver,
): SessionCheckpointStore {
  const visible = (sql: RuntimeSql, now: number) => sql`c.scope = ${store.scope}
    AND ${store.liveSession(sql, now)} AND ${store.liveCheckpoint(sql, now)}`;
  const get = async (id: string): Promise<SessionCheckpointRecord | null> => {
    const { sql } = store;
    const rows =
      await store.query(sql`SELECT c.id, c.active FROM kortyx_runtime_session_checkpoints c
      JOIN kortyx_runtime_sessions s ON s.scope = c.scope AND s.id = c.session_id
      WHERE c.id = ${id} AND ${visible(sql, Date.now())}`);
    if (!rows[0]) return null;
    const record = await store.payload(["session", id], async () => {
      const records =
        await store.query(sql`SELECT record FROM kortyx_runtime_session_checkpoints
        WHERE scope = ${store.scope} AND id = ${id}`);
      return records[0] ? (records[0].record as SessionCheckpointRecord) : null;
    });
    return record
      ? { ...record, branchStatus: rows[0].active ? "active" : "abandoned" }
      : null;
  };

  const sealRequests = async (
    requests: PendingRequestRecord[],
  ): Promise<PendingRequestRecord[]> => {
    return Promise.all(
      requests.map(async (request) => {
        if (request.graphSnapshot) return clone(request);
        const graphSnapshot = await captureGraphSnapshot(
          saver,
          request.runId,
          request.graphCheckpointId,
        );
        if (!graphSnapshot)
          throw new KortyxError(
            "CHECKPOINT_INCOMPLETE",
            "A paused checkpoint needs a complete execution snapshot.",
            {
              category: "persistence",
              retryable: false,
              safeMessage:
                "The paused execution could not be saved completely.",
            },
          );
        return { ...clone(request), graphSnapshot };
      }),
    );
  };

  const insert = async (
    sql: postgres.TransactionSql,
    record: SessionCheckpointRecord,
  ): Promise<void> => {
    await store.query(sql`INSERT INTO kortyx_runtime_session_checkpoints (scope, id, session_id, run_id, created_at, turn_index, record)
      VALUES (${store.scope}, ${record.id}, ${record.sessionId}, ${record.runId}, ${record.createdAt}, ${record.turnIndex},
        ${sql.json(clone(record) as unknown as postgres.JSONValue)})`);
    await store.query(sql`UPDATE kortyx_runtime_sessions SET head_id = ${record.id}, next_turn = ${record.turnIndex + 1}
      WHERE scope = ${store.scope} AND id = ${record.sessionId}`);
  };

  return {
    get,
    async list(sessionId) {
      const { sql } = store;
      const rows =
        await store.query(sql`SELECT c.record, c.active FROM kortyx_runtime_session_checkpoints c
        JOIN kortyx_runtime_sessions s ON s.scope = c.scope AND s.id = c.session_id
        WHERE c.session_id = ${sessionId} AND ${visible(sql, Date.now())} ORDER BY c.turn_index`);
      return rows.map((row) => {
        const {
          state: _state,
          effects: _effects,
          activePendingRequests: _pending,
          runId: _runId,
          graphCheckpointId: _graphId,
          ...summary
        } = row.record as SessionCheckpointRecord;
        return {
          ...summary,
          branchStatus: row.active ? "active" : "abandoned",
        } as CheckpointSummary;
      });
    },
    async getHead(sessionId) {
      const rows =
        await store.query(store.sql`SELECT head_id FROM kortyx_runtime_sessions s
        WHERE scope = ${store.scope} AND id = ${sessionId} AND ${store.liveSession(store.sql, Date.now())}`);
      return rows[0]?.head_id ? get(rows[0].head_id) : null;
    },
    async append(args) {
      const requests = await sealRequests(args.pendingRequests ?? []);
      return store.transaction(async (sql) => {
        await store.touchSession(sql, args.sessionId);
        const sessions =
          await sql`SELECT head_id, next_turn FROM kortyx_runtime_sessions
          WHERE scope = ${store.scope} AND id = ${args.sessionId} FOR UPDATE`;
        const session = sessions[0];
        if (!session)
          throw new PersistenceError(
            "The session disappeared during checkpoint append.",
          );
        const record: SessionCheckpointRecord = {
          id: `cp-${randomUUID()}`,
          sessionId: args.sessionId,
          runId: args.runId,
          turnIndex: Number(session.next_turn),
          createdAt: Date.now(),
          workflow: args.workflow,
          state: clone(args.state),
          nodes: unique(args.nodes ?? []),
          effects: {
            structuredStreamIds: unique(args.structuredStreamIds ?? []),
            interruptTokens: unique(requests.map((request) => request.token)),
          },
          activePendingRequests: requests,
          ...(session.head_id ? { parentCheckpointId: session.head_id } : {}),
          ...(args.graphCheckpointId
            ? { graphCheckpointId: args.graphCheckpointId }
            : {}),
          ...(args.label ? { label: args.label } : {}),
          ...(args.workflowVersion
            ? { workflowVersion: args.workflowVersion }
            : {}),
          ...(args.buildId ? { buildId: args.buildId } : {}),
        };
        await insert(sql, record);
        return record;
      });
    },
    async rollbackTo(id) {
      return store.transaction(async (sql) => {
        const targets =
          await sql`SELECT c.record FROM kortyx_runtime_session_checkpoints c
          JOIN kortyx_runtime_sessions s ON s.scope = c.scope AND s.id = c.session_id
          WHERE c.id = ${id} AND ${visible(sql, Date.now())} FOR UPDATE OF s`;
        if (!targets[0]) throw notFound(id);
        const target = targets[0].record as SessionCheckpointRecord;
        assertInterruptsLive(target.activePendingRequests);
        const liveRuns = await sql`SELECT id FROM kortyx_runtime_runs
          WHERE scope = ${store.scope} AND session_id = ${target.sessionId} AND lease_until > ${Date.now()}`;
        if (liveRuns.length)
          throw new KortyxError(
            "SESSION_BUSY",
            "Cannot roll back a session while execution is active.",
            { category: "request", retryable: true },
          );
        const ancestry = await sql`WITH RECURSIVE ancestors(id) AS (
          SELECT ${id}::text UNION
          SELECT c.record->>'parentCheckpointId' FROM kortyx_runtime_session_checkpoints c
            JOIN ancestors a ON a.id = c.id WHERE c.scope = ${store.scope} AND c.record ? 'parentCheckpointId'
        ) SELECT id FROM ancestors`;
        const ancestorIds = ancestry.map((row) => row.id as string);
        const trailing =
          await sql`SELECT record FROM kortyx_runtime_session_checkpoints
          WHERE scope = ${store.scope} AND session_id = ${target.sessionId} AND active AND id NOT IN ${sql(ancestorIds)}`;
        const records = trailing.map(
          (row) => row.record as SessionCheckpointRecord,
        );
        const streams = unique(
          records.flatMap((record) => record.effects.structuredStreamIds),
        );
        const tokens = unique(
          records.flatMap((record) => [
            ...record.effects.interruptTokens,
            ...record.activePendingRequests.map((request) => request.token),
          ]),
        );
        await sql`UPDATE kortyx_runtime_session_checkpoints SET active = (id IN ${sql(ancestorIds)})
          WHERE scope = ${store.scope} AND session_id = ${target.sessionId}`;
        await store.touchSession(sql, target.sessionId);
        await sql`UPDATE kortyx_runtime_sessions SET head_id = ${id} WHERE scope = ${store.scope} AND id = ${target.sessionId}`;
        if (tokens.length)
          await sql`DELETE FROM kortyx_runtime_pending_requests WHERE scope = ${store.scope} AND token IN ${sql(tokens)}`;
        for (const request of target.activePendingRequests)
          await savePendingRequest(store, sql, request);
        return {
          sessionId: target.sessionId,
          head: id,
          invalidatedStructuredStreamIds: streams,
          invalidatedInterruptTokens: tokens,
          activePendingRequests: clone(target.activePendingRequests),
        };
      });
    },
    async fork(id, options) {
      const source = await get(id);
      if (!source) throw notFound(id);
      assertInterruptsLive(source.activePendingRequests);
      const sessionId = options?.newSessionId || `session-${randomUUID()}`;
      const runId = source.activePendingRequests.length
        ? `run-${randomUUID()}`
        : source.runId;
      const {
        parentCheckpointId: _parent,
        branchStatus: _branch,
        ...sourceRecord
      } = source;
      const checkpoint: SessionCheckpointRecord = {
        ...clone(sourceRecord),
        id: `cp-${randomUUID()}`,
        sessionId,
        runId,
        createdAt: Date.now(),
        parentSessionId: source.sessionId,
        forkedFrom: source.id,
        activePendingRequests: source.activePendingRequests.map((request) => ({
          ...clone(request),
          runId,
          sessionId,
          token: randomUUID(),
          requestId: `human-${randomUUID()}`,
        })),
      };
      checkpoint.effects.interruptTokens = checkpoint.activePendingRequests.map(
        (request) => request.token,
      );
      // Resume restores this fork's complete snapshot into its own run. No parent storage is required.
      await store.transaction(async (sql) => {
        const existing =
          await sql`SELECT id FROM kortyx_runtime_sessions WHERE scope = ${store.scope} AND id = ${sessionId}`;
        if (existing.length)
          throw new KortyxError(
            "SESSION_EXISTS",
            "The fork session already exists.",
            { category: "request", retryable: false },
          );
        // INSERT, rather than UPSERT, also rejects concurrent attempts to fork to the same session.
        await sql`INSERT INTO kortyx_runtime_sessions (scope, id, last_activity) VALUES (${store.scope}, ${sessionId}, ${Date.now()})`;
        await insert(sql, checkpoint);
        for (const request of checkpoint.activePendingRequests)
          await savePendingRequest(store, sql, request);
      });
      return {
        sessionId,
        parentSessionId: source.sessionId,
        forkedFrom: source.id,
        checkpoint,
      };
    },
  };
}
