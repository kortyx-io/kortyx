import type { GraphState } from "@kortyx/core";
import { expect, it, vi } from "vitest";
import { createResponseLifecycle } from "../src/stream/response-lifecycle";

const state = {} as GraphState;
it("detaches request cancellation only after finalization and shares concurrent completion", async () => {
  let release!: () => void;
  const request = new AbortController();
  const server = new AbortController();
  const onClosed = vi.fn();
  const finalize = vi.fn(
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  const response = createResponseLifecycle({
    enabled: true,
    restored: false,
    requestSignal: request.signal,
    executionSignal: server.signal,
    finalize,
    onClosed,
  });
  const first = response.complete({}, state);
  expect(response.complete({}, state)).toBe(first);
  expect(response.closed).toBe(false);
  release();
  await first;
  request.abort();
  response.disconnect();
  expect(response.signal.aborted).toBe(false);
  expect(response.closed).toBe(true);
  expect(onClosed).toHaveBeenCalledOnce();
  await response.complete({}, state);
  expect(finalize).toHaveBeenCalledOnce();
  server.abort();
  expect(response.signal.aborted).toBe(true);
  response.dispose();
});
it("pre-aborted execution cancels even restored responses; restored request signals do not", async () => {
  const finalize = vi.fn();
  const restored = createResponseLifecycle({
    enabled: true,
    restored: true,
    requestSignal: AbortSignal.abort(),
    finalize,
    onClosed: vi.fn(),
  });
  expect(restored.signal.aborted).toBe(false);
  restored.dispose();
  const cancelled = createResponseLifecycle({
    enabled: true,
    restored: false,
    executionSignal: AbortSignal.abort(),
    finalize,
    onClosed: vi.fn(),
  });
  await expect(cancelled.complete({}, state)).rejects.toMatchObject({
    name: "AbortError",
  });
  cancelled.dispose();
});
it("cancellation during finalization wins; failures never claim completion", async () => {
  const request = new AbortController();
  const onClosed = vi.fn();
  const response = createResponseLifecycle({
    enabled: true,
    restored: false,
    requestSignal: request.signal,
    finalize: async () => {
      request.abort();
    },
    onClosed,
  });
  await expect(response.complete({}, state)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(response.closed).toBe(false);
  expect(onClosed).not.toHaveBeenCalled();
  response.dispose();
  const failed = createResponseLifecycle({
    enabled: true,
    restored: false,
    finalize: async () => {
      throw new Error("storage unavailable");
    },
    onClosed,
  });
  await expect(failed.complete({}, state)).rejects.toThrow(
    "storage unavailable",
  );
  expect(failed.closed).toBe(false);
  failed.dispose();
});
it("pre-aborted requests cannot complete a foreground response", async () => {
  const response = createResponseLifecycle({
    enabled: true,
    restored: false,
    requestSignal: AbortSignal.abort(),
    finalize: vi.fn(),
    onClosed: vi.fn(),
  });
  await expect(response.complete({}, state)).rejects.toMatchObject({
    name: "AbortError",
  });
  response.dispose();
});
