import type { RunnableConfig } from "@langchain/core/runnables";
import {
  type BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  copyCheckpoint,
  getCheckpointId,
  type PendingWrite,
  WRITES_IDX_MAP,
} from "@langchain/langgraph-checkpoint";

type SerializerProtocol = {
  dumpsTyped: (data: any) => Promise<[string, Uint8Array]>;
  loadsTyped: (type: string, data: Uint8Array | string) => Promise<any>;
};

type StoredCheckpoint = {
  checkpoint: Checkpoint;
  metadata: CheckpointMetadata;
  parentCheckpointId?: string | undefined;
  writes: Map<string, [string, string, unknown]>;
};

export type InMemoryCheckpointSaverOptions = {
  /**
   * Maximum number of pending writes stored for a single checkpoint.
   * Prevents unbounded memory growth in dev servers.
   */
  maxWritesPerCheckpoint?: number;
};

const utf8Bytes = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));
const utf8String = (u8: Uint8Array | string) =>
  typeof u8 === "string" ? u8 : Buffer.from(u8).toString("utf8");

const jsonSerde: SerializerProtocol = {
  async dumpsTyped(data: any) {
    return ["json", utf8Bytes(JSON.stringify(data))];
  },
  async loadsTyped(_type: string, data: Uint8Array | string) {
    return JSON.parse(utf8String(data));
  },
};

export type InMemoryCheckpointSaver = BaseCheckpointSaver & {
  deleteThread: (threadId: string) => Promise<void>;
};

/**
 * Bounded in-memory checkpointer:
 * - Keeps only the latest checkpoint per (thread_id, checkpoint_ns)
 * - Keeps only a bounded number of pending writes for that checkpoint
 *
 * This is a safer dev default than LangGraph's MemorySaver, which can grow without bound.
 */
export function createInMemoryCheckpointSaver(
  options?: InMemoryCheckpointSaverOptions,
): InMemoryCheckpointSaver {
  const maxWritesPerCheckpoint = options?.maxWritesPerCheckpoint ?? 2_000;

  // (threadId|ns) -> checkpointId
  const latest = new Map<string, string>();
  // (threadId|ns|id) -> stored
  const checkpoints = new Map<string, StoredCheckpoint>();

  const nsKey = (threadId: string, checkpointNs: string) =>
    `${threadId}\u0001${checkpointNs}`;
  const chkKey = (
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
  ) => `${threadId}\u0001${checkpointNs}\u0001${checkpointId}`;

  const saver: any = {
    serde: jsonSerde,

    async get(config: RunnableConfig) {
      const value = await saver.getTuple(config);
      return value ? value.checkpoint : undefined;
    },

    getNextVersion(current: number | string | undefined) {
      if (typeof current === "string") {
        throw new Error("Please override this method to use string versions.");
      }
      return current !== undefined && typeof current === "number"
        ? current + 1
        : 1;
    },

    async getTuple(
      config: RunnableConfig,
    ): Promise<CheckpointTuple | undefined> {
      const threadId = config.configurable?.thread_id as string | undefined;
      const checkpointNs =
        (config.configurable?.checkpoint_ns as string | undefined) ?? "";
      if (!threadId) return undefined;

      const requested = getCheckpointId(config);
      const id = requested || latest.get(nsKey(threadId, checkpointNs));
      if (!id) return undefined;

      const stored = checkpoints.get(chkKey(threadId, checkpointNs, id));
      if (!stored) return undefined;

      const pendingWrites = Array.from(stored.writes.values());
      const tuple: CheckpointTuple = {
        config: {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: id,
          },
        },
        checkpoint: stored.checkpoint,
        metadata: stored.metadata,
        pendingWrites: pendingWrites as any,
      };

      if (stored.parentCheckpointId) {
        tuple.parentConfig = {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: stored.parentCheckpointId,
          },
        };
      }

      return tuple;
    },

    async *list(_config: RunnableConfig, _options?: CheckpointListOptions) {
      // Not required for current runtime behavior.
    },

    async put(
      config: RunnableConfig,
      checkpoint: Checkpoint,
      metadata: CheckpointMetadata,
      _newVersions: Record<string, number | string>,
    ): Promise<RunnableConfig> {
      const threadId = config.configurable?.thread_id as string | undefined;
      const checkpointNs =
        (config.configurable?.checkpoint_ns as string | undefined) ?? "";
      if (!threadId) {
        throw new Error(
          'Failed to put checkpoint: missing "thread_id" in config.configurable.',
        );
      }

      const ns = nsKey(threadId, checkpointNs);
      const prevId = latest.get(ns);

      const prepared = copyCheckpoint(checkpoint as any);
      const entry: StoredCheckpoint = {
        checkpoint: prepared as any,
        metadata,
        parentCheckpointId: config.configurable?.checkpoint_id as
          | string
          | undefined,
        writes: new Map(),
      };

      const id = checkpoint.id;
      checkpoints.set(chkKey(threadId, checkpointNs, id), entry);
      latest.set(ns, id);

      // Bounded: drop previous checkpoint + its writes
      if (prevId && prevId !== id) {
        checkpoints.delete(chkKey(threadId, checkpointNs, prevId));
      }

      return {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: id,
        },
      };
    },

    async putWrites(
      config: RunnableConfig,
      writes: PendingWrite[],
      taskId: string,
    ): Promise<void> {
      const threadId = config.configurable?.thread_id as string | undefined;
      const checkpointNs =
        (config.configurable?.checkpoint_ns as string | undefined) ?? "";
      const checkpointId = config.configurable?.checkpoint_id as
        | string
        | undefined;
      if (!threadId || !checkpointId) return;

      const stored = checkpoints.get(
        chkKey(threadId, checkpointNs, checkpointId),
      );
      if (!stored) return;

      for (let idx = 0; idx < writes.length; idx++) {
        const [channel, value] = writes[idx]!;
        const mappedIdx = WRITES_IDX_MAP[channel] ?? idx;
        const key = `${taskId},${mappedIdx}`;

        // HSETNX semantics for normal writes; always overwrite for special writes (negative mappedIdx)
        if (mappedIdx >= 0 && stored.writes.has(key)) continue;

        // Bound the number of writes to avoid unbounded growth in dev
        if (stored.writes.size >= maxWritesPerCheckpoint) break;

        stored.writes.set(key, [taskId, channel, value]);
      }
    },

    async deleteThread(threadId: string): Promise<void> {
      for (const k of Array.from(latest.keys())) {
        if (k.startsWith(`${threadId}\u0001`)) latest.delete(k);
      }
      for (const k of Array.from(checkpoints.keys())) {
        if (k.startsWith(`${threadId}\u0001`)) checkpoints.delete(k);
      }
    },
  };

  return saver as InMemoryCheckpointSaver;
}
