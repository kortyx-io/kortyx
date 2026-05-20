// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useChatStreamDebug } from "../src";

describe("useChatStreamDebug", () => {
  it("records an initial status chunk and appended chunks with metadata", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T10:00:00.000Z"));

    const { result } = renderHook(() => useChatStreamDebug());

    let recorder: ReturnType<typeof result.current.createRecorder> | undefined;
    act(() => {
      recorder = result.current.createRecorder("starting");
    });
    if (!recorder) {
      throw new Error("Expected recorder to be created.");
    }
    const createdRecorder = recorder;

    vi.setSystemTime(new Date("2026-04-23T10:00:01.000Z"));
    act(() => {
      createdRecorder.push({
        type: "message",
        content: "hello",
      });
    });

    expect(result.current.streamDebug).toHaveLength(2);
    expect(result.current.streamDebug[0]).toMatchObject({
      type: "status",
      message: "starting",
      _seq: 0,
      _dt: 0,
    });
    expect(result.current.streamDebug[1]).toMatchObject({
      type: "message",
      content: "hello",
      _seq: 1,
      _dt: 1000,
    });
    expect(createdRecorder.getAll()).toHaveLength(2);

    vi.useRealTimers();
  });

  it("caps streamDebug at the trailing 1000 chunks while preserving order and seq", () => {
    const { result } = renderHook(() => useChatStreamDebug());

    let recorder: ReturnType<typeof result.current.createRecorder> | undefined;
    act(() => {
      recorder = result.current.createRecorder("starting");
    });
    if (!recorder) throw new Error("Expected recorder to be created.");
    const createdRecorder = recorder;

    const total = 1500;
    act(() => {
      for (let i = 0; i < total; i += 1) {
        createdRecorder.push({
          type: "status",
          message: `msg-${i}`,
        });
      }
    });

    const debug = result.current.streamDebug;

    expect(debug.length).toBe(1001);
    expect(debug.at(0)).toMatchObject({
      type: "status",
      message: `msg-${total - 1001}`,
    });
    expect(debug.at(-1)).toMatchObject({
      type: "status",
      message: `msg-${total - 1}`,
    });

    const seqs = debug.map(
      (chunk) => (chunk as unknown as { _seq: number })._seq,
    );
    for (let i = 1; i < seqs.length; i += 1) {
      const prev = seqs[i - 1];
      const cur = seqs[i];
      expect(typeof prev).toBe("number");
      expect(typeof cur).toBe("number");
      expect((cur as number) - (prev as number)).toBe(1);
    }

    expect(createdRecorder.getAll().length).toBe(total + 1);
    const fullSeqs = createdRecorder
      .getAll()
      .map((chunk) => (chunk as unknown as { _seq: number })._seq);
    expect(fullSeqs[0]).toBe(0);
    expect(fullSeqs.at(-1)).toBe(total);
  });

  it("clears current debug state without mutating recorder history", () => {
    const { result } = renderHook(() => useChatStreamDebug());

    let recorder: ReturnType<typeof result.current.createRecorder> | undefined;
    act(() => {
      recorder = result.current.createRecorder("starting");
      recorder.push({
        type: "status",
        message: "next",
      });
    });
    if (!recorder) {
      throw new Error("Expected recorder to be created.");
    }

    expect(result.current.streamDebug).toHaveLength(2);

    act(() => {
      result.current.clearStreamDebug();
    });

    expect(result.current.streamDebug).toEqual([]);
    expect(recorder.getAll()).toHaveLength(2);
  });
});
