import { expect, it, vi } from "vitest";
import {
  associateEvalExecution,
  getEvalAttemptId,
  withEvalAttribution,
} from "../src/eval-attribution";

it("isolates nested and concurrent attempt scopes and restores context after failure", async () => {
  const execution = { runId: "run", sessionId: "session" };
  associateEvalExecution(execution);
  expect(getEvalAttemptId()).toBeUndefined();
  await Promise.all(
    ["A", "B"].map((attemptId) =>
      withEvalAttribution({ attemptId, onExecution: vi.fn() }, async () => {
        await Promise.resolve();
        expect(getEvalAttemptId()).toBe(attemptId);
        associateEvalExecution(execution);
        expect(() =>
          withEvalAttribution(undefined, () => {
            expect(getEvalAttemptId()).toBeUndefined();
            throw new Error("judge");
          }),
        ).toThrow("judge");
        expect(getEvalAttemptId()).toBe(attemptId);
      }),
    ),
  );
  expect(getEvalAttemptId()).toBeUndefined();
});

it("captures original eval errors in scope and isolates observer failures", async () => {
  const { observeEvalError } = await import("../src/eval-attribution");
  const error = new Error("original");
  observeEvalError(error);
  const onError = vi.fn();
  withEvalAttribution(
    { attemptId: "error", onExecution: vi.fn(), onError },
    () => observeEvalError(error),
  );
  expect(onError).toHaveBeenCalledWith(error);
  expect(() =>
    withEvalAttribution(
      {
        attemptId: "broken",
        onExecution: vi.fn(),
        onError: () => {
          throw new Error("exporter");
        },
      },
      () => observeEvalError(error),
    ),
  ).not.toThrow();
});
