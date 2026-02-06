import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { createInMemoryCheckpointSaver } from "./in-memory-checkpointer";
import {
  createInMemoryPendingRequestStore,
  type PendingRequestStore,
} from "./pending-requests";
import { createRedisPendingRequestStore } from "./redis/pending-request-store";
import { createRedisCheckpointSaver } from "./redis/redis-checkpointer";
import { createRedisFrameworkStore } from "./redis/redis-store";

export type FrameworkAdapter = {
  kind: "memory" | "redis";
  pendingRequests: PendingRequestStore;
  checkpointer: BaseCheckpointSaver;
  ttlMs: number;
  /**
   * Best-effort cleanup for ephemeral framework state for a single run.
   * Called when a workflow completes without pausing for an interrupt.
   */
  cleanupRun?: (runId: string, namespaces: string[]) => Promise<void>;
};

export type CreateInMemoryFrameworkAdapterOptions = {
  ttlMs?: number;
};

export function createInMemoryFrameworkAdapter(
  options?: CreateInMemoryFrameworkAdapterOptions,
): FrameworkAdapter {
  const ttlMs = options?.ttlMs ?? 15 * 60 * 1000;
  const checkpointer = createInMemoryCheckpointSaver();
  return {
    kind: "memory",
    ttlMs,
    pendingRequests: createInMemoryPendingRequestStore(),
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
};

export function createRedisFrameworkAdapter(
  options: CreateRedisFrameworkAdapterOptions,
): FrameworkAdapter {
  const ttlMs = options.ttlMs ?? 15 * 60 * 1000;
  const store = createRedisFrameworkStore({
    url: options.url,
    prefix: options.prefix ?? "kortyx:fw:",
  });
  const cpPrefix = "kortyx:cp:";
  return {
    kind: "redis",
    ttlMs,
    pendingRequests: createRedisPendingRequestStore({
      store,
      prefix: "kortyx:pending:",
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
}

export function createFrameworkAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
): FrameworkAdapter {
  const url =
    env.KORTYX_REDIS_URL ||
    env.REDIS_URL ||
    env.KORTYX_FRAMEWORK_REDIS_URL ||
    "";
  const ttlMsRaw = env.KORTYX_FRAMEWORK_TTL_MS || env.KORTYX_TTL_MS || "";
  const ttlMs = ttlMsRaw ? Number(ttlMsRaw) : undefined;

  if (url)
    return createRedisFrameworkAdapter({ url, ...(ttlMs ? { ttlMs } : {}) });

  // Dev fallback: in-memory. Not production-safe for resume across processes.
  return createInMemoryFrameworkAdapter({ ...(ttlMs ? { ttlMs } : {}) });
}
