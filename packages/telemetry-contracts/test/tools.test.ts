import { describe, expect, it } from "vitest";
import { TelemetryEventSchema } from "../src";

const event = (type: string, payload: Record<string, unknown>) => ({
  schemaVersion: 1,
  eventId: "event",
  occurredAt: "2026-09-18T00:00:00.000Z",
  environment: "test",
  service: { name: "test" },
  correlation: { runId: "run", workflowId: "workflow" },
  type,
  payload,
});
const fact = {
  version: 1,
  name: "lookup",
  toolCallId: "logical-call",
  attemptId: "attempt",
  callingMode: "direct",
  executed: true,
  outcome: "denied",
  denialCode: "NOT_ALLOWED",
  durationMs: 5,
};

describe("safe canonical tool contract", () => {
  it("accepts explicit denial inside an ordinary run envelope", () =>
    expect(
      TelemetryEventSchema.safeParse(event("tool.denied", fact)).success,
    ).toBe(true));
  it.each([
    { input: "PRIVATE" },
    { result: "PRIVATE" },
    { credentials: "PRIVATE" },
    { durationMs: -1 },
    { denialCode: "private code" },
    { outcome: "fault" },
  ])("rejects unsafe or inconsistent facts %o", (override) =>
    expect(
      TelemetryEventSchema.safeParse(
        event("tool.denied", { ...fact, ...override }),
      ).success,
    ).toBe(false));
  it("requires a source for cached reuse and forbids execution claims", () => {
    const reuse = {
      ...fact,
      executed: false,
      observationKind: "reused",
      source: {
        runId: "source",
        toolCallId: "logical-call",
        attemptId: "actual",
      },
    };
    expect(
      TelemetryEventSchema.safeParse(event("tool.reused", reuse)).success,
    ).toBe(true);
    expect(
      TelemetryEventSchema.safeParse(
        event("tool.reused", { ...reuse, executed: true }),
      ).success,
    ).toBe(false);
    expect(
      TelemetryEventSchema.safeParse(
        event("tool.reused", { ...reuse, source: undefined }),
      ).success,
    ).toBe(false);
  });
  it("keeps previous SDK payloads readable", () =>
    expect(
      TelemetryEventSchema.safeParse(
        event("tool.started", { tool: "lookup", toolCallId: "legacy" }),
      ).success,
    ).toBe(true));
});

it("accepts bounded tool fault diagnostics and rejects stacks and non-fault error fields", () => {
  const fault = {
    ...fact,
    outcome: "fault",
    denialCode: undefined,
    errorType: "TypeError",
    errorMessage: "list_jobs unavailable",
  };
  expect(
    TelemetryEventSchema.safeParse(event("tool.failed", fault)).success,
  ).toBe(true);
  for (const override of [
    { errorMessage: "x".repeat(8193) },
    { errorType: "x".repeat(257) },
    { stack: "PRIVATE_STACK" },
    { outcome: "success" },
  ])
    expect(
      TelemetryEventSchema.safeParse(
        event("tool.failed", { ...fault, ...override }),
      ).success,
    ).toBe(false);
  expect(
    TelemetryEventSchema.safeParse(
      event("tool.denied", { ...fact, errorMessage: "message" }),
    ).success,
  ).toBe(false);
});
