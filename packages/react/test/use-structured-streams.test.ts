// @vitest-environment jsdom

import type { StreamChunk, StructuredDataChunk } from "@kortyx/stream/browser";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStructuredStreams } from "../src";

type StructuredDataChunkInput = (
  | Omit<
      Extract<StructuredDataChunk, { kind: "set" }>,
      "type" | "streamId" | "dataType"
    >
  | Omit<
      Extract<StructuredDataChunk, { kind: "text-delta" }>,
      "type" | "streamId" | "dataType"
    >
  | Omit<
      Extract<StructuredDataChunk, { kind: "append" }>,
      "type" | "streamId" | "dataType"
    >
  | Omit<
      Extract<StructuredDataChunk, { kind: "final" }>,
      "type" | "streamId" | "dataType"
    >
) & {
  streamId?: string;
  dataType?: string;
};

const structuredChunk = (
  chunk: StructuredDataChunkInput,
): StructuredDataChunk =>
  ({
    type: "structured-data",
    streamId: chunk.streamId ?? "stream-1",
    dataType: chunk.dataType ?? "demo.data",
    ...chunk,
  }) as StructuredDataChunk;

describe("useStructuredStreams", () => {
  it("tracks multiple streamIds with stable first-seen ordering", () => {
    let seq = 0;
    const { result } = renderHook(() =>
      useStructuredStreams<Record<string, unknown>>({
        createId: () => `piece-${++seq}`,
      }),
    );

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "stream-a",
          kind: "set",
          path: "draft.body",
          value: "Hello",
        }),
      );
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "stream-b",
          kind: "final",
          data: { done: true },
        }),
      );
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items.map((item) => item.streamId)).toEqual([
      "stream-a",
      "stream-b",
    ]);
    expect(result.current.items.map((item) => item.id)).toEqual([
      "piece-1",
      "piece-2",
    ]);
    expect(result.current.byStreamId["stream-a"]).toMatchObject({
      status: "streaming",
      data: { draft: { body: "Hello" } },
    });
    expect(result.current.byStreamId["stream-b"]).toMatchObject({
      status: "done",
      data: { done: true },
    });
  });

  it("updates an existing item in place across partial and final chunks", () => {
    let seq = 0;
    const { result } = renderHook(() =>
      useStructuredStreams<{ body?: string; subject?: string }>({
        createId: () => `piece-${++seq}`,
      }),
    );

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          kind: "text-delta",
          path: "body",
          delta: "Hello",
        }),
      );
    });

    const initialItem = result.current.items[0];

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          kind: "final",
          data: {
            subject: "Final subject",
          },
        }),
      );
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.id).toBe(initialItem?.id);
    expect(result.current.items[0]?.state).toMatchObject({
      status: "done",
      data: {
        subject: "Final subject",
      },
    });
  });

  it("ignores non-structured chunks", () => {
    const { result } = renderHook(() => useStructuredStreams());

    let applied: ReturnType<typeof result.current.applyStreamChunk>;
    act(() => {
      applied = result.current.applyStreamChunk({
        type: "status",
        message: "debug",
      } as StreamChunk);
    });

    expect(applied).toBeUndefined();
    expect(result.current.items).toEqual([]);
    expect(result.current.byStreamId).toEqual({});
  });

  it("throws on chunks after final", () => {
    const { result } = renderHook(() => useStructuredStreams());

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          kind: "final",
          data: { done: true },
        }),
      );
    });

    expect(() =>
      act(() => {
        result.current.applyStreamChunk(
          structuredChunk({
            kind: "set",
            path: "done",
            value: false,
          }),
        );
      }),
    ).toThrow(
      "Structured stream stream-1 already completed with a final chunk.",
    );
  });

  it("seeds items from initialChunks on first render", () => {
    let seq = 0;
    const { result } = renderHook(() =>
      useStructuredStreams<Record<string, unknown>>({
        createId: () => `piece-${++seq}`,
        initialChunks: [
          structuredChunk({
            streamId: "seed-1",
            kind: "set",
            path: "draft.body",
            value: "Hello",
          }),
          structuredChunk({
            streamId: "seed-2",
            kind: "final",
            data: { done: true },
          }),
        ],
      }),
    );

    expect(result.current.items.map((item) => item.streamId)).toEqual([
      "seed-1",
      "seed-2",
    ]);
    expect(result.current.items[0]?.id).toBe("piece-1");
    expect(result.current.items[1]?.id).toBe("piece-2");
  });

  it("falls back to a non-crypto id generator when crypto is unavailable", () => {
    const originalCrypto = (globalThis as { crypto?: Crypto }).crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });

    try {
      const { result } = renderHook(() =>
        useStructuredStreams<Record<string, unknown>>({
          initialChunks: [
            structuredChunk({
              streamId: "seed-1",
              kind: "set",
              path: "body",
              value: "Hello",
            }),
          ],
        }),
      );

      expect(result.current.items).toHaveLength(1);
      expect(typeof result.current.items[0]?.id).toBe("string");
      expect(result.current.items[0]?.id.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it("preserves siblings when updating a stream that is not the last item", () => {
    let seq = 0;
    const { result } = renderHook(() =>
      useStructuredStreams<Record<string, unknown>>({
        createId: () => `piece-${++seq}`,
      }),
    );

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "stream-a",
          kind: "set",
          path: "body",
          value: "first",
        }),
      );
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "stream-b",
          kind: "set",
          path: "body",
          value: "second",
        }),
      );
    });

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "stream-a",
          kind: "set",
          path: "body",
          value: "updated",
        }),
      );
    });

    expect(result.current.items.map((item) => item.streamId)).toEqual([
      "stream-a",
      "stream-b",
    ]);
    expect(result.current.items[0]?.state.data).toMatchObject({
      body: "updated",
    });
    expect(result.current.items[1]?.state.data).toMatchObject({
      body: "second",
    });
  });

  it("keeps three interleaved streams ordered and resolves each final state independently", () => {
    let seq = 0;
    const { result } = renderHook(() =>
      useStructuredStreams<Record<string, unknown>>({
        createId: () => `piece-${++seq}`,
      }),
    );

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "alpha",
          kind: "text-delta",
          path: "body",
          delta: "A1-",
        }),
      );
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "beta",
          kind: "set",
          path: "score",
          value: 1,
        }),
      );
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "gamma",
          kind: "set",
          path: "label",
          value: "first",
        }),
      );
    });

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "beta",
          kind: "set",
          path: "score",
          value: 2,
        }),
      );
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "alpha",
          kind: "text-delta",
          path: "body",
          delta: "A2",
        }),
      );
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "gamma",
          kind: "final",
          data: { label: "final-gamma" },
        }),
      );
    });

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "alpha",
          kind: "final",
          data: { body: "A1-A2-final" },
        }),
      );
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "beta",
          kind: "final",
          data: { score: 99 },
        }),
      );
    });

    expect(result.current.items.map((item) => item.streamId)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(result.current.items.map((item) => item.state.status)).toEqual([
      "done",
      "done",
      "done",
    ]);
    expect(result.current.byStreamId.alpha?.data).toMatchObject({
      body: "A1-A2-final",
    });
    expect(result.current.byStreamId.beta?.data).toMatchObject({ score: 99 });
    expect(result.current.byStreamId.gamma?.data).toMatchObject({
      label: "final-gamma",
    });
  });

  it("supports lookup and clear", () => {
    const { result } = renderHook(() => useStructuredStreams());

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "stream-a",
          kind: "set",
          path: "draft.body",
          value: "Hello",
        }),
      );
    });

    expect(result.current.get("stream-a")).toMatchObject({
      streamId: "stream-a",
      state: {
        data: {
          draft: {
            body: "Hello",
          },
        },
      },
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.byStreamId).toEqual({});
    expect(result.current.get("stream-a")).toBeUndefined();
  });

  it("deletes existing streams and reports misses without changing items", () => {
    const { result } = renderHook(() => useStructuredStreams());

    act(() => {
      result.current.applyStreamChunk(
        structuredChunk({
          streamId: "stream-1",
          kind: "set",
          path: "body",
          value: "Hello",
        }),
      );
    });

    act(() => {
      expect(result.current.delete("missing")).toBe(false);
    });
    expect(result.current.items).toHaveLength(1);

    act(() => {
      expect(result.current.delete("stream-1")).toBe(true);
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.byStreamId).toEqual({});
  });
});
