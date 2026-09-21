import type {
  StudioDetailEvent,
  StudioInterrupt,
} from "@kortyx/telemetry-contracts";
import { describe, expect, it } from "vitest";
import {
  compatibleStudioEvents,
  compatibleStudioInterrupt,
  currentStudioReadContract,
} from "../src/routes/studio-compatibility";

describe("Studio read compatibility", () => {
  it("negotiates the current protocol explicitly", () => {
    expect(currentStudioReadContract("1")).toBe(true);
    expect(currentStudioReadContract(undefined)).toBe(false);
    expect(currentStudioReadContract("2")).toBe(false);
  });

  it("projects current interrupt additions away for legacy clients", () => {
    const interrupt = {
      type: "structured",
      contract: "jobPicker",
      request: { question: "Which job?" },
      requestCaptured: true,
      responseValue: { jobId: "job-2" },
    } as unknown as StudioInterrupt;

    expect(compatibleStudioInterrupt(interrupt, true)).toBe(interrupt);
    expect(compatibleStudioInterrupt(interrupt, false)).toEqual({
      type: "unknown",
    });
  });

  it("omits event kinds unknown to legacy readers", () => {
    const events = [
      { type: "interrupt.created" },
      { type: "error.reported" },
      { type: "workflow.suspended" },
      { type: "workflow.resumed" },
      { type: "interrupt.resolved" },
    ] as StudioDetailEvent[];

    expect(
      compatibleStudioEvents(events, false).map((event) => event.type),
    ).toEqual(["interrupt.created", "interrupt.resolved"]);
  });
});
