"use client";

import { useEffect, useState } from "react";
import { formatDurationMs } from "@/lib/format";
import { useEvalReferenceTime } from "../hooks/use-eval-reference-time";
import { type EvalTiming, evalDurationMs } from "../lib/duration";
import { isActive } from "../lib/presentation";

export function EvalDuration({ run }: { run: EvalTiming }) {
  const [now, setNow] = useState<number | null>(null);
  const referenceTime = useEvalReferenceTime();
  const ticking =
    referenceTime === undefined &&
    isActive(run.status) &&
    !run.endedAt &&
    Boolean(run.startedAt) &&
    Number.isFinite(Date.parse(run.startedAt ?? ""));

  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  return <>{formatDurationMs(evalDurationMs(run, referenceTime ?? now))}</>;
}
