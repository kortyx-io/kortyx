import { afterEach, describe, expect, it, vi } from "vitest";
import { createRunColumns } from "@/features/runs/components/run-table-columns";
import type { Run } from "@/features/runs/schema";

const runningRun: Run = {
  id: "run-1",
  status: "running",
  started: "1h ago",
  startedAt: "2026-07-26T09:00:00.000Z",
  workflow: "workflow",
  version: "1.0.0",
  path: ["node"],
  session: "session",
  model: "model",
  duration: 0,
  result: "Running",
  provider: "Provider",
  environment: "test",
  user: "user",
  tenant: "tenant",
  hasTool: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("run table columns", () => {
  it("derives active duration from the supplied render clock", () => {
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-07-26T12:00:00.000Z"),
    );
    const columns = createRunColumns({
      now: Date.parse("2026-07-26T10:00:00.000Z"),
      onToggleStatus: vi.fn(),
      onCopy: vi.fn(),
    });
    const duration = columns.find((column) => column.key === "duration");

    expect(duration?.cellTitle?.(runningRun)).toBe("1h");
  });

  it("keeps invalid active timestamps stable", () => {
    const columns = createRunColumns({
      now: Date.parse("2026-07-26T10:00:00.000Z"),
      onToggleStatus: vi.fn(),
      onCopy: vi.fn(),
    });
    const duration = columns.find((column) => column.key === "duration");

    expect(
      duration?.cellTitle?.({
        ...runningRun,
        startedAt: "invalid",
        duration: 12.5,
      }),
    ).toBe("12.5s");
  });

  it("freezes interrupted execution duration at the projected boundary", () => {
    const columns = createRunColumns({
      now: Date.parse("2026-07-26T12:00:00.000Z"),
      onToggleStatus: vi.fn(),
      onCopy: vi.fn(),
    });
    const duration = columns.find((column) => column.key === "duration");

    expect(
      duration?.cellTitle?.({
        ...runningRun,
        status: "interrupted",
        duration: 4.742,
        interruptStatus: "expired",
        interruptExpiresAt: "2026-07-26T09:15:00.000Z",
      }),
    ).toBe("4.742s");
  });
});
