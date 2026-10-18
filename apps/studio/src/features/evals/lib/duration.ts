import { isActive } from "./presentation";

export type EvalTiming = {
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
};

export function evalDurationMs(run: EvalTiming, now: number | null) {
  if (!run.startedAt) return undefined;
  const start = Date.parse(run.startedAt);
  const end = run.endedAt
    ? Date.parse(run.endedAt)
    : isActive(run.status)
      ? now
      : null;
  if (end === null || !Number.isFinite(start) || !Number.isFinite(end))
    return undefined;
  return Math.max(0, end - start);
}
