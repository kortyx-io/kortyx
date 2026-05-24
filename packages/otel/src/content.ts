import type { OpenTelemetryTraceAdapterOptions } from "./types";

export type ContentCaptureSide = "input" | "output";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const shouldCapture = (
  value: OpenTelemetryTraceAdapterOptions["captureContent"],
  side: ContentCaptureSide,
): boolean => {
  if (value === true) return true;
  if (!isRecord(value)) return false;
  return Boolean(value[side]);
};
