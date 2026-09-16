import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import {
  createCachingFrameworkAdapter,
  registerFrameworkCache,
} from "./caching";
import { createInMemoryCheckpointSaver } from "./in-memory-checkpointer";
import {
  emptyPruneResult,
  type RuntimeMaintenance,
  resolvePruneOptions,
} from "./maintenance";
import {
  createInMemoryPendingRequestStore,
  type PendingRequestStore,
} from "./pending-requests";
import {
  createPostgresFrameworkAdapter,
  type PostgresFrameworkAdapter,
} from "./postgres/adapter";
import { createRedisPendingRequestStore } from "./redis/pending-request-store";
import { createRedisCheckpointSaver } from "./redis/redis-checkpointer";
import { createRedisFrameworkStore } from "./redis/redis-store";
import { createRedisSessionCheckpointStore } from "./redis/session-checkpoint-store";
import {
  createInMemorySessionCheckpointStore,
  type SessionCheckpointStore,
} from "./session-checkpoints";

export type FrameworkAdapter = {
  kind: "in-memory" | "redis" | "postgres";
  pendingRequests: PendingRequestStore;
  sessionCheckpoints: SessionCheckpointStore;
  checkpointer: BaseCheckpointSaver;
  ttlMs: number;
  /** Optional for legacy custom adapters; required on every built-in adapter. */
  maintenance?: RuntimeMaintenance;
  /** Optional for legacy custom adapters; closes owned connections. */
  close?: () => Promise<void>;
  /** Protects execution from concurrent retention cleanup. Released after the entire outcome is persisted. */
  acquireRunLease?: (args: {
    runId: string;
    sessionId?: string;
    onLost: (cause: unknown) => void;
  }) => Promise<() => Promise<void>>;
  /**
   * Best-effort cleanup for ephemeral framework state for a single run.
   * Called when a workflow completes without pausing for an interrupt.
   */
  cleanupRun?: (runId: string, namespaces: string[]) => Promise<void>;
};

/** Shared lifecycle contract implemented by every built-in adapter.
 * FrameworkAdapter remains available for existing custom implementations.
 */
export type ManagedFrameworkAdapter = FrameworkAdapter & {
  maintenance: RuntimeMaintenance;
  /** Close owned connections after in-flight executions finish. */
  close: () => Promise<void>;
};

export type CreateInMemoryFrameworkAdapterOptions = {
  ttlMs?: number;
  maxSessionCheckpoints?: number;
};

export function createInMemoryFrameworkAdapter(
  options?: CreateInMemoryFrameworkAdapterOptions,
): ManagedFrameworkAdapter {
  const ttlMs = options?.ttlMs ?? 15 * 60 * 1000;
  const checkpointer = createInMemoryCheckpointSaver();
  const pendingRequests = createInMemoryPendingRequestStore();
  return {
    kind: "in-memory",
    ttlMs,
    pendingRequests,
    maintenance: {
      setup: async () => {},
      prune: async (options) => {
        const { now, batchSize } = resolvePruneOptions(options);
        const result = emptyPruneResult();
        result.deleted.pendingRequests = pendingRequests.pruneExpired(
          now,
          batchSize,
        );
        result.hasMore = result.deleted.pendingRequests === batchSize;
        return result;
      },
    },
    close: async () => {},
    sessionCheckpoints: createInMemorySessionCheckpointStore({
      ...(options?.maxSessionCheckpoints !== undefined
        ? { maxCheckpointsPerSession: options.maxSessionCheckpoints }
        : {}),
    }),
    checkpointer,
    cleanupRun: async (runId: string) => {
      try {
        await checkpointer.deleteThread(runId);
      } catch {
        // best-effort cleanup only
      }
    },
  };
}

export type CreateRedisFrameworkAdapterOptions = {
  url: string;
  ttlMs?: number;
  prefix?: string;
  maxSessionCheckpoints?: number;
};

export function createRedisFrameworkAdapter(
  options: CreateRedisFrameworkAdapterOptions,
): ManagedFrameworkAdapter {
  const ttlMs = options.ttlMs ?? 15 * 60 * 1000;
  const store = createRedisFrameworkStore({
    url: options.url,
    prefix: options.prefix ?? "kortyx:fw:",
  });
  const cpPrefix = "kortyx:cp:";
  const adapter: ManagedFrameworkAdapter = {
    kind: "redis",
    ttlMs,
    maintenance: {
      setup: async () => {},
      prune: async (options) => {
        resolvePruneOptions(options);
        // Redis owns physical expiry through native key TTL; no scan/delete job is needed.
        return emptyPruneResult();
      },
    },
    close: async () => {
      await store.close?.();
    },
    pendingRequests: createRedisPendingRequestStore({
      store,
      prefix: "kortyx:pending:",
    }),
    sessionCheckpoints: createRedisSessionCheckpointStore({
      store,
      ttlMs,
      prefix: "kortyx:session-cp:",
      ...(options.maxSessionCheckpoints !== undefined
        ? { maxCheckpointsPerSession: options.maxSessionCheckpoints }
        : {}),
    }),
    checkpointer: createRedisCheckpointSaver({
      store,
      ttlMs,
      prefix: cpPrefix,
    }),
    cleanupRun: async (runId: string, namespaces: string[]) => {
      // Avoid SCAN-based deletes in hot paths. We can deterministically delete
      // keys by reading the per-namespace latest pointer.
      const nsList = namespaces.length > 0 ? namespaces : [""];
      await Promise.all(
        nsList.map(async (checkpointNs) => {
          const ns = String(checkpointNs ?? "");
          const latestKey = `${cpPrefix}latest:${runId}:${ns}`;
          const checkpointId = (await store.get(latestKey)) ?? "";
          if (!checkpointId) return;
          await Promise.all([
            store.del(`${cpPrefix}chk:${runId}:${ns}:${checkpointId}`),
            store.del(`${cpPrefix}wr:${runId}:${ns}:${checkpointId}`),
            store.del(latestKey),
          ]);
        }),
      );
    },
  };
  registerFrameworkCache(
    adapter,
    {
      get: (key) => store.get(`kortyx:runtime-cache:${key}`),
      set: (key, value, ttl) =>
        store.set(`kortyx:runtime-cache:${key}`, value, ttl),
      close: () => adapter.close(),
    },
    ttlMs,
  );
  return adapter;
}

export function createFrameworkAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
):
  | (ManagedFrameworkAdapter & { kind: "in-memory" | "redis" })
  | PostgresFrameworkAdapter {
  const url =
    env.KORTYX_REDIS_URL ||
    env.REDIS_URL ||
    env.KORTYX_FRAMEWORK_REDIS_URL ||
    "";
  const ttlMsRaw = env.KORTYX_FRAMEWORK_TTL_MS || env.KORTYX_TTL_MS || "";
  const ttlMs = ttlMsRaw ? Number(ttlMsRaw) : undefined;

  if (env.KORTYX_POSTGRES_URL) {
    const storage = createPostgresFrameworkAdapter({
      connectionString: env.KORTYX_POSTGRES_URL,
      ...(ttlMs !== undefined ? { ttlMs } : {}),
    });
    return url
      ? createCachingFrameworkAdapter({
          storage,
          cache: createRedisFrameworkAdapter({ url }),
        })
      : storage;
  }

  if (url)
    return createRedisFrameworkAdapter({
      url,
      ...(ttlMs ? { ttlMs } : {}),
    }) as ManagedFrameworkAdapter & { kind: "redis" };

  // Dev fallback: in-memory. Not production-safe for resume across processes.
  return createInMemoryFrameworkAdapter({
    ...(ttlMs ? { ttlMs } : {}),
  }) as ManagedFrameworkAdapter & { kind: "in-memory" };
}
