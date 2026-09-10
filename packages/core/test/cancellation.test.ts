import { expect, it } from "vitest";
import {
  combineAbortSignals,
  createExecutionCancelledError,
  isExecutionCancelled,
  throwIfExecutionAborted,
} from "../src/cancellation";

it("combines signals without discarding cancellation or duplicating an identical signal", () => {
  const a = new AbortController();
  const b = new AbortController();
  expect(combineAbortSignals()).toBeUndefined();
  expect(combineAbortSignals(a.signal, undefined, a.signal)).toBe(a.signal);
  const combined = combineAbortSignals(a.signal, b.signal)!;
  throwIfExecutionAborted();
  throwIfExecutionAborted(combined);
  b.abort("reason");
  expect(combined.aborted).toBe(true);
  expect(() => throwIfExecutionAborted(combined)).toThrow(
    "Execution cancelled.",
  );
});
it("recognizes cancellation without class identity or converting ordinary errors", () => {
  for (const error of [
    createExecutionCancelledError(),
    { code: "EXECUTION_CANCELLED" },
    new DOMException("Aborted", "AbortError"),
  ])
    expect(isExecutionCancelled(error)).toBe(true);
  for (const error of [
    undefined,
    null,
    "AbortError",
    {},
    { code: "OTHER" },
    new Error("ordinary"),
  ])
    expect(isExecutionCancelled(error)).toBe(false);
});
