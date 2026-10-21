import "server-only";
import { createHash } from "node:crypto";
import type { ConversationChange } from "../lib/evaluation-changes";

/** Process-local LRU: cache derived cells, never saved reports or snapshots. */
export class ChangesCache {
  private entries = new Map<
    string,
    { rows: ConversationChange[]; bytes: number; expires: number }
  >();
  private bytes = 0;
  constructor(
    private readonly maxBytes = 8 * 1024 * 1024,
    private readonly maxEntries = 128,
    private readonly ttlMs = 30 * 60 * 1000,
  ) {}
  get(key: string): ConversationChange[] | undefined {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.expires <= Date.now()) {
      this.remove(key);
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.rows;
  }
  set(key: string, rows: ConversationChange[]) {
    this.remove(key);
    const bytes =
      Buffer.byteLength(JSON.stringify(rows)) + Buffer.byteLength(key);
    if (bytes > this.maxBytes) return;
    for (const [id, entry] of this.entries)
      if (entry.expires <= Date.now()) this.remove(id);
    while (
      this.bytes + bytes > this.maxBytes ||
      this.entries.size >= this.maxEntries
    ) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
    this.entries.set(key, { rows, bytes, expires: Date.now() + this.ttlMs });
    this.bytes += bytes;
  }
  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(key);
  }
}

export const changesCache = new ChangesCache();
/** Hash credentials and scope; no credentials or customer identifiers in cache keys. */
export const changesCacheKey = (scope: unknown, versions: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(["changes-v1", scope, versions]))
    .digest("hex");
