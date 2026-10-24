import { expect, it, vi } from "vitest";
import { EvalGradingTimeoutError, withEvalGradingTimeout } from "../src/evals";
import { createEvalIssue } from "../src/evals/errors";

it("supports budgets above a minute, clears timers, and captures timeout facts", async () => {
  vi.useFakeTimers();
  try {
    const parent = new AbortController();
    const pass = withEvalGradingTimeout(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 90_000));
        return "verdict";
      },
      parent.signal,
      120_000,
    );
    const settled = pass.then((value) => ({ value }));
    await vi.advanceTimersByTimeAsync(90_000);
    expect(await settled).toEqual({ value: "verdict" });
    expect(vi.getTimerCount()).toBe(0);
    const stalled = withEvalGradingTimeout(
      () => new Promise<never>(() => {}),
      parent.signal,
      180_000,
    ).catch((error) => error);
    await vi.advanceTimersByTimeAsync(180_000);
    const error = await stalled;
    expect(error).toBeInstanceOf(EvalGradingTimeoutError);
    const issue = createEvalIssue("grading", error);
    expect(issue).toMatchObject({
      code: "EVAL_GRADING_TIMEOUT",
      details: { timeoutMs: 180_000 },
      message: "Grading exceeded its configured 180-second time limit.",
    });
    expect(issue.exception?.data.message).toBe(issue.message);
    expect(issue.exception?.data.type).toBe("EvalGradingTimeoutError");
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("propagates cancellation before the grading deadline and ignores late results", async () => {
  const parent = new AbortController();
  let finish: (value: string) => void = () => {};
  const pending = withEvalGradingTimeout(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    parent.signal,
    10000,
  ).catch((error) => error);
  await Promise.resolve();
  const cancelled = new Error("Evaluation cancelled");
  parent.abort(cancelled);
  expect(await pending).toBe(cancelled);
  finish("too late");
  await Promise.resolve();
  await Promise.resolve();
});

it.each([
  0,
  -1,
  0.5,
  2_147_483_648,
  Infinity,
])("rejects an unsupported grading budget: %s", async (timeoutMs) => {
  await expect(
    withEvalGradingTimeout(
      () => "unused",
      new AbortController().signal,
      timeoutMs,
    ),
  ).rejects.toThrow(RangeError);
});

it("uses the built-in budget and preserves cancellation before execution starts", async () => {
  const parent = new AbortController();
  const run = vi.fn(() => "verdict");
  expect(await withEvalGradingTimeout(run, parent.signal)).toBe("verdict");
  const cancelled = new Error("Cancelled before grading");
  parent.abort(cancelled);
  await expect(withEvalGradingTimeout(run, parent.signal)).rejects.toBe(
    cancelled,
  );
  expect(run).toHaveBeenCalledOnce();
});

it("does not start a judge when cancelled before its scheduled callback", async () => {
  const parent = new AbortController();
  const run = vi.fn(() => "unused");
  const pending = withEvalGradingTimeout(run, parent.signal);
  const cancelled = new Error("Cancelled while scheduling grading");
  parent.abort(cancelled);
  await expect(pending).rejects.toBe(cancelled);
  expect(run).not.toHaveBeenCalled();
});
