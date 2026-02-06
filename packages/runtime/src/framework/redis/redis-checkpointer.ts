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
import type { RedisFrameworkStore } from "./redis-store";

type SerializerProtocol = {
  dumpsTyped: (data: any) => Promise<[string, Uint8Array]>;
  loadsTyped: (type: string, data: Uint8Array | string) => Promise<any>;
};

type RedisCheckpointSaverOptions = {
  store: RedisFrameworkStore;
  prefix?: string;
  ttlMs: number;
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

const b64FromBytes = (u8: Uint8Array) => Buffer.from(u8).toString("base64");
const bytesFromB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

type StoredCheckpoint = {
  checkpoint: string; // base64
  metadata: string; // base64
  parentCheckpointId?: string | undefined;
};

type StoredWrite = {
  taskId: string;
  channel: string;
  value: string; // base64
};

export type RedisCheckpointSaver = BaseCheckpointSaver & {
  deleteThread: (threadId: string) => Promise<void>;
};

export function createRedisCheckpointSaver(
  options: RedisCheckpointSaverOptions,
): RedisCheckpointSaver {
  const store = options.store;
  const ttlMs = options.ttlMs;
  const prefix = options.prefix ?? "kortyx:cp:";

  const latestKey = (threadId: string, checkpointNs: string) =>
    `${prefix}latest:${threadId}:${checkpointNs}`;
  const checkpointKey = (
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
  ) => `${prefix}chk:${threadId}:${checkpointNs}:${checkpointId}`;
  const writesKey = (
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
  ) => `${prefix}wr:${threadId}:${checkpointNs}:${checkpointId}`;

  const serde = jsonSerde;

  const saver: any = {
    serde,

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
      const checkpointId =
        requested || (await store.get(latestKey(threadId, checkpointNs))) || "";
      if (!checkpointId) return undefined;

      const raw = await store.get(
        checkpointKey(threadId, checkpointNs, checkpointId),
      );
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as StoredCheckpoint;

      const checkpoint = (await serde.loadsTyped(
        "json",
        bytesFromB64(parsed.checkpoint),
      )) as Checkpoint;
      const metadata = (await serde.loadsTyped(
        "json",
        bytesFromB64(parsed.metadata),
      )) as CheckpointMetadata;

      const writes = await store.hgetall(
        writesKey(threadId, checkpointNs, checkpointId),
      );
      const pendingWrites = await Promise.all(
        Object.values(writes).map(async (v) => {
          const w = JSON.parse(v) as StoredWrite;
          return [
            w.taskId,
            w.channel,
            await serde.loadsTyped("json", bytesFromB64(w.value)),
          ] as any;
        }),
      );

      const tuple: CheckpointTuple = {
        config: {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: checkpointId,
          },
        },
        checkpoint,
        metadata,
        pendingWrites,
      };

      if (parsed.parentCheckpointId) {
        tuple.parentConfig = {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: parsed.parentCheckpointId,
          },
        };
      }

      return tuple;
    },

    async *list(_config: RunnableConfig, _options?: CheckpointListOptions) {
      // Minimal implementation: list is not needed for core runtime behavior today.
      // If needed later (studio/time-travel), implement scanning by prefix.
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

      const prevId = await store.get(latestKey(threadId, checkpointNs));

      const prepared = copyCheckpoint(checkpoint as any);
      const [[, chkBytes], [, metaBytes]] = await Promise.all([
        serde.dumpsTyped(prepared),
        serde.dumpsTyped(metadata),
      ]);

      const checkpointId = checkpoint.id;
      const key = checkpointKey(threadId, checkpointNs, checkpointId);
      const stored: StoredCheckpoint = {
        checkpoint: b64FromBytes(chkBytes),
        metadata: b64FromBytes(metaBytes),
        parentCheckpointId: config.configurable?.checkpoint_id as
          | string
          | undefined,
      };

      await store.set(key, JSON.stringify(stored), ttlMs);
      await store.set(latestKey(threadId, checkpointNs), checkpointId, ttlMs);

      // Keep storage bounded: delete the previous checkpoint and its writes.
      if (prevId && prevId !== checkpointId) {
        await store.del(checkpointKey(threadId, checkpointNs, prevId));
        await store.del(writesKey(threadId, checkpointNs, prevId));
      }

      return {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: checkpointId,
        },
      };
    },

    async putWrites(
      config: RunnableConfig,
      writes: PendingWrite[],
      taskId: string,
    ): Promise<void> {
      const threadId = config.configurable?.thread_id as string | undefined;
      const checkpointNs = config.configurable?.checkpoint_ns as
        | string
        | undefined;
      const checkpointId = config.configurable?.checkpoint_id as
        | string
        | undefined;
      if (!threadId) {
        throw new Error(
          'Failed to put writes: missing "thread_id" in config.configurable.',
        );
      }
      if (!checkpointId) {
        throw new Error(
          'Failed to put writes: missing "checkpoint_id" in config.configurable.',
        );
      }

      const outer = writesKey(threadId, checkpointNs ?? "", checkpointId);
      await store.expire(outer, ttlMs);

      await Promise.all(
        writes.map(async ([channel, value], idx) => {
          const [, vBytes] = await serde.dumpsTyped(value as any);
          const mappedIdx = WRITES_IDX_MAP[channel] ?? idx;
          const innerKeyStr = `${taskId},${mappedIdx}`;
          const payload: StoredWrite = {
            taskId,
            channel,
            value: b64FromBytes(vBytes),
          };
          const serialized = JSON.stringify(payload);
          if (mappedIdx >= 0) {
            await store.hsetnx(outer, innerKeyStr, serialized);
          } else {
            await store.hset(outer, innerKeyStr, serialized);
          }
        }),
      );
    },

    async deleteThread(threadId: string): Promise<void> {
      const chkKeys = await store.scanKeys(`${prefix}chk:${threadId}:`);
      const wrKeys = await store.scanKeys(`${prefix}wr:${threadId}:`);
      const latestKeys = await store.scanKeys(`${prefix}latest:${threadId}:`);
      await store.delRaw([...chkKeys, ...wrKeys, ...latestKeys]);
    },
  };

  return saver as RedisCheckpointSaver;
}
