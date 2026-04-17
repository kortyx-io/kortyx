import type { StreamChunk } from "../types/stream-chunk";
import type { StructuredDataChunk } from "../types/structured-data";
import {
  applyStructuredChunk,
  type StructuredStreamState,
} from "./apply-structured-chunk";

export type StructuredStreamAccumulator<TData = unknown> = {
  apply: (chunk: StructuredDataChunk) => StructuredStreamState<TData>;
  applyStreamChunk: (
    chunk: StreamChunk,
  ) => StructuredStreamState<TData> | undefined;
  get: (streamId: string) => StructuredStreamState<TData> | undefined;
  has: (streamId: string) => boolean;
  delete: (streamId: string) => boolean;
  clear: () => void;
  size: () => number;
  entries: () => Array<[string, StructuredStreamState<TData>]>;
  values: () => StructuredStreamState<TData>[];
  toRecord: () => Record<string, StructuredStreamState<TData>>;
};

const isStructuredDataChunk = (
  chunk: StreamChunk,
): chunk is StructuredDataChunk => chunk.type === "structured-data";

export function createStructuredStreamAccumulator<TData = unknown>(
  initialChunks: Iterable<StructuredDataChunk> = [],
): StructuredStreamAccumulator<TData> {
  const states = new Map<string, StructuredStreamState<TData>>();

  const apply = (chunk: StructuredDataChunk): StructuredStreamState<TData> => {
    const nextState = applyStructuredChunk(states.get(chunk.streamId), chunk);
    states.set(chunk.streamId, nextState);
    return nextState;
  };

  for (const chunk of initialChunks) {
    apply(chunk);
  }

  return {
    apply,
    applyStreamChunk: (chunk) => {
      if (!isStructuredDataChunk(chunk)) return undefined;
      return apply(chunk);
    },
    get: (streamId) => states.get(streamId),
    has: (streamId) => states.has(streamId),
    delete: (streamId) => states.delete(streamId),
    clear: () => {
      states.clear();
    },
    size: () => states.size,
    entries: () => Array.from(states.entries()),
    values: () => Array.from(states.values()),
    toRecord: () => Object.fromEntries(states.entries()),
  };
}
