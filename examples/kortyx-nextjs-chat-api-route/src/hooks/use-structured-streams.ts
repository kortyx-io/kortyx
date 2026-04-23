"use client";

import {
  createStructuredStreamAccumulator,
  type StreamChunk,
} from "kortyx/browser";
import { useCallback, useMemo, useRef, useState } from "react";
import type { StructuredData } from "@/lib/chat-types";

export type StructuredStreamItem = {
  id: string;
  streamId: string;
  state: StructuredData;
};

export function useStructuredStreams(args: { createId: () => string }) {
  const accumulatorRef = useRef(
    createStructuredStreamAccumulator<Record<string, unknown>>(),
  );
  const itemsRef = useRef<StructuredStreamItem[]>([]);
  const [items, setItems] = useState<StructuredStreamItem[]>([]);

  const setNextItems = useCallback((nextItems: StructuredStreamItem[]) => {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);

  const applyStreamChunk = useCallback(
    (chunk: StreamChunk): StructuredStreamItem | undefined => {
      if (chunk.type !== "structured-data") return undefined;

      const nextState = accumulatorRef.current.apply(chunk) as StructuredData;
      const currentItems = itemsRef.current;
      const existingIndex = currentItems.findIndex(
        (item) => item.streamId === nextState.streamId,
      );
      const existingItem =
        existingIndex >= 0 ? currentItems[existingIndex] : undefined;

      const nextItem: StructuredStreamItem = existingItem
        ? {
            ...existingItem,
            state: nextState,
          }
        : {
            id: args.createId(),
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
    [args, setNextItems],
  );

  const clear = useCallback(() => {
    accumulatorRef.current =
      createStructuredStreamAccumulator<Record<string, unknown>>();
    setNextItems([]);
  }, [setNextItems]);

  const get = useCallback((streamId: string) => {
    return itemsRef.current.find((item) => item.streamId === streamId);
  }, []);

  const byStreamId = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => [item.streamId, item.state]),
      ) as Record<string, StructuredData>,
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
