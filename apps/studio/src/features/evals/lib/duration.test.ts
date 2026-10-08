import { describe, expect, it } from "vitest";
import { evalDurationMs } from "./duration";

const startedAt = "2026-10-08T12:00:00.000Z";
const start = Date.parse(startedAt);

describe("eval duration", () => {
  it("counts active runs from their start, including time spent grading", () => {
    const run = { status: "running", startedAt };
    expect(evalDurationMs(run, start + 1_000)).toBe(1_000);
    expect(evalDurationMs(run, start + 2_000)).toBe(2_000);
  });

  it.each([
    "passed",
    "failed",
    "error",
    "cancelled",
  ])("freezes %s runs at their recorded end time", (status) => {
    const run = {
      status,
      startedAt,
      endedAt: "2026-10-08T12:00:05.000Z",
    };
    expect(evalDurationMs(run, start + 10_000)).toBe(5_000);
    expect(evalDurationMs(run, start + 20_000)).toBe(5_000);
    expect(evalDurationMs({ ...run, status: "running" }, start + 20_000)).toBe(
      5_000,
    );
  });

  it("does not invent durations for queued or incomplete records", () => {
    expect(evalDurationMs({ status: "queued" }, start)).toBeUndefined();
    expect(
      evalDurationMs({ status: "error", startedAt }, start),
    ).toBeUndefined();
    expect(
      evalDurationMs({ status: "running", startedAt }, null),
    ).toBeUndefined();
    expect(
      evalDurationMs({ status: "running", startedAt: "invalid" }, start),
    ).toBeUndefined();
    expect(
      evalDurationMs(
        { status: "passed", startedAt, endedAt: "invalid" },
        start,
      ),
    ).toBeUndefined();
  });

  it("clamps clock skew to zero", () => {
    expect(
      evalDurationMs({ status: "running", startedAt }, start - 1_000),
    ).toBe(0);
  });
});
