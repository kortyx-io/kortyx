import {
  createStructuredStreamAccumulator,
  type StreamChunk,
  type StructuredDataChunk,
  type StructuredStreamState,
} from "@kortyx/stream/browser";
import { useCallback, useMemo, useRef, useState } from "react";

export type StructuredStreamItem<TData = unknown> = {
  id: string;
  streamId: string;
  state: StructuredStreamState<TData>;
};

export type UseStructuredStreamsOptions<_TData = unknown> = {
  createId?: (() => string) | undefined;
  initialChunks?: Iterable<StructuredDataChunk> | undefined;
};

export type UseStructuredStreamsResult<TData = unknown> = {
  items: StructuredStreamItem<TData>[];
  byStreamId: Record<string, StructuredStreamState<TData>>;
  applyStreamChunk: (
    chunk: StreamChunk,
  ) => StructuredStreamItem<TData> | undefined;
  clear: () => void;
  get: (streamId: string) => StructuredStreamItem<TData> | undefined;
};

const defaultCreateId = () => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {}

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export function useStructuredStreams<TData = unknown>(
  options?: UseStructuredStreamsOptions<TData> | undefined,
): UseStructuredStreamsResult<TData> {
  const createId = useRef(options?.createId ?? defaultCreateId).current;
  const initialChunks = useRef(options?.initialChunks ?? []).current;
  const accumulatorRef = useRef(
    createStructuredStreamAccumulator<TData>(initialChunks),
  );
  const initialItemsRef = useRef<StructuredStreamItem<TData>[] | undefined>(
    undefined,
  );

  if (initialItemsRef.current === undefined) {
    initialItemsRef.current = accumulatorRef.current
      .entries()
      .map(([streamId, state]) => ({
        id: createId(),
        streamId,
        state,
      }));
  }

  const itemsRef = useRef(initialItemsRef.current);
  const [items, setItems] = useState(initialItemsRef.current);

  const setNextItems = useCallback(
    (nextItems: StructuredStreamItem<TData>[]) => {
      itemsRef.current = nextItems;
      setItems(nextItems);
    },
    [],
  );

  const applyStreamChunk = useCallback(
    (chunk: StreamChunk): StructuredStreamItem<TData> | undefined => {
      const nextState = accumulatorRef.current.applyStreamChunk(chunk);
      if (!nextState) return undefined;

      const currentItems = itemsRef.current;
      const existingIndex = currentItems.findIndex(
        (item) => item.streamId === nextState.streamId,
      );
      const existingItem =
        existingIndex >= 0 ? currentItems[existingIndex] : undefined;

      const nextItem: StructuredStreamItem<TData> = existingItem
        ? {
            ...existingItem,
            state: nextState,
          }
        : {
            id: createId(),
            streamId: nextState.streamId,
            state: nextState,
          };

      const nextItems =
        existingIndex >= 0
          ? currentItems.map((item, index) =>
              index === existingIndex ? nextItem : item,
            )
          : [...currentItems, nextItem];

      setNextItems(nextItems);
      return nextItem;
    },
    [createId, setNextItems],
  );

  const clear = useCallback(() => {
    accumulatorRef.current = createStructuredStreamAccumulator<TData>();
    setNextItems([]);
  }, [setNextItems]);

  const get = useCallback((streamId: string) => {
    return itemsRef.current.find((item) => item.streamId === streamId);
  }, []);

  const byStreamId = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => [item.streamId, item.state]),
      ) as Record<string, StructuredStreamState<TData>>,
    [items],
  );

  return {
    items,
    byStreamId,
    applyStreamChunk,
    clear,
    get,
  };
}
