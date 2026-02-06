import type { GraphState } from "@kortyx/core";

export type HumanInputKind = "choice" | "multi-choice" | "text";

export interface HumanInputOption {
  id: string;
  label: string;
  description?: string;
  value?: unknown;
}

export interface PendingRequestRecord {
  token: string;
  requestId: string;
  sessionId?: string | undefined;
  /**
   * Framework run identifier used by the checkpointer (thread_id).
   * This must be stable across interrupt/resume, but should not be reused for new messages.
   */
  runId: string;
  workflow: string;
  node: string;
  state?: GraphState;
  schema: { kind: HumanInputKind; multiple: boolean; question?: string };
  options: HumanInputOption[];
  createdAt: number;
  ttlMs: number;
}

export interface PendingRequestStore {
  save: (rec: PendingRequestRecord) => Promise<void>;
  get: (token: string) => Promise<PendingRequestRecord | null>;
  delete: (token: string) => Promise<void>;
  update: (
    token: string,
    patch: Partial<PendingRequestRecord>,
  ) => Promise<void>;
}

export function createInMemoryPendingRequestStore(): PendingRequestStore {
  const store = new Map<string, PendingRequestRecord>();

  const prune = () => {
    const t = Date.now();
    for (const [k, v] of store.entries()) {
      if (t - v.createdAt > v.ttlMs) store.delete(k);
    }
  };

  return {
    async save(rec) {
      prune();
      store.set(rec.token, rec);
    },
    async get(token) {
      prune();
      return store.get(token) ?? null;
    },
    async delete(token) {
      store.delete(token);
    },
    async update(token, patch) {
      const prev = store.get(token);
      if (!prev) return;
      store.set(token, { ...prev, ...patch });
    },
  };
}
