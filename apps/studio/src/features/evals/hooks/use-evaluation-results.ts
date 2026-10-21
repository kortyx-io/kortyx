"use client";

import {
  type StudioEvaluationComparison,
  StudioEvaluationComparisonSchema,
} from "@kortyx/agent/evals";
import { useCallback, useEffect, useRef, useState } from "react";
import { evalRequest } from "../api/client";

export function useEvaluationResults(
  id: string | null,
  initial: StudioEvaluationComparison | null,
) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(id && initial?.id !== id));
  const controller = useRef<AbortController | null>(null);
  const read = useCallback(async () => {
    controller.current?.abort();
    if (!id) {
      setLoading(false);
      return;
    }
    const request = new AbortController();
    controller.current = request;
    try {
      const next = StudioEvaluationComparisonSchema.parse(
        await evalRequest(
          `evaluations/${encodeURIComponent(id)}/comparison`,
          undefined,
          request.signal,
        ),
      );
      if (!request.signal.aborted) {
        setValue(next.run);
        setError(null);
      }
    } catch {
      if (!request.signal.aborted)
        setError(
          "Could not load saved evaluation results. Check the connection and retry.",
        );
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    setLoading(Boolean(id && initial?.id !== id));
    setError(null);
    if (initial?.id === id) setValue(initial);
    else void read();
    return () => controller.current?.abort();
  }, [id, initial, read]);
  return {
    value: value?.id === id ? value : null,
    loading,
    error,
    retry: read,
  };
}
