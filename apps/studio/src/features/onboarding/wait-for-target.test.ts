// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { waitForTourTarget } from "./wait-for-target";

afterEach(() => vi.useRealTimers());

it("waits for the route and its target instead of accepting the previous page", async () => {
  vi.useFakeTimers();
  let ready = false;
  let resolved = false;
  const waiting = waitForTourTarget(
    () => ready,
    new AbortController().signal,
  ).then(() => {
    resolved = true;
  });
  await vi.advanceTimersByTimeAsync(32);
  expect(resolved).toBe(false);
  ready = true;
  await vi.advanceTimersByTimeAsync(32);
  await waiting;
  expect(resolved).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds missing-target waits and cleans up polling", async () => {
  vi.useFakeTimers();
  const waiting = expect(
    waitForTourTarget(() => false, new AbortController().signal, 50),
  ).rejects.toThrow("Tour target unavailable");
  await vi.advanceTimersByTimeAsync(50);
  await waiting;
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels immediately when the tour exits", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const waiting = expect(
    waitForTourTarget(() => false, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await waiting;
  expect(vi.getTimerCount()).toBe(0);
});
