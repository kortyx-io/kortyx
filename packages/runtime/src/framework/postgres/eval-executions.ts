import { createHash, randomUUID } from "node:crypto";
import { PersistenceError } from "@kortyx/core/errors";
import postgres from "postgres";
import { z } from "zod";
import {
  type EvalExecutionJob,
  type EvalExecutionLimits,
  type EvalExecutionStore,
  evalExecutionCancelled,
  evalExecutionError,
  evalExecutionExpired,
  evalExecutionFits,
  evalExecutionUnknown,
  validateEvalExecutionLimits,
  validateEvalExecutionSubmission,
} from "../eval-executions";

const schema = `
CREATE TABLE IF NOT EXISTS kortyx_eval_execution_namespaces (namespace text PRIMARY KEY, generation text NOT NULL);
CREATE TABLE IF NOT EXISTS kortyx_eval_execution_jobs (
  namespace text NOT NULL, id text NOT NULL, record jsonb NOT NULL,
  PRIMARY KEY (namespace, id)
);
CREATE INDEX IF NOT EXISTS kortyx_eval_execution_running_expiry ON kortyx_eval_execution_jobs(namespace, ((record->>'leaseUntil')::bigint)) WHERE record->>'state'='running';
CREATE INDEX IF NOT EXISTS kortyx_eval_execution_retention ON kortyx_eval_execution_jobs(namespace, ((record->>'expiresAt')::bigint)) WHERE record->>'state' IN ('completed','cancelled','queued');
CREATE TABLE IF NOT EXISTS kortyx_eval_execution_events (
  namespace text NOT NULL, job_id text NOT NULL, sequence integer NOT NULL, event jsonb NOT NULL,
  PRIMARY KEY (namespace, job_id, sequence),
  FOREIGN KEY (namespace, job_id) REFERENCES kortyx_eval_execution_jobs(namespace,id) ON DELETE CASCADE
);
`;

/** Durable admission, capacity and event replay, scoped independently from session checkpoints. */
export function createPostgresEvalExecutionStore({
  connectionString,
  namespace,
  retentionMs = 86_400_000,
  leaseMs = 30_000,
  maxBytes = 128_000_000,
  maxJobBytes = 32_000_000,
  queueTimeoutMs = 30 * 60_000,
}: {
  connectionString: string;
  namespace: string;
  retentionMs?: number;
  leaseMs?: number;
  maxBytes?: number;
  maxJobBytes?: number;
  queueTimeoutMs?: number;
}): EvalExecutionStore & { setup(): Promise<void>; close(): Promise<void> } {
  if (!namespace || namespace.length > 256)
    throw new TypeError(
      "A nonempty execution store namespace of at most 256 characters is required.",
    );
  if (
    !["postgres:", "postgresql:"].includes(new URL(connectionString).protocol)
  )
    throw new TypeError("connectionString must be a PostgreSQL URL.");
  for (const value of [
    retentionMs,
    leaseMs,
    maxBytes,
    maxJobBytes,
    queueTimeoutMs,
  ])
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError("Execution store limits must be positive integers.");
  const sql = postgres(connectionString, {
    max: 10,
    connect_timeout: 5,
    onnotice: () => {},
  });
  let ready: Promise<void> | undefined;
  const setup = () => {
    ready ??= sql
      .begin(async (tx) => {
        await tx`SELECT set_config('lock_timeout','5s',true)`;
        await tx`SELECT pg_advisory_xact_lock(hashtextextended('kortyx:eval:execution:schema',0))`;
        await tx`CREATE TABLE IF NOT EXISTS kortyx_eval_execution_migrations (version integer PRIMARY KEY, checksum text NOT NULL)`;
        const checksum = createHash("sha256").update(schema).digest("hex");
        const history = await tx<
          { version: number; checksum: string }[]
        >`SELECT version,checksum FROM kortyx_eval_execution_migrations ORDER BY version`;
        if (
          history.length &&
          (history.length !== 1 ||
            history[0]?.version !== 1 ||
            history[0]?.checksum !== checksum)
        )
          throw new PersistenceError(
            "Evaluation execution schema history is incompatible with this SDK.",
          );
        if (!history.length) {
          await tx.unsafe(schema);
          await tx`INSERT INTO kortyx_eval_execution_migrations VALUES (1,${checksum})`;
        }
        await tx`INSERT INTO kortyx_eval_execution_namespaces (namespace,generation) VALUES (${namespace},${randomUUID()}) ON CONFLICT (namespace) DO NOTHING`;
      })
      .then(() => {});
    return ready;
  };
  const load = async (tx: postgres.TransactionSql, id: string) =>
    (
      await tx<
        { record: EvalExecutionJob }[]
      >`SELECT record FROM kortyx_eval_execution_jobs WHERE namespace=${namespace} AND id=${id}`
    )[0]?.record;
  const save = async (tx: postgres.TransactionSql, job: EvalExecutionJob) => {
    await tx`UPDATE kortyx_eval_execution_jobs SET record=${tx.json(z.json().parse(job))} WHERE namespace=${namespace} AND id=${job.id}`;
  };
  const used = async (tx: postgres.TransactionSql) =>
    Number(
      (
        await tx`SELECT COALESCE(sum((record->>'bytes')::bigint),0) AS bytes FROM kortyx_eval_execution_jobs WHERE namespace=${namespace}`
      )[0]?.bytes ?? 0,
    );
  const add = async (
    tx: postgres.TransactionSql,
    job: EvalExecutionJob,
    event: Record<string, unknown>,
    emergency = false,
  ) => {
    const size = Buffer.byteLength(JSON.stringify(event));
    emergency ||= event.type === "error" && size <= 65_536;
    if (
      !emergency &&
      (job.sequence >= 10_000 ||
        job.bytes + size > maxJobBytes ||
        (await used(tx)) + size > maxBytes)
    )
      throw evalExecutionError(
        "EVAL_EVIDENCE_LIMIT",
        "Evaluation evidence exceeded its configured storage limit.",
        413,
      );
    job.sequence++;
    job.bytes += size;
    await tx`INSERT INTO kortyx_eval_execution_events (namespace,job_id,sequence,event) VALUES (${namespace},${job.id},${job.sequence},${tx.json(z.json().parse(event))})`;
    await save(tx, job);
  };
  const transact = async <T>(
    operation: (tx: postgres.TransactionSql, now: number) => Promise<T>,
  ): Promise<T> => {
    await setup();
    return (await sql.begin(async (tx) => {
      await tx`SELECT set_config('lock_timeout','5s',true)`;
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`kortyx:eval:executions:${namespace}`},0))`;
      const now = Number(
        (
          await tx`SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now`
        )[0]?.now,
      );
      await tx`DELETE FROM kortyx_eval_execution_jobs WHERE namespace=${namespace} AND record->>'state' IN ('completed','cancelled') AND (record->>'expiresAt')::bigint<=${now}`;
      const expired = await tx<
        { record: EvalExecutionJob }[]
      >`SELECT record FROM kortyx_eval_execution_jobs WHERE namespace=${namespace} AND record->>'state'='running' AND (record->>'leaseUntil')::bigint<=${now}`;
      for (const { record: job } of expired) {
        await add(tx, job, evalExecutionUnknown(), true);
        job.state = "unknown";
        job.leaseOwner = null;
        await save(tx, job);
      }
      const queued = await tx<
        { record: EvalExecutionJob }[]
      >`SELECT record FROM kortyx_eval_execution_jobs WHERE namespace=${namespace} AND record->>'state'='queued' AND (record->>'expiresAt')::bigint<=${now}`;
      for (const { record: job } of queued) {
        await add(tx, job, evalExecutionExpired(), true);
        job.state = "cancelled";
        job.expiresAt = now + Math.max(retentionMs, 86_700_000);
        await save(tx, job);
      }
      return operation(tx, now);
    })) as T;
  };
  const owned = async (
    tx: postgres.TransactionSql,
    id: string,
    owner: string,
  ) => {
    const job = await load(tx, id);
    if (!job || job.state !== "running" || job.leaseOwner !== owner)
      throw evalExecutionError(
        "EVAL_EXECUTION_LEASE_LOST",
        "Evaluation execution lease was lost.",
      );
    return job;
  };
  const jobs = async (tx: postgres.TransactionSql) =>
    (
      await tx<
        { record: EvalExecutionJob }[]
      >`SELECT record-'payload' AS record FROM kortyx_eval_execution_jobs WHERE namespace=${namespace} AND record->>'state' IN ('queued','running','unknown') ORDER BY (record->>'createdAt')::bigint,id`
    ).map((row) => row.record);
  const claim = (
    owner: string,
    scope: string,
    limits: EvalExecutionLimits,
    ids?: readonly string[],
  ) =>
    transact(async (tx, now) => {
      validateEvalExecutionLimits(limits);
      const selected = ids && new Set(ids);
      const candidates = await jobs(tx);
      const candidate = candidates.find(
        (job) =>
          job.scope === scope &&
          job.state === "queued" &&
          (!selected || selected.has(job.id)) &&
          evalExecutionFits(candidates, job, limits),
      );
      if (!candidate) return undefined;
      const job = await load(tx, candidate.id);
      if (!job) return undefined;
      job.state = "running";
      job.leaseOwner = owner;
      job.leaseUntil = now + leaseMs;
      await save(tx, job);
      return job;
    });
  return {
    heartbeatIntervalMs: Math.max(1, Math.min(2000, Math.floor(leaseMs / 3))),
    generation: async () => {
      await setup();
      return (
        await sql`SELECT generation FROM kortyx_eval_execution_namespaces WHERE namespace=${namespace}`
      )[0]?.generation as string;
    },
    setup,
    close: async () => {
      await ready?.catch(() => {});
      await sql.end();
    },
    submit: (input, limits) =>
      transact(async (tx, now) => {
        validateEvalExecutionLimits(limits);
        validateEvalExecutionSubmission(input);
        const existing = await load(tx, input.id);
        if (existing) {
          if (existing.fingerprint !== input.fingerprint)
            throw evalExecutionError(
              "EVAL_EXECUTION_CONFLICT",
              "Execution identity was reused with a different request.",
            );
          return existing;
        }
        if (input.weight > limits.maxActiveAttempts)
          throw evalExecutionError(
            "EVAL_CONCURRENCY_UNSUPPORTED",
            "Requested concurrency exceeds the consumer attempt capacity.",
          );
        const candidates = await jobs(tx);
        const size = Buffer.byteLength(JSON.stringify(input.payload));
        if (size > maxJobBytes)
          throw evalExecutionError(
            "EVAL_EVIDENCE_LIMIT",
            "Evaluation request exceeded its configured storage limit.",
            413,
          );
        const fits = evalExecutionFits(candidates, input, limits);
        if (
          candidates.filter((job) => job.state === "queued").length >=
            limits.maxQueuedExecutions ||
          (await used(tx)) + size > maxBytes ||
          (!input.queued && !fits)
        )
          throw evalExecutionError(
            "EVAL_EXECUTOR_BUSY",
            "Eval executor is busy; execution was not accepted.",
            503,
          );
        const job: EvalExecutionJob = {
          ...input,
          reserved: !input.queued,
          state: "queued",
          createdAt: now,
          expiresAt: now + queueTimeoutMs,
          leaseOwner: null,
          leaseUntil: 0,
          cancelRequested: false,
          sequence: 0,
          bytes: size,
        };
        await tx`INSERT INTO kortyx_eval_execution_jobs (namespace,id,record) VALUES (${namespace},${job.id},${tx.json(z.json().parse(job))})`;
        return job;
      }),
    claim,
    queued: (scope) =>
      transact(async (tx) =>
        (await jobs(tx))
          .filter((job) => job.scope === scope && job.state === "queued")
          .map((job) => job.id),
      ),
    claimQueued: claim,
    get: (id) => transact((tx) => load(tx, id)),
    status: (id) =>
      transact(
        async (tx) =>
          (
            await tx<
              { state: EvalExecutionJob["state"]; sequence: number }[]
            >`SELECT record->>'state' as state,(record->>'sequence')::integer as sequence FROM kortyx_eval_execution_jobs WHERE namespace=${namespace} AND id=${id}`
          )[0],
      ),
    events: (id, after) =>
      transact(
        async (tx) =>
          await tx<
            { sequence: number; event: Record<string, unknown> }[]
          >`SELECT sequence,event FROM kortyx_eval_execution_events WHERE namespace=${namespace} AND job_id=${id} AND sequence>${after} ORDER BY sequence`,
      ),
    heartbeat: (id, owner) =>
      transact(async (tx, now) => {
        const job = await owned(tx, id, owner);
        job.leaseUntil = now + leaseMs;
        await save(tx, job);
        return job;
      }),
    append: (id, owner, event) =>
      transact(async (tx) => {
        await add(tx, await owned(tx, id, owner), event);
      }),
    finish: (id, owner, state) =>
      transact(async (tx, now) => {
        const job = await owned(tx, id, owner);
        job.state = state;
        job.leaseOwner = null;
        job.leaseUntil = 0;
        job.expiresAt = now + Math.max(retentionMs, 86_700_000);
        await save(tx, job);
      }),
    cancel: (id) =>
      transact(async (tx, now) => {
        const job = await load(tx, id);
        if (!job || ["completed", "cancelled"].includes(job.state)) return;
        job.cancelRequested = true;
        if (job.state === "queued" || job.state === "unknown") {
          await add(tx, job, evalExecutionCancelled(), true);
          job.state = "cancelled";
          job.expiresAt = now + Math.max(retentionMs, 86_700_000);
        }
        await save(tx, job);
      }),
  };
}
