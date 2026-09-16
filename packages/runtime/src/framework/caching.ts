import type { FrameworkAdapter, ManagedFrameworkAdapter } from "./adapter";

/** Internal cache capability. It is separate from authoritative framework stores. */
export type FrameworkPayloadCache = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlMs: number) => Promise<void>;
  close?: () => Promise<void>;
};

const providers = new WeakMap<
  FrameworkAdapter,
  { cache: FrameworkPayloadCache; ttlMs: number }
>();
const attachedCaches = new WeakSet<FrameworkAdapter>();
const storageBindings = new WeakMap<
  FrameworkAdapter,
  (cache: FrameworkPayloadCache, ttlMs: number, timeoutMs: number) => void
>();

export function registerFrameworkCache(
  adapter: FrameworkAdapter,
  cache: FrameworkPayloadCache,
  ttlMs: number,
) {
  providers.set(adapter, { cache, ttlMs });
}

export function registerFrameworkCacheStorage(
  adapter: FrameworkAdapter,
  bind: (
    cache: FrameworkPayloadCache,
    ttlMs: number,
    timeoutMs: number,
  ) => void,
) {
  storageBindings.set(adapter, bind);
}

export function validateFrameworkCacheOptions(
  ttlMs: number,
  timeoutMs: number,
) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1)
    throw new TypeError("cache ttlMs must be a positive safe integer.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1000)
    throw new TypeError(
      "cache timeoutMs must be a positive integer no greater than 1000.",
    );
}

export type CreateCachingFrameworkAdapterOptions<
  T extends ManagedFrameworkAdapter = ManagedFrameworkAdapter,
> = {
  /** Authoritative storage. Currently supports the PostgreSQL adapter. */
  storage: T;
  /** Payload cache provider. Currently supports the Redis adapter. */
  cache: FrameworkAdapter;
  /** Cache operation budget. Default: 25 ms, maximum: 1000 ms. */
  timeoutMs?: number;
};

/** Attaches caching to storage before traffic, preserving every storage method and its identity.
 * The returned adapter owns shutdown of both inputs. Do not use the cache input as another storage backend.
 */
export function createCachingFrameworkAdapter<
  T extends ManagedFrameworkAdapter,
>(options: CreateCachingFrameworkAdapterOptions<T>): T {
  const bind = storageBindings.get(options.storage);
  if (!bind)
    throw new TypeError(
      "storage must support framework payload caching (currently PostgreSQL).",
    );
  const provider = providers.get(options.cache);
  if (!provider)
    throw new TypeError(
      "cache must provide framework payload caching (currently Redis).",
    );
  if (attachedCaches.has(options.cache))
    throw new TypeError("The cache adapter already has a storage owner.");
  const timeoutMs = options.timeoutMs ?? 25;
  validateFrameworkCacheOptions(provider.ttlMs, timeoutMs);
  bind(provider.cache, provider.ttlMs, timeoutMs);
  attachedCaches.add(options.cache);
  return options.storage;
}
