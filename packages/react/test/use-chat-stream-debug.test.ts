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
