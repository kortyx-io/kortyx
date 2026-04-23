// @vitest-environment jsdom

import type { StreamChunk, StructuredDataChunk } from "@kortyx/stream/browser";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStructuredStreams } from "../src";

const structuredChunk = (
  chunk: Omit<StructuredDataChunk, "type" | "streamId" | "dataType"> & {
    streamId?: string;
    dataType?: string;
  },
): StructuredDataChunk => ({
  type: "structured-data",
  streamId: chunk.streamId ?? "stream-1",
  dataType: chunk.dataType ?? "demo.data",
  ...chunk,
});

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
});
