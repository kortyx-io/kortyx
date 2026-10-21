"use client";
import {
  EVAL_COMPARISON_LIMITS,
  type StudioEvaluationSummary,
} from "@kortyx/agent/evals";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { evalRequest } from "../api/client";
import {
  type EvaluationChanges,
  EvaluationChangesSchema,
  evaluationSignature,
} from "../lib/evaluation-changes";
import { isActive } from "../lib/presentation";

type Entry = { signature: string; value?: EvaluationChanges };

/** Background work is keyed by terminal results, not every progress event. */
export function useEvaluationChanges(
  runs: StudioEvaluationSummary[],
  refresh: number,
  options: { baseline?: string | null; includeChoices?: boolean } = {},
) {
  const cache = useRef<Record<string, Entry>>({});
  const previousRefresh = useRef(refresh);
  const scope = JSON.stringify([
    options.baseline ?? null,
    Boolean(options.includeChoices),
  ]);
  const previousScope = useRef(scope);
  const [state, setState] = useState<Record<string, Entry>>({});
  const key = JSON.stringify(
    runs.map((run) => [
      run.id,
      isActive(run.status)
        ? "active"
        : JSON.stringify([scope, evaluationSignature(run)]),
    ]),
  );
  useEffect(() => {
    const entries = JSON.parse(key) as [string, string][];
    if (
      previousRefresh.current !== refresh ||
      previousScope.current !== scope
    ) {
      cache.current = {};
      previousRefresh.current = refresh;
      previousScope.current = scope;
    }
    // Retain only the visible page, never a growing history of previous filters.
    cache.current = Object.fromEntries(
      entries.flatMap(([id]) =>
        cache.current[id] ? [[id, cache.current[id]]] : [],
      ),
    );
    const pending = entries.filter(
      ([id, signature]) =>
        signature !== "active" && cache.current[id]?.signature !== signature,
    );
    setState({ ...cache.current });
    if (!pending.length) return;
    const controller = new AbortController();
    const [baseline, detail] = JSON.parse(scope) as [string | null, boolean];
    void (async () => {
      const bytes = (value: EvaluationChanges | undefined) =>
        value ? new TextEncoder().encode(JSON.stringify(value)).byteLength : 0;
      let retained = Object.values(cache.current).reduce(
        (total, entry) => total + bytes(entry.value),
        0,
      );
      // Small batches reveal finished cells progressively and bound each request's lifetime.
      for (let offset = 0; offset < pending.length; offset += 4) {
        if (controller.signal.aborted) return;
        const batch = pending.slice(offset, offset + 4);
        const params = new URLSearchParams({
          ids: batch.map(([id]) => id).join(","),
        });
        if (baseline) params.set("baseline", baseline);
        if (detail) params.set("detail", "1");
        try {
          const response = z
            .object({ changes: z.record(z.string(), EvaluationChangesSchema) })
            .parse(
              await evalRequest(
                `changes?${params}`,
                undefined,
                controller.signal,
              ),
            );
          if (controller.signal.aborted) return;
          for (const [id, signature] of batch) {
            retained -= bytes(cache.current[id]?.value);
            const value = response.changes[id],
              size = bytes(value);
            if (retained + size > EVAL_COMPARISON_LIMITS.responseBytes)
              cache.current[id] = { signature };
            else {
              cache.current[id] = { signature, value };
              retained += size;
            }
          }
        } catch {
          // An error is retried only by a new terminal version or explicit refresh.
          if (controller.signal.aborted) return;
          for (const [id, signature] of batch) {
            retained -= bytes(cache.current[id]?.value);
            cache.current[id] = { signature };
          }
        }
        setState({ ...cache.current });
      }
    })();
    return () => controller.abort();
  }, [key, refresh, scope]);
  const changes: Record<string, EvaluationChanges> = {};
  const loadingIds = new Set<string>();
  for (const run of runs) {
    if (isActive(run.status)) continue;
    const entry = state[run.id],
      signature = JSON.stringify([scope, evaluationSignature(run)]);
    if (entry?.signature === signature) {
      if (entry.value) changes[run.id] = entry.value;
    } else loadingIds.add(run.id);
  }
  return { changes, loadingIds };
}
