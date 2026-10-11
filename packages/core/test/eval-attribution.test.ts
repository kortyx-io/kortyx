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
