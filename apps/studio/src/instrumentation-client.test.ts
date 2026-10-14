// @vitest-environment jsdom
import { BProgress } from "@bprogress/core";
import { beforeEach, expect, it, vi } from "vitest";
import { onRouterTransitionStart } from "./instrumentation-client";

vi.mock("@bprogress/core", () => ({
  BProgress: { set: vi.fn().mockReturnThis(), start: vi.fn(), done: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/evals/runs");
});

it.each([
  "push",
  "replace",
] as const)("starts progress for native router %s before the route commits", (type) => {
  onRouterTransitionStart("/evals/runs/result?live=false", type);
  expect(BProgress.start).toHaveBeenCalledTimes(1);
  expect(window.location.pathname).toBe("/evals/runs");
});

it("does not leave progress running for same-URL or hash-only navigation", () => {
  onRouterTransitionStart("/evals/runs", "push");
  onRouterTransitionStart("/evals/runs#results", "replace");
  expect(BProgress.start).not.toHaveBeenCalled();
  expect(BProgress.done).toHaveBeenCalledTimes(2);
});

it("covers server-backed query changes", () => {
  onRouterTransitionStart("/evals/runs?q=example", "push");
  expect(BProgress.start).toHaveBeenCalledTimes(1);
});

it("starts on history traversal after the browser has already updated its URL", () => {
  window.history.replaceState({}, "", "/prompts");
  onRouterTransitionStart("/prompts", "traverse");
  expect(BProgress.start).toHaveBeenCalledTimes(1);
});
