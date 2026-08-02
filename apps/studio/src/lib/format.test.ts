import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatCurrency,
  formatDateTime,
  formatDurationMs,
  formatDurationSeconds,
  formatRelativeTime,
} from "./format";

describe("Studio formatting", () => {
  it("rolls explicit millisecond durations through weeks", () => {
    expect(formatDurationMs(0)).toBe("0 ms");
    expect(formatDurationMs(999)).toBe("999 ms");
    expect(formatDurationMs(1_250)).toBe("1.25s");
    expect(formatDurationMs(12_500)).toBe("12.5s");
    expect(formatDurationMs(60_000)).toBe("1m");
    expect(formatDurationMs(61_000)).toBe("1m 1s");
    expect(formatDurationMs(3_660_000)).toBe("1h 1m");
    expect(formatDurationMs(90_000_000)).toBe("1d 1h");
    expect(formatDurationMs(691_200_000)).toBe("1w 1d");
  });

  it("keeps explicit seconds equivalent to milliseconds", () => {
    expect(formatDurationSeconds(61)).toBe(formatDurationMs(61_000));
    expect(formatDurationSeconds(691_200)).toBe("1w 1d");
  });

  it("provides full duration precision for titles and accessible text", () => {
    expect(
      formatDurationMs(788_645_678, {
        style: "full",
      }),
    ).toBe("1w 2d 3h 4m 5.678s");
  });

  it("handles invalid and extremely large durations safely", () => {
    expect(formatDurationMs(Number.NaN)).toBe("—");
    expect(formatDurationMs(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatDurationSeconds(-1)).toBe("—");
    expect(formatDurationSeconds(2_345_234_563_245_345)).toMatch(/w/);
    expect(formatDurationMs(null, { fallback: "Active" })).toBe("Active");
  });

  it("formats relative time through weeks and handles future dates", () => {
    const now = Date.parse("2026-07-25T12:00:00.000Z");
    expect(formatRelativeTime("2026-07-25T11:59:55.000Z", now)).toBe("5s ago");
    expect(formatRelativeTime("2026-07-16T12:00:00.000Z", now)).toBe("1w ago");
    expect(formatRelativeTime("2026-07-25T12:05:00.000Z", now)).toBe("in 5m");
    expect(formatRelativeTime("invalid", now)).toBe("—");
  });

  it("formats compact and exact counts consistently", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(4_819)).toBe("4.8K");
    expect(formatCount(4_819, { compact: false })).toBe("4,819");
    expect(formatCount(-1)).toBe("—");
  });

  it("preserves small currency values and rejects invalid numbers", () => {
    expect(formatCurrency(0.0038)).toBe("$0.0038");
    expect(formatCurrency(12.5, { currency: "EUR" })).toBe("€12.50");
    expect(formatCurrency(null, { fallback: "Unknown" })).toBe("Unknown");
    expect(formatCurrency(Number.NaN)).toBe("—");
  });

  it("formats dates deterministically in UTC", () => {
    expect(formatDateTime("2026-07-25T14:26:13.000Z")).toBe(
      "Jul 25, 2026, 14:26:13 UTC",
    );
    expect(formatDateTime("invalid")).toBe("—");
  });
});
