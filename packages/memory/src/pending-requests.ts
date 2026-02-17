import type { GraphState } from "@kortyx/core";

export type HumanInputKind = "choice" | "multi-choice" | "text";

export interface HumanInputOption {
  id: string;
  label: string;
  description?: string;
  // Canonical value for server-side application (e.g., { lat, lon })
  value?: unknown;
}

export interface PendingRequestRecord {
  token: string;
  requestId: string;
  sessionId?: string | undefined;
  workflow: string;
  node: string;
  state?: GraphState;
  schema: {
    kind: HumanInputKind;
    multiple: boolean;
    question?: string;
    id?: string;
    schemaId?: string;
    schemaVersion?: string;
    meta?: Record<string, unknown>;
  };
  options: HumanInputOption[];
  createdAt: number;
  ttlMs: number;
}

const store = new Map<string, PendingRequestRecord>();

function now() {
  return Date.now();
}

function prune() {
  const t = now();
  for (const [k, v] of store.entries()) {
    if (t - v.createdAt > v.ttlMs) store.delete(k);
  }
}

export function savePendingRequest(rec: PendingRequestRecord) {
  prune();
  store.set(rec.token, rec);
}

export function getPendingRequest(token: string): PendingRequestRecord | null {
  prune();
  return store.get(token) ?? null;
}

export function deletePendingRequest(token: string) {
  store.delete(token);
}

export function updatePendingRequest(
  token: string,
  patch: Partial<PendingRequestRecord>,
) {
  const prev = store.get(token);
  if (!prev) return;
  const next = { ...prev, ...patch } as PendingRequestRecord;
  store.set(token, next);
}
