import {
  StudioEvalLiveDetailSchema,
  StudioEvalLiveUpdateSchema,
} from "@kortyx/agent/evals";
import { parseAsBoolean } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { useStudioQueryState } from "@/lib/nuqs";
import { evalRequest } from "../api/client";
import { mergeEvalLiveState, needsEvalEvidence } from "../lib/live-evidence";
import { type EvalDetail, EvalDetailSchema } from "../schema";

export function useEvalRun(
  id: string | null,
  initial: EvalDetail | null,
  refresh: number,
  selection?: { caseId: string; repetition: number },
) {
  const caseId = selection?.caseId;
  const repetition = selection?.repetition;
  const [enabled] = useStudioQueryState(
    "live",
    parseAsBoolean.withDefault(true).withOptions({ shallow: true }),
  );
  const [detail, setDetail] = useState(initial);
  const detailRef = useRef(initial);
  detailRef.current = detail;
  const liveVersion = useRef<string | undefined>(undefined);
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
          `runs/${encodeURIComponent(id)}${caseId ? `/case?${new URLSearchParams({ caseId, repetition: String(repetition) })}` : ""}`,
          undefined,
          controller.signal,
        ),
      ).run;
      if (controller.signal.aborted || currentId.current !== id) return;
      setDetail(next);
      setError(null);
      return true;
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
  }, [id, caseId, repetition]);
  const readLive = useCallback(async () => {
    const previous = detailRef.current;
    if (!id || previous?.id !== id) {
      await read();
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await evalRequest(
        `runs/${encodeURIComponent(id)}/live${liveVersion.current ? `?after=${liveVersion.current}` : ""}`,
        undefined,
        controller.signal,
      );
      const state = liveVersion.current
        ? StudioEvalLiveUpdateSchema.parse(response).run
        : StudioEvalLiveDetailSchema.parse(response).run;
      if (controller.signal.aborted || currentId.current !== id) return;
      if (!state) {
        setError(null);
        return;
      }
      if (
        needsEvalEvidence(
          previous,
          state,
          caseId && repetition ? { caseId, repetition } : undefined,
        )
      ) {
        if (await read()) liveVersion.current = state.version;
      } else {
        liveVersion.current = state.version;
        setDetail(mergeEvalLiveState(previous, state));
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted && currentId.current === id)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not refresh this eval run.",
        );
    }
  }, [id, caseId, repetition, read]);
  const live = useLiveRefresh({
    enabled: Boolean(id) && enabled,
    resource: "evals",
    relatedResources: ["runs"],
    refresh: readLive,
    minRefreshIntervalMs: 1_000,
    refreshOnEnable: false,
    refreshKey: `${id ?? ""}:${caseId ?? ""}:${repetition ?? ""}`,
  });
  useEffect(() => {
    liveVersion.current = undefined;
    setLoading(Boolean(id && initial?.id !== id));
    setError(null);
    setDetail(initial?.id === id ? initial : null);
    if (id && initial?.id !== id) void read();
    return () => {
      request.current?.abort();
    };
  }, [id, initial, read]);
  const lastRefresh = useRef(refresh);
  useEffect(() => {
    if (lastRefresh.current === refresh) return;
    lastRefresh.current = refresh;
    void read();
  }, [refresh, read]);
  return {
    detail: detail?.id === id ? detail : null,
    error,
    loading,
    liveStatus: live.status,
  };
}
