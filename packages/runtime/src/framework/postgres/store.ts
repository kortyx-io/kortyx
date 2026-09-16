import { createHash } from "node:crypto";
import { KortyxError, PersistenceError } from "@kortyx/core/errors";
import postgres from "postgres";
import type { RedisFrameworkStore } from "../redis/redis-store";

export type RuntimeSql = postgres.Sql | postgres.TransactionSql;

export type RuntimeRetentionPolicy = {
  /** Rolling history window. The current head and live runs are protected. Default: 30. */
  checkpointHistoryDays?: number;
  /** Inactivity window for a session. Unexpired interrupts and live runs protect it. Default: 30. */
  inactiveSessionDays?: number;
};

export const positiveInteger = (name: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`${name} must be a positive safe integer.`);
  return value;
};

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kortyx_runtime_migrations (version integer PRIMARY KEY);
CREATE TABLE IF NOT EXISTS kortyx_runtime_sessions (
  scope text NOT NULL, id text NOT NULL, head_id text,
  last_activity bigint NOT NULL, next_turn bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, id)
);
CREATE INDEX IF NOT EXISTS kortyx_runtime_sessions_activity
  ON kortyx_runtime_sessions (scope, last_activity);
CREATE TABLE IF NOT EXISTS kortyx_runtime_runs (
  scope text NOT NULL, id text NOT NULL, session_id text,
  last_activity bigint NOT NULL, revision bigint NOT NULL DEFAULT 0,
  lease_token text, lease_until bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, id)
);
CREATE INDEX IF NOT EXISTS kortyx_runtime_runs_activity
  ON kortyx_runtime_runs (scope, last_activity);
CREATE INDEX IF NOT EXISTS kortyx_runtime_runs_session
  ON kortyx_runtime_runs (scope, session_id);
CREATE TABLE IF NOT EXISTS kortyx_runtime_graph_checkpoints (
  scope text NOT NULL, run_id text NOT NULL, ns text NOT NULL, id text NOT NULL,
  position bigserial NOT NULL, record jsonb NOT NULL,
  PRIMARY KEY (scope, run_id, ns, id),
  FOREIGN KEY (scope, run_id) REFERENCES kortyx_runtime_runs (scope, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS kortyx_runtime_graph_latest
  ON kortyx_runtime_graph_checkpoints (scope, run_id, ns, position DESC);
CREATE TABLE IF NOT EXISTS kortyx_runtime_graph_writes (
  scope text NOT NULL, run_id text NOT NULL, ns text NOT NULL, checkpoint_id text NOT NULL,
  task_id text NOT NULL, idx integer NOT NULL, channel text NOT NULL, value jsonb NOT NULL,
  PRIMARY KEY (scope, run_id, ns, checkpoint_id, task_id, idx),
  FOREIGN KEY (scope, run_id, ns, checkpoint_id)
    REFERENCES kortyx_runtime_graph_checkpoints (scope, run_id, ns, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS kortyx_runtime_session_checkpoints (
  scope text NOT NULL, id text NOT NULL, session_id text NOT NULL, run_id text NOT NULL,
  created_at bigint NOT NULL, turn_index bigint NOT NULL, active boolean NOT NULL DEFAULT true,
  record jsonb NOT NULL,
  PRIMARY KEY (scope, id),
  FOREIGN KEY (scope, session_id) REFERENCES kortyx_runtime_sessions (scope, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS kortyx_runtime_session_history
  ON kortyx_runtime_session_checkpoints (scope, session_id, turn_index);
CREATE INDEX IF NOT EXISTS kortyx_runtime_session_runs
  ON kortyx_runtime_session_checkpoints (scope, run_id);
CREATE INDEX IF NOT EXISTS kortyx_runtime_checkpoint_age
  ON kortyx_runtime_session_checkpoints (scope, created_at);
CREATE TABLE IF NOT EXISTS kortyx_runtime_pending_requests (
  scope text NOT NULL, token text NOT NULL, run_id text NOT NULL, session_id text,
  expires_at bigint NOT NULL, record jsonb NOT NULL,
  PRIMARY KEY (scope, token)
);
CREATE INDEX IF NOT EXISTS kortyx_runtime_pending_expiry
  ON kortyx_runtime_pending_requests (scope, expires_at);
CREATE INDEX IF NOT EXISTS kortyx_runtime_pending_runs
  ON kortyx_runtime_pending_requests (scope, run_id);
CREATE INDEX IF NOT EXISTS kortyx_runtime_pending_sessions
  ON kortyx_runtime_pending_requests (scope, session_id);
INSERT INTO kortyx_runtime_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
`;

/** Internal relational storage. Redis never controls visibility or token consumption. */
export class PostgresRuntimeStore {
  readonly sql: postgres.Sql;
  readonly scope: string;
  readonly historyMs: number;
  readonly sessionMs: number;
  readonly cacheEnabled: boolean;
  private readonly cachePrefix: string;
  private cacheRetryAfter = 0;
  private cacheClosed = false;
  private readonly cachePopulations = new Map<string, Promise<void>>();

  constructor(
    connectionString: string,
    namespace: string,
    retention: RuntimeRetentionPolicy,
    private readonly cache?: Pick<RedisFrameworkStore, "get" | "set" | "close">,
    private readonly cacheTtlMs = 15 * 60 * 1000,
    private readonly cacheTimeoutMs = 25,
  ) {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol))
      throw new TypeError("connectionString must be a PostgreSQL URL.");
    if (!namespace) throw new TypeError("namespace must not be empty.");
    this.scope = namespace;
    this.historyMs =
      positiveInteger(
        "checkpointHistoryDays",
        retention.checkpointHistoryDays ?? 30,
      ) * 86_400_000;
    this.sessionMs =
      positiveInteger(
        "inactiveSessionDays",
        retention.inactiveSessionDays ?? 30,
      ) * 86_400_000;
    positiveInteger("checkpoint history duration", this.historyMs);
    positiveInteger("session retention duration", this.sessionMs);
    positiveInteger("cache ttlMs", cacheTtlMs);
    positiveInteger("cache timeoutMs", cacheTimeoutMs);
    if (cacheTimeoutMs > 1000)
      throw new TypeError("cache timeoutMs must not exceed 1000.");
    this.cacheEnabled = Boolean(cache);
    this.sql = postgres(connectionString, {
      max: 10,
      connect_timeout: 5,
      onnotice: () => {},
    });
    this.cachePrefix = createHash("sha256")
      .update(`${connectionString}\0${namespace}`)
      .digest("hex");
  }

  async setup(): Promise<void> {
    await this.query(
      this.sql.begin(async (sql) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended('kortyx:runtime:schema', 0))`;
        await sql.unsafe(SCHEMA);
        const versions =
          await sql`SELECT version FROM kortyx_runtime_migrations WHERE version > 1`;
        if (versions.length)
          throw new PersistenceError(
            "The runtime schema is newer than this SDK supports.",
          );
      }),
    );
  }

  async query<T>(query: PromiseLike<T>): Promise<T> {
    try {
      return await query;
    } catch (cause) {
      if (cause instanceof KortyxError) throw cause;
      throw new PersistenceError("PostgreSQL runtime operation failed.", cause);
    }
  }

  async transaction<T>(
    operation: (sql: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> {
    try {
      return (await this.sql.begin(async (sql) => {
        // Maintenance takes the exclusive counterpart. Ordinary mutations may run concurrently.
        await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`kortyx:runtime:${this.scope}`}, 0))`;
        return operation(sql);
      })) as T;
    } catch (cause) {
      if (cause instanceof KortyxError) throw cause;
      throw new PersistenceError("PostgreSQL runtime operation failed.", cause);
    }
  }

  liveSession(sql: RuntimeSql, now: number) {
    return sql`(s.last_activity > ${now - this.sessionMs}
      OR EXISTS (SELECT 1 FROM kortyx_runtime_pending_requests p
        WHERE p.scope = s.scope AND p.session_id = s.id AND p.expires_at > ${now})
      OR EXISTS (SELECT 1 FROM kortyx_runtime_runs r
        WHERE r.scope = s.scope AND r.session_id = s.id AND r.lease_until > ${now}))`;
  }

  liveCheckpoint(sql: RuntimeSql, now: number) {
    return sql`(c.created_at > ${now - this.historyMs} OR s.head_id = c.id
      OR EXISTS (SELECT 1 FROM kortyx_runtime_pending_requests p
        WHERE p.scope = c.scope AND p.run_id = c.run_id AND p.expires_at > ${now})
      OR EXISTS (SELECT 1 FROM kortyx_runtime_runs r
        WHERE r.scope = c.scope AND r.id = c.run_id AND r.lease_until > ${now}))`;
  }

  liveRun(sql: RuntimeSql, now: number) {
    return sql`(r.last_activity > ${now - this.historyMs} OR r.lease_until > ${now}
      OR EXISTS (SELECT 1 FROM kortyx_runtime_pending_requests p
        WHERE p.scope = r.scope AND p.run_id = r.id AND p.expires_at > ${now})
      OR EXISTS (SELECT 1 FROM kortyx_runtime_session_checkpoints c
        JOIN kortyx_runtime_sessions s ON s.scope = c.scope AND s.id = c.session_id
        WHERE c.scope = r.scope AND c.run_id = r.id
          AND ${this.liveSession(sql, now)} AND ${this.liveCheckpoint(sql, now)}))`;
  }

  async touchRun(sql: postgres.TransactionSql, runId: string): Promise<void> {
    await sql`INSERT INTO kortyx_runtime_runs (scope, id, last_activity)
      VALUES (${this.scope}, ${runId}, ${Date.now()})
      ON CONFLICT (scope, id) DO UPDATE SET last_activity = EXCLUDED.last_activity,
        revision = kortyx_runtime_runs.revision + 1`;
  }

  async touchSession(
    sql: postgres.TransactionSql,
    sessionId: string,
  ): Promise<void> {
    const updated =
      await sql`INSERT INTO kortyx_runtime_sessions AS s (scope, id, last_activity)
      VALUES (${this.scope}, ${sessionId}, ${Date.now()})
      ON CONFLICT (scope, id) DO UPDATE SET last_activity = EXCLUDED.last_activity
      WHERE ${this.liveSession(sql, Date.now())} RETURNING id`;
    if (!updated.length)
      throw new KortyxError(
        "SESSION_EXPIRED",
        "The runtime session has expired. Start a new session.",
        {
          category: "request",
          retryable: false,
          safeMessage: "This session has expired. Start a new session.",
        },
      );
  }

  async payload<T>(key: unknown[], load: () => Promise<T>): Promise<T> {
    const cacheKey = `${this.cachePrefix}:${createHash("sha256").update(JSON.stringify(key)).digest("hex")}`;
    const cache = this.cache;
    if (cache && !this.cacheClosed && Date.now() >= this.cacheRetryAfter) {
      try {
        const raw = await this.cacheCall(() => cache.get(cacheKey));
        if (raw) return JSON.parse(raw) as T;
      } catch {
        this.cacheRetryAfter = Date.now() + 5000;
        /* PostgreSQL remains available when Redis fails. */
      }
    }
    const value = await load();
    if (
      cache &&
      !this.cacheClosed &&
      Date.now() >= this.cacheRetryAfter &&
      value !== undefined &&
      value !== null &&
      !this.cachePopulations.has(cacheKey) &&
      this.cachePopulations.size < 10
    ) {
      // Payload cache writes never delay authoritative reads. Bound and deduplicate
      // work so a slow cache cannot create an unbounded background queue.
      const population = this.cacheCall(() =>
        cache.set(cacheKey, JSON.stringify(value), this.cacheTtlMs),
      )
        .then(() => {})
        .catch(() => {
          this.cacheRetryAfter = Date.now() + 5000;
        })
        .finally(() => {
          this.cachePopulations.delete(cacheKey);
        });
      this.cachePopulations.set(cacheKey, population);
    }
    return value;
  }

  private async cacheCall<T>(operation: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            void this.cache?.close?.().catch(() => {});
            reject(new Error("Runtime cache operation timed out."));
          }, this.cacheTimeoutMs);
          timer.unref();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async close(): Promise<void> {
    this.cacheClosed = true;
    try {
      await Promise.all(this.cachePopulations.values());
      await this.cache?.close?.();
    } finally {
      await this.sql.end({ timeout: 5 });
    }
  }
}
