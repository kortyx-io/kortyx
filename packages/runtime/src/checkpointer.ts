import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { createInMemoryCheckpointSaver } from "./framework/in-memory-checkpointer";

const MAX_CHECKPOINTERS = 200;
const map = new Map<string, BaseCheckpointSaver>();

export function getCheckpointer(key: string): BaseCheckpointSaver {
  const k = key || "__default__";
  const existing = map.get(k);
  if (existing) return existing;

  const saver = createInMemoryCheckpointSaver();
  map.set(k, saver);

  // Simple FIFO eviction to avoid unbounded growth in long-lived dev servers.
  if (map.size > MAX_CHECKPOINTERS) {
    const first = map.keys().next().value as string | undefined;
    if (first) map.delete(first);
  }

  return saver;
}
