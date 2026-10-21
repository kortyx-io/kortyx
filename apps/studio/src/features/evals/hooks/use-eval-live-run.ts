import {
  type StudioEvalLiveDetail,
  StudioEvalLiveDetailSchema,
  StudioEvalLiveUpdateSchema,
} from "@kortyx/agent/evals";
import { parseAsBoolean } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { useStudioQueryState } from "@/lib/nuqs";
import { evalRequest } from "../api/client";

export function useEvalLiveRun(
  id: string | null,
  initial: StudioEvalLiveDetail | null,
  refresh: number,
) {
  const [enabled] = useStudioQueryState(
    "live",
    parseAsBoolean.withDefault(true).withOptions({ shallow: true }),
  );
  const [detail, setDetail] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(initial);
  const request = useRef<AbortController | null>(null);
  const read = useCallback(async () => {
    if (!id) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const previous = current.current?.id === id ? current.current : null;
    try {
      const response = await evalRequest(
        `runs/${encodeURIComponent(id)}/live${previous ? `?after=${previous.version}` : ""}`,
        undefined,
        controller.signal,
      );
      const next = previous
        ? (() => {
            const update = StudioEvalLiveUpdateSchema.parse(response);
            return update.run ? { ...previous, ...update.run } : previous;
          })()
        : StudioEvalLiveDetailSchema.parse(response).run;
      if (controller.signal.aborted) return;
      current.current = next;
      setDetail(next);
      setError(null);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load this eval run.",
        );
    }
  }, [id]);
  useEffect(() => {
    // The server supplied the initial snapshot; the stream's open reconciles its gap.
    // A new route also fences an old request before it can replace the new snapshot.
    request.current?.abort();
    current.current = initial?.id === id ? initial : null;
    setDetail(current.current);
    setError(null);
    if (id && !current.current) void read();
    return () => request.current?.abort();
  }, [id, initial, read]);
  const lastRefresh = useRef(refresh);
  useEffect(() => {
    if (lastRefresh.current === refresh) return;
    lastRefresh.current = refresh;
    void read();
  }, [refresh, read]);
  const live = useLiveRefresh({
    enabled: Boolean(id) && enabled,
    resource: "evals",
    relatedResources: ["runs"],
    minRefreshIntervalMs: 1_000,
    refreshOnEnable: false,
    refreshKey: id ?? "",
    refresh: read,
  });
  return {
    detail: detail?.id === id ? detail : null,
    error,
    liveStatus: live.status,
  };
}
