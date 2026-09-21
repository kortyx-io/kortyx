import { describe, expect, it } from "vitest";
import {
  effectiveInterruptStatus,
  interruptInteractionLabel,
  interruptTimingPresentation,
  interruptTypeLabel,
} from "@/features/interrupts/lib/interrupt-presentation";

const createdAt = "2026-07-26T12:00:00.000Z";
const expiresAt = "2026-07-26T12:15:00.000Z";

describe("interrupt timing presentation", () => {
  it("shows remaining time while a request is pending", () => {
    const now = Date.parse("2026-07-26T12:12:00.000Z");
    const interrupt = {
      status: "pending" as const,
      createdAt,
      expiresAt,
    };

    expect(effectiveInterruptStatus(interrupt, now)).toBe("pending");
    expect(interruptTimingPresentation(interrupt, now).label).toBe(
      "Waiting 12m · expires in 3m",
    );
  });

  it("caps request lifetime at expiry and reports time since expiry", () => {
    const now = Date.parse("2026-07-26T12:21:00.000Z");
    const interrupt = {
      status: "pending" as const,
      createdAt,
      expiresAt,
    };

    expect(effectiveInterruptStatus(interrupt, now)).toBe("expired");
    expect(interruptTimingPresentation(interrupt, now).label).toBe(
      "Expired after 15m · 6m ago",
    );
  });

  it("reports terminal resolution time", () => {
    expect(
      interruptTimingPresentation(
        {
          status: "resolved",
          createdAt,
          resolvedAt: "2026-07-26T12:00:34.000Z",
          expiresAt,
        },
        Date.parse("2026-07-26T13:00:00.000Z"),
      ).label,
    ).toBe("Resolved in 34s");
  });
});

describe("interrupt contract presentation", () => {
  it("distinguishes a structured contract from a legacy dynamic picker", () => {
    expect(
      interruptInteractionLabel({
        interactionMode: "dynamic-picker",
        type: "structured",
        optionCount: 0,
      }),
    ).toBe("Contract UI");
    expect(interruptTypeLabel("structured")).toBe("Structured contract");
    expect(
      interruptInteractionLabel({
        interactionMode: "dynamic-picker",
        type: "choice",
        optionCount: 0,
      }),
    ).toBe("Dynamic picker");
  });
});
