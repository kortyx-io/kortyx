import { useEffect, useState } from "react";
import { evalRequest } from "../api/client";
import { isActive } from "../lib/presentation";
import { type EvalDetail, EvalDetailSchema } from "../schema";

export function useEvalRun(
  id: string | null,
  initial: EvalDetail | null,
  refresh: number,
) {
  const [detail, setDetail] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(id && initial?.id !== id));
  // biome-ignore lint/correctness/useExhaustiveDependencies: the refresh counter explicitly requests a new read.
  useEffect(() => {
    if (!id) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError(null);
    const poll = async () => {
      try {
        const next = EvalDetailSchema.parse(
          await evalRequest(
            `runs/${encodeURIComponent(id)}`,
            undefined,
            controller.signal,
          ),
        ).run;
        if (controller.signal.aborted) return;
        setDetail(next);
        setError(null);
        setLoading(false);
        if (isActive(next.status)) timer = setTimeout(poll, 1500);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load this eval run.",
        );
        setLoading(false);
        timer = setTimeout(poll, 4000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [id, refresh]);
  return { detail: detail?.id === id ? detail : null, error, loading };
}
