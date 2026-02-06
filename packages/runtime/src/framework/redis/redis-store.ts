import { createRedisClient, type RedisClient } from "./redis-client";

export type RedisFrameworkStoreOptions = {
  url: string;
  prefix?: string;
};

export type FrameworkTtl = {
  ttlMs: number;
};

export type RedisFrameworkStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlMs: number) => Promise<void>;
  del: (key: string) => Promise<void>;
  hset: (key: string, field: string, value: string) => Promise<void>;
  hsetnx: (key: string, field: string, value: string) => Promise<number>;
  hgetall: (key: string) => Promise<Record<string, string>>;
  expire: (key: string, ttlMs: number) => Promise<void>;
  scanKeys: (prefix: string) => Promise<string[]>;
  delRaw: (keys: string[]) => Promise<void>;
};

type RedisErrorReply = { type: "error"; message: string };
const isRedisError = (r: unknown): r is RedisErrorReply =>
  Boolean(r) && typeof r === "object" && (r as any).type === "error";

export function createRedisFrameworkStore(
  options: RedisFrameworkStoreOptions,
): RedisFrameworkStore {
  const client: RedisClient = createRedisClient({ url: options.url });
  const prefix = options.prefix ?? "kortyx:fw:";

  const k = (key: string) => `${prefix}${key}`;

  return {
    async get(key: string): Promise<string | null> {
      const r = await client.command("GET", [k(key)]);
      if (r === null) return null;
      if (typeof r === "string") return r;
      if (isRedisError(r)) {
        throw new Error(`Redis GET error: ${r.message}`);
      }
      return null;
    },

    async set(key: string, value: string, ttlMs: number): Promise<void> {
      const args = [k(key), value, "PX", String(Math.max(1, ttlMs))];
      const r = await client.command("SET", args);
      if (isRedisError(r)) {
        throw new Error(`Redis SET error: ${r.message}`);
      }
    },

    async del(key: string): Promise<void> {
      const r = await client.command("DEL", [k(key)]);
      if (isRedisError(r)) {
        throw new Error(`Redis DEL error: ${r.message}`);
      }
    },

    async hset(key: string, field: string, value: string): Promise<void> {
      const r = await client.command("HSET", [k(key), field, value]);
      if (isRedisError(r)) {
        throw new Error(`Redis HSET error: ${r.message}`);
      }
    },

    async hsetnx(key: string, field: string, value: string): Promise<number> {
      const r = await client.command("HSETNX", [k(key), field, value]);
      if (isRedisError(r)) {
        throw new Error(`Redis HSETNX error: ${r.message}`);
      }
      return typeof r === "number" ? r : 0;
    },

    async hgetall(key: string): Promise<Record<string, string>> {
      const r = await client.command("HGETALL", [k(key)]);
      if (isRedisError(r)) {
        throw new Error(`Redis HGETALL error: ${r.message}`);
      }
      if (!Array.isArray(r)) return {};
      const out: Record<string, string> = {};
      for (let i = 0; i < r.length; i += 2) {
        const kk = r[i];
        const v = r[i + 1];
        if (typeof kk === "string" && typeof v === "string") out[kk] = v;
      }
      return out;
    },

    async expire(key: string, ttlMs: number): Promise<void> {
      const r = await client.command("PEXPIRE", [
        k(key),
        String(Math.max(1, ttlMs)),
      ]);
      if (isRedisError(r)) {
        throw new Error(`Redis PEXPIRE error: ${r.message}`);
      }
    },

    async scanKeys(prefixKey: string): Promise<string[]> {
      const fullPrefix = k(prefixKey);
      let cursor = "0";
      const keys: string[] = [];
      do {
        const r = await client.command("SCAN", [
          cursor,
          "MATCH",
          `${fullPrefix}*`,
          "COUNT",
          "200",
        ]);
        if (!Array.isArray(r) || r.length < 2) break;
        cursor = typeof r[0] === "string" ? r[0] : "0";
        const batch = r[1];
        if (Array.isArray(batch)) {
          for (const key of batch) {
            if (typeof key === "string") keys.push(key);
          }
        }
      } while (cursor !== "0");
      return keys;
    },

    async delRaw(keys: string[]): Promise<void> {
      if (keys.length === 0) return;
      const r = await client.command("DEL", keys);
      if (isRedisError(r)) {
        throw new Error(`Redis DEL error: ${r.message}`);
      }
    },
  };
}
