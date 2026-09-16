export type PruneRuntimeOptions = {
  /** Defaults to wall-clock time; future timestamps are rejected. */
  now?: Date;
  /** Maximum parent records removed per table. Default: 500, maximum: 1000. */
  batchSize?: number;
};

export type PruneRuntimeResult = {
  skipped: boolean;
  hasMore: boolean;
  deleted: {
    pendingRequests: number;
    sessionCheckpoints: number;
    graphCheckpoints: number;
    sessions: number;
    runs: number;
  };
};

export type RuntimeMaintenance = {
  /** Explicit, idempotent backend setup. Complete before serving requests. */
  setup: () => Promise<void>;
  /** App-scheduled cleanup. Redis uses native TTL; memory uses lazy expiry/count limits. */
  prune: (options?: PruneRuntimeOptions) => Promise<PruneRuntimeResult>;
};

export function resolvePruneOptions(options: PruneRuntimeOptions = {}) {
  const now = options.now?.getTime() ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0 || now > Date.now())
    throw new TypeError(
      "prune now must be a valid date no later than the current time.",
    );
  const batchSize = options.batchSize ?? 500;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000)
    throw new TypeError(
      "batchSize must be a positive integer no greater than 1000.",
    );
  return { now, batchSize };
}

export function emptyPruneResult(): PruneRuntimeResult {
  return {
    skipped: false,
    hasMore: false,
    deleted: {
      pendingRequests: 0,
      sessionCheckpoints: 0,
      graphCheckpoints: 0,
      sessions: 0,
      runs: 0,
    },
  };
}
