"use client";

import {
  type StudioEvalLiveDetail,
  StudioEvalLiveDetailSchema,
  StudioEvalLiveUpdateSchema,
} from "@kortyx/agent/evals";
import { parseAsBoolean } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { useStudioQueryState } from "@/lib/nuqs";
import { evalRequest } from "../api/client";

/** One live subscription and bounded compact reads, independent of the suite filter. */
export function useEvaluationLiveRuns(
  evaluationId: string,
  suiteRunIds: string[],
) {
  const idsKey = JSON.stringify(suiteRunIds);
  const ids = useMemo<string[]>(() => JSON.parse(idsKey), [idsKey]);
  const scope = `${evaluationId}:${idsKey}`;
  const [enabled] = useStudioQueryState(
    "live",
    parseAsBoolean.withDefault(true),
  );
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    runs: Record<string, StudioEvalLiveDetail>;
    failed: string[];
    loading: boolean;
  }>({ scope, runs: {}, failed: [], loading: true });
  const cache = useRef({
    scope,
    runs: {} as Record<string, StudioEvalLiveDetail>,
  });
  const request = useRef<AbortController | null>(null);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const read = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const previous = cache.current.scope === scope ? cache.current.runs : {};
    const runs = { ...previous };
    const failed: string[] = [];
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, ids.length) }, async () => {
        while (index < ids.length && !controller.signal.aborted) {
          const id = ids[index++];
          const before = previous[id];
          try {
            const value = await evalRequest(
              `runs/${encodeURIComponent(id)}/live${before ? `?after=${encodeURIComponent(before.version)}` : ""}`,
              undefined,
              controller.signal,
            );
            if (before) {
              const update = StudioEvalLiveUpdateSchema.parse(value);
              if (update.run && update.run.id !== id)
                throw new Error("Unexpected suite run");
              runs[id] = update.run ? { ...before, ...update.run } : before;
            } else {
              const next = StudioEvalLiveDetailSchema.parse(value).run;
              if (next.id !== id) throw new Error("Unexpected suite run");
              runs[id] = next;
            }
          } catch {
            if (!controller.signal.aborted) failed.push(id);
          }
        }
      }),
    );
    if (controller.signal.aborted || activeScope.current !== scope) return;
    cache.current = { scope, runs };
    setSnapshot({ scope, runs, failed, loading: false });
  }, [scope, ids]);
  useEffect(() => {
    request.current?.abort();
    cache.current = { scope, runs: {} };
    setSnapshot({ scope, runs: {}, failed: [], loading: ids.length > 0 });
    void read();
    return () => request.current?.abort();
  }, [scope, ids, read]);
  useLiveRefresh({
    enabled: enabled && ids.length > 0,
    resource: "evals",
    relatedResources: ["runs"],
    minRefreshIntervalMs: 1_000,
    refreshOnEnable: false,
    refreshKey: scope,
    refresh: read,
  });
  return {
    runs:
      snapshot.scope === scope
        ? ids.flatMap((id) => (snapshot.runs[id] ? [snapshot.runs[id]] : []))
        : [],
    failed: snapshot.scope === scope ? snapshot.failed : [],
    loading: snapshot.scope !== scope || snapshot.loading,
    refresh: read,
  };
}
