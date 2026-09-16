import { createHash } from "node:crypto";
import { KortyxError, PersistenceError } from "@kortyx/core/errors";
import postgres from "postgres";
import {
  type FrameworkPayloadCache,
  validateFrameworkCacheOptions,
} from "../caching";
import type { RedisFrameworkStore } from "../redis/redis-store";
import { runRuntimeMigrations } from "./migrations";

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

/** Internal relational storage. Redis never controls visibility or token consumption. */
export class PostgresRuntimeStore {
  readonly sql: postgres.Sql;
  readonly scope: string;
  readonly historyMs: number;
  readonly sessionMs: number;
  private readonly cachePrefix: string;
  private cacheRetryAfter = 0;
  private cacheClosed = false;
  private readonly cachePopulations = new Map<string, Promise<void>>();

  constructor(
    connectionString: string,
    namespace: string,
    retention: RuntimeRetentionPolicy,
    private cache?: Pick<RedisFrameworkStore, "get" | "set" | "close">,
    private cacheTtlMs = 15 * 60 * 1000,
    private cacheTimeoutMs = 25,
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
    validateFrameworkCacheOptions(cacheTtlMs, cacheTimeoutMs);
    this.sql = postgres(connectionString, {
      max: 10,
      connect_timeout: 5,
      onnotice: () => {},
    });
    this.cachePrefix = createHash("sha256")
      .update(`${connectionString}\0${namespace}`)
      .digest("hex");
  }

  get cacheEnabled(): boolean {
    return Boolean(this.cache);
  }

  attachCache(
    cache: FrameworkPayloadCache,
    ttlMs: number,
    timeoutMs: number,
  ): void {
    if (this.cacheClosed)
      throw new TypeError("Cannot configure a closed storage adapter.");
    if (this.cache)
      throw new TypeError("Storage already has a framework cache.");
    validateFrameworkCacheOptions(ttlMs, timeoutMs);
    this.cache = cache;
    this.cacheTtlMs = ttlMs;
    this.cacheTimeoutMs = timeoutMs;
  }

  async setup(): Promise<void> {
    await this.query(runRuntimeMigrations(this.sql));
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
