import type {
  PendingRequestRecord,
  PendingRequestStore,
} from "../pending-requests";
import type { RedisFrameworkStore } from "./redis-store";

export type RedisPendingRequestStoreOptions = {
  store: RedisFrameworkStore;
  prefix?: string;
};

export function createRedisPendingRequestStore(
  options: RedisPendingRequestStoreOptions,
): PendingRequestStore {
  const prefix = options.prefix ?? "kortyx:pending:";
  const key = (token: string) => `${prefix}${token}`;

  return {
    async save(rec: PendingRequestRecord) {
      await options.store.set(key(rec.token), JSON.stringify(rec), rec.ttlMs);
    },
    async get(token: string) {
      const raw = await options.store.get(key(token));
      if (!raw) return null;
      return JSON.parse(raw) as PendingRequestRecord;
    },
    async delete(token: string) {
      await options.store.del(key(token));
    },
    async update(token: string, patch: Partial<PendingRequestRecord>) {
      const prevRaw = await options.store.get(key(token));
      if (!prevRaw) return;
      const prev = JSON.parse(prevRaw) as PendingRequestRecord;
      const next = { ...prev, ...patch } as PendingRequestRecord;
      const ttlLeft = Math.max(1, next.ttlMs - (Date.now() - next.createdAt));
      await options.store.set(key(token), JSON.stringify(next), ttlLeft);
    },
  };
}
