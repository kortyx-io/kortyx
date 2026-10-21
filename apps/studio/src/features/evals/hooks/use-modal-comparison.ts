"use client";
import { useEffect, useRef, useState } from "react";
import { evalRequest } from "../api/client";
import {
  type EvaluationChanges,
  EvaluationChangesSchema,
} from "../lib/evaluation-changes";

/** Read only the URL-selected comparison; retain a small per-surface history cache. */
export function useModalComparison(
  run: string | undefined,
  baseline: string | null,
  seed?: EvaluationChanges,
) {
  const cache = useRef(new Map<string, EvaluationChanges>());
  const [retry, setRetry] = useState(0);
  const attemptedRetry = useRef(0);
  const [result, setResult] = useState<{
    scope?: string;
    value?: EvaluationChanges;
    error?: string;
  }>({});
  const scope = JSON.stringify([run, baseline, seed?.signature]);
  const supplied =
    seed &&
    seed.candidate.id === run &&
    (!baseline || seed.earlier?.id === baseline)
      ? seed
      : undefined;
  const cached = cache.current.get(scope);
  const value =
    result.scope === scope && result.value
      ? result.value
      : (cached ?? supplied);
  useEffect(() => {
    if (!run) return;
    const force = retry > attemptedRetry.current;
    if (
      !force &&
      ((supplied && supplied.choices.length > 0) || cache.current.has(scope))
    )
      return;
    attemptedRetry.current = retry;
    const controller = new AbortController();
    setResult({ scope });
    void (async () => {
      try {
        const query = new URLSearchParams({ run });
        if (baseline) query.set("baseline", baseline);
        const value = EvaluationChangesSchema.parse(
          await evalRequest(
            `comparison?${query}`,
            undefined,
            controller.signal,
          ),
        );
        if (
          value.candidate.id !== run ||
          (baseline && value.earlier?.id !== baseline) ||
          value.state !== "ready"
        )
          throw new Error("Unavailable comparison");
        if (controller.signal.aborted) return;
        cache.current.set(scope, value);
        if (cache.current.size > 8) {
          const oldest = cache.current.keys().next().value;
          if (oldest) cache.current.delete(oldest);
        }
        setResult({ scope, value });
      } catch {
        if (!controller.signal.aborted)
          setResult({
            scope,
            error: "Could not load this baseline. Retry or choose another run.",
          });
      }
    })();
    return () => controller.abort();
  }, [run, baseline, scope, supplied, retry]);
  return {
    comparison: value,
    error: result.scope === scope ? result.error : undefined,
    retry: () => setRetry((value) => value + 1),
  };
}
