import { describe, expect, it, vi } from "vitest";
import { createSessionColumns } from "@/features/sessions/components/session-table-columns";
import type { Session } from "@/features/sessions/schema";

const interruptedSession: Session = {
  id: "session-1",
  status: "interrupted",
  lastActivityAt: "2026-07-26T09:00:00.000Z",
  workflow: "workflow",
  workflowCount: 1,
  version: "1.0.0",
  runs: 1,
  succeeded: 0,
  failed: 0,
  interrupted: 1,
  duration: 4.742,
  latestResult: "Input expired",
  pendingInterrupt: "human-1",
  interruptStatus: "expired",
  interruptExpiresAt: "2026-07-26T09:15:00.000Z",
  providers: ["Google"],
  models: ["gemini-2.5-flash"],
  tags: [],
  environment: "test",
};

describe("session table columns", () => {
  it("does not add human wait time to interrupted session duration", () => {
    const columns = createSessionColumns({
      now: Date.parse("2026-07-26T12:00:00.000Z"),
      onCopy: vi.fn(),
    });
    const duration = columns.find((column) => column.key === "duration");

    expect(duration?.cellTitle?.(interruptedSession)).toBe("4.742s");
  });
});
