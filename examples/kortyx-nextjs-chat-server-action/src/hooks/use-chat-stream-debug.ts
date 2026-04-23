"use client";

import type { StreamChunk } from "kortyx/browser";
import { useCallback, useState } from "react";

type DebugChunk = StreamChunk & {
  _ts: number;
  _dt: number;
  _seq: number;
};

export function useChatStreamDebug() {
  const [streamDebug, setStreamDebug] = useState<StreamChunk[]>([]);

  const clearStreamDebug = useCallback(() => {
    setStreamDebug([]);
  }, []);

  const createRecorder = useCallback((initialMessage: string) => {
    let seq = 0;
    let lastTs = 0;
    const accDebug: StreamChunk[] = [];

    const push = (chunk: StreamChunk) => {
      const ts = Date.now();
      const withMeta: DebugChunk = {
        ...(chunk as StreamChunk),
        _ts: ts,
        _dt: lastTs ? ts - lastTs : 0,
        _seq: seq++,
      };
      lastTs = ts;
      accDebug.push(withMeta);
      setStreamDebug((current) =>
        current.length > 1000
          ? [...current.slice(-1000), withMeta]
          : [...current, withMeta],
      );
    };

    push({
      type: "status",
      message: initialMessage,
    } as StreamChunk);

    return {
      push,
      getAll: () => accDebug,
    };
  }, []);

  return {
    streamDebug,
    clearStreamDebug,
    createRecorder,
  };
}
