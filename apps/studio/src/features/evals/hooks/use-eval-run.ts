import { parseAsBoolean } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { useStudioQueryState } from "@/lib/nuqs";
import { evalRequest } from "../api/client";
import { type EvalDetail, EvalDetailSchema } from "../schema";

export function useEvalRun(
  id: string | null,
  initial: EvalDetail | null,
  refresh: number,
) {
  const [enabled] = useStudioQueryState(
    "live",
    parseAsBoolean.withDefault(true).withOptions({ shallow: true }),
  );
  const [detail, setDetail] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(id && initial?.id !== id));
  const request = useRef<AbortController | null>(null);
  const currentId = useRef(id);
  currentId.current = id;
  const read = useCallback(async () => {
    if (!id) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const next = EvalDetailSchema.parse(
        await evalRequest(
          `runs/${encodeURIComponent(id)}`,
          undefined,
          controller.signal,
        ),
      ).run;
      if (controller.signal.aborted || currentId.current !== id) return;
      setDetail(next);
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted || currentId.current !== id) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load this eval run.",
      );
    } finally {
      if (!controller.signal.aborted && currentId.current === id)
        setLoading(false);
    }
  }, [id]);
  const live = useLiveRefresh({
    enabled: Boolean(id) && enabled,
    resource: "evals",
    relatedResources: ["runs"],
    refresh: read,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh explicitly requests another read.
  useEffect(() => {
    setLoading(Boolean(id && detail?.id !== id));
    setError(null);
    if (!id) setDetail(null);
    void read();
    return () => {
      request.current?.abort();
    };
  }, [id, refresh, read]);
  return {
    detail: detail?.id === id ? detail : null,
    error,
    loading,
    liveStatus: live.status,
  };
}
