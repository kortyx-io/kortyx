import { randomUUID } from "node:crypto";
import { KortyxError } from "@kortyx/core/errors";
import { z } from "zod";

export type EvalExecutionState =
  | "queued"
  | "running"
  | "completed"
  | "cancelled"
  | "unknown";
export type EvalExecutionLimits = {
  maxActiveRuns: number;
  maxActiveAttempts: number;
  maxQueuedExecutions: number;
};
export type EvalExecutionJob = {
  id: string;
  scope: string;
  fingerprint: string;
  group: string;
  concurrency: number;
  weight: number;
  reserved: boolean;
  payload: Record<string, unknown>;
  state: EvalExecutionState;
  createdAt: number;
  expiresAt: number;
  leaseOwner: string | null;
  leaseUntil: number;
  cancelRequested: boolean;
  sequence: number;
  bytes: number;
};
export type EvalExecutionEvent = {
  sequence: number;
  event: Record<string, unknown>;
};
export type EvalExecutionSubmission = Pick<
  EvalExecutionJob,
  | "id"
  | "scope"
  | "fingerprint"
  | "group"
  | "concurrency"
  | "weight"
  | "payload"
> & { queued: boolean };

/** Admission and claims must be atomic across every handler/replica sharing a store. */
export interface EvalExecutionStore {
  /** Renewal cadence; configure leases comfortably above scheduling/network delays. */
  readonly heartbeatIntervalMs: number;
  /** Changes whenever deduplication history is lost; stable across durable replicas. */
  generation(): Promise<string>;
  submit(
    job: EvalExecutionSubmission,
    limits: EvalExecutionLimits,
  ): Promise<EvalExecutionJob>;
  claim(
    owner: string,
    scope: string,
    limits: EvalExecutionLimits,
  ): Promise<EvalExecutionJob | undefined>;
  /** Bounded snapshot of queued identities in this scope, after maintenance. */
  queued?(scope: string): Promise<string[]>;
  /** Atomic claim restricted to the retirement snapshot; never claim newer work. */
  claimQueued?(
    owner: string,
    scope: string,
    limits: EvalExecutionLimits,
    ids: readonly string[],
  ): Promise<EvalExecutionJob | undefined>;
  get(id: string): Promise<EvalExecutionJob | undefined>;
  status(
    id: string,
  ): Promise<Pick<EvalExecutionJob, "state" | "sequence"> | undefined>;
  events(id: string, after: number): Promise<EvalExecutionEvent[]>;
  heartbeat(id: string, owner: string): Promise<EvalExecutionJob | undefined>;
  append(
    id: string,
    owner: string,
    event: Record<string, unknown>,
  ): Promise<void>;
  finish(
    id: string,
    owner: string,
    state: "completed" | "cancelled",
  ): Promise<void>;
  cancel(id: string): Promise<void>;
}

export const evalExecutionError = (
  code: string,
  message: string,
  status = 409,
) =>
  new KortyxError(code, message, {
    category: "request",
    status,
    retryable: code === "EVAL_EXECUTOR_BUSY",
    safeMessage: message,
  });
export const evalExecutionUnknown = () => ({
  type: "error",
  message:
    "Consumer execution ownership was lost; execution status is unknown. Inspect before running again.",
  failure: {
    version: 1,
    code: "EVAL_EXECUTION_UNKNOWN",
    category: "transport",
    message:
      "Consumer execution ownership was lost; execution status is unknown. Inspect before running again.",
    retryable: false,
  },
});
export const evalExecutionCancelled = () => ({
  type: "error",
  message: "Evaluation execution was cancelled before starting.",
  failure: {
    version: 1,
    code: "EVAL_EXECUTION_CANCELLED",
    category: "request",
    message: "Evaluation execution was cancelled before starting.",
    retryable: false,
  },
});
export const evalExecutionExpired = () => ({
  type: "error",
  message: "Evaluation admission expired before execution started.",
  failure: {
    version: 1,
    code: "EVAL_EXECUTION_EXPIRED",
    category: "request",
    message: "Evaluation admission expired before execution started.",
    retryable: false,
  },
});
export function validateEvalExecutionSubmission(
  input: EvalExecutionSubmission,
) {
  for (const value of [input.id, input.scope, input.fingerprint, input.group])
    if (typeof value !== "string" || !value || value.length > 256)
      throw new TypeError(
        "Execution identities must be bounded nonempty strings.",
      );
  if (
    !Number.isSafeInteger(input.weight) ||
    input.weight < 1 ||
    !Number.isSafeInteger(input.concurrency) ||
    input.concurrency < input.weight
  )
    throw new TypeError("Execution weights must fit positive concurrency.");
  z.json().parse(input.payload);
}
export const evalExecutionClone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
export function validateEvalExecutionLimits(limits: EvalExecutionLimits) {
  for (const value of Object.values(limits))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError("Execution limits must be positive safe integers.");
}
/** Unknown jobs retain their capacity reservation until explicitly cancelled. */
export function evalExecutionFits(
  jobs: EvalExecutionJob[],
  candidate: EvalExecutionSubmission | EvalExecutionJob,
  limits: EvalExecutionLimits,
) {
  const occupied = jobs.filter(
    (job) =>
      job.id !== candidate.id &&
      (job.state === "running" ||
        job.state === "unknown" ||
        (job.state === "queued" && job.reserved)),
  );
  const groups = new Set(occupied.map((job) => job.group));
  const siblings = occupied.filter((job) => job.group === candidate.group);
  if (siblings.some((job) => job.concurrency !== candidate.concurrency))
    throw evalExecutionError(
      "EVAL_CONCURRENCY_CHANGED",
      "Evaluation concurrency changed after admission.",
    );
  return (
    (groups.has(candidate.group) || groups.size < limits.maxActiveRuns) &&
    occupied.reduce((sum, job) => sum + job.weight, 0) + candidate.weight <=
      limits.maxActiveAttempts &&
    siblings.reduce((sum, job) => sum + job.weight, 0) + candidate.weight <=
      candidate.concurrency
  );
}

/** Single-process storage. Share one instance between handlers; use PostgreSQL across replicas. */
export function createInMemoryEvalExecutionStore({
  retentionMs = 86_400_000,
  leaseMs = 30_000,
  maxBytes = 128_000_000,
  maxJobBytes = 32_000_000,
  queueTimeoutMs = 30 * 60_000,
  now = Date.now,
}: {
  retentionMs?: number;
  leaseMs?: number;
  maxBytes?: number;
  maxJobBytes?: number;
  queueTimeoutMs?: number;
  now?: () => number;
} = {}): EvalExecutionStore {
  for (const value of [
    retentionMs,
    leaseMs,
    maxBytes,
    maxJobBytes,
    queueTimeoutMs,
  ])
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError("Execution store limits must be positive integers.");
  const jobs = new Map<string, EvalExecutionJob>();
  const generation = randomUUID();
  const logs = new Map<string, EvalExecutionEvent[]>();
  const bytes = () =>
    [...jobs.values()].reduce((sum, job) => sum + job.bytes, 0);
  const add = (
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
        bytes() + size > maxBytes)
    )
      throw evalExecutionError(
        "EVAL_EVIDENCE_LIMIT",
        "Evaluation evidence exceeded its configured storage limit.",
        413,
      );
    job.sequence++;
    job.bytes += size;
    const log = logs.get(job.id) ?? [];
    log.push({ sequence: job.sequence, event: evalExecutionClone(event) });
    logs.set(job.id, log);
  };
  const maintain = () => {
    for (const job of jobs.values()) {
      if (job.state === "running" && job.leaseUntil <= now()) {
        add(job, evalExecutionUnknown(), true);
        job.state = "unknown";
        job.leaseOwner = null;
      }
      if (job.state === "queued" && job.expiresAt <= now()) {
        add(job, evalExecutionExpired(), true);
        job.state = "cancelled";
        job.expiresAt = now() + Math.max(retentionMs, 86_700_000);
      }
      if (
        job.expiresAt <= now() &&
        ["completed", "cancelled"].includes(job.state)
      ) {
        jobs.delete(job.id);
        logs.delete(job.id);
      }
    }
  };
  const owned = (id: string, owner: string) => {
    maintain();
    const job = jobs.get(id);
    if (!job || job.state !== "running" || job.leaseOwner !== owner)
      throw evalExecutionError(
        "EVAL_EXECUTION_LEASE_LOST",
        "Evaluation execution lease was lost.",
      );
    return job;
  };
  const claim = async (
    owner: string,
    scope: string,
    limits: EvalExecutionLimits,
    ids?: readonly string[],
  ) => {
    validateEvalExecutionLimits(limits);
    maintain();
    const selected = ids && new Set(ids);
    for (const job of jobs.values()) {
      if (
        job.scope !== scope ||
        job.state !== "queued" ||
        (selected && !selected.has(job.id))
      )
        continue;
      if (!evalExecutionFits([...jobs.values()], job, limits)) continue;
      job.state = "running";
      job.leaseOwner = owner;
      job.leaseUntil = now() + leaseMs;
      return evalExecutionClone(job);
    }
    return undefined;
  };
  return {
    heartbeatIntervalMs: Math.max(1, Math.min(2000, Math.floor(leaseMs / 3))),
    async generation() {
      return generation;
    },
    async submit(input, limits) {
      validateEvalExecutionSubmission(input);
      validateEvalExecutionLimits(limits);
      maintain();
      const existing = jobs.get(input.id);
      if (existing) {
        if (existing.fingerprint !== input.fingerprint)
          throw evalExecutionError(
            "EVAL_EXECUTION_CONFLICT",
            "Execution identity was reused with a different request.",
          );
        return evalExecutionClone(existing);
      }
      if (input.weight > limits.maxActiveAttempts)
        throw evalExecutionError(
          "EVAL_CONCURRENCY_UNSUPPORTED",
          "Requested concurrency exceeds the consumer attempt capacity.",
        );
      const size = Buffer.byteLength(JSON.stringify(input.payload));
      if (size > maxJobBytes)
        throw evalExecutionError(
          "EVAL_EVIDENCE_LIMIT",
          "Evaluation request exceeded its configured storage limit.",
          413,
        );
      const fits = evalExecutionFits([...jobs.values()], input, limits);
      if (
        [...jobs.values()].filter((job) => job.state === "queued").length >=
          limits.maxQueuedExecutions ||
        bytes() + size > maxBytes ||
        (!input.queued && !fits)
      )
        throw evalExecutionError(
          "EVAL_EXECUTOR_BUSY",
          "Eval executor is busy; execution was not accepted.",
          503,
        );
      const job: EvalExecutionJob = {
        ...evalExecutionClone(input),
        reserved: !input.queued,
        state: "queued",
        createdAt: now(),
        expiresAt: now() + queueTimeoutMs,
        leaseOwner: null,
        leaseUntil: 0,
        cancelRequested: false,
        sequence: 0,
        bytes: size,
      };
      jobs.set(job.id, job);
      return evalExecutionClone(job);
    },
    claim,
    async queued(scope) {
      maintain();
      return [...jobs.values()]
        .filter((job) => job.scope === scope && job.state === "queued")
        .map((job) => job.id);
    },
    claimQueued: claim,
    async get(id) {
      maintain();
      const job = jobs.get(id);
      return job && evalExecutionClone(job);
    },
    async status(id) {
      maintain();
      const job = jobs.get(id);
      return job ? { state: job.state, sequence: job.sequence } : undefined;
    },
    async events(id, after) {
      maintain();
      return evalExecutionClone(
        (logs.get(id) ?? []).filter((event) => event.sequence > after),
      );
    },
    async heartbeat(id, owner) {
      const job = owned(id, owner);
      job.leaseUntil = now() + leaseMs;
      return evalExecutionClone(job);
    },
    async append(id, owner, event) {
      add(owned(id, owner), event);
    },
    async finish(id, owner, state) {
      const job = owned(id, owner);
      job.state = state;
      job.leaseOwner = null;
      job.leaseUntil = 0;
      job.expiresAt = now() + Math.max(retentionMs, 86_700_000);
    },
    async cancel(id) {
      maintain();
      const job = jobs.get(id);
      if (!job || ["completed", "cancelled"].includes(job.state)) return;
      job.cancelRequested = true;
      if (job.state === "queued" || job.state === "unknown") {
        add(job, evalExecutionCancelled(), true);
        job.state = "cancelled";
        job.expiresAt = now() + Math.max(retentionMs, 86_700_000);
      }
    },
  };
}
