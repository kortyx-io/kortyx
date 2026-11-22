"use client";
import {
  type EvaluatorExecution,
  EvaluatorExecutionSchema,
  type EvaluatorExecutionSummary,
  EvaluatorExecutionSummarySchema,
  type EvaluatorLibrary,
  EvaluatorLibrarySchema,
} from "@kortyx/telemetry-contracts";
import { useEffect, useState } from "react";
import { z } from "zod";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import { evaluatorRequest } from "../api/client";
import { ExecutionResult } from "./execution-result";
export function RecordEvaluatorScores({
  runId,
  evalRunId,
}: {
  runId?: string;
  evalRunId?: string;
}) {
  const [scores, setScores] = useState<EvaluatorExecutionSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<EvaluatorExecution | null>(null);
  const [library, setLibrary] = useState<EvaluatorLibrary | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const query = new URLSearchParams({
      refresh: String(refresh),
      ...(runId ? { runId } : {}),
      ...(evalRunId ? { evalRunId } : {}),
    });
    void Promise.all([
      evaluatorRequest(`scores?${query}`, undefined, abort.signal),
      evaluatorRequest("", undefined, abort.signal),
    ])
      .then(([result, lib]) => {
        setScores(
          z
            .object({ executions: z.array(EvaluatorExecutionSummarySchema) })
            .parse(result).executions,
        );
        setLibrary(EvaluatorLibrarySchema.parse(lib));
        setError("");
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError("Evaluator results are unavailable. Retry to reconnect.");
      });
    return () => abort.abort();
  }, [runId, evalRunId, refresh]);
  useEffect(() => {
    setSelected(null);
    if (!selectedId) return;
    const abort = new AbortController();
    void evaluatorRequest(`executions/${selectedId}`, undefined, abort.signal)
      .then((value) => setSelected(EvaluatorExecutionSchema.parse(value)))
      .catch(() => {
        if (!abort.signal.aborted)
          setError("Assessment details are unavailable. Retry to reconnect.");
      });
    return () => abort.abort();
  }, [selectedId]);
  return (
    <section
      className="flex flex-col gap-4 p-5"
      aria-label="Evaluator assessments"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Evaluator assessments</h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setRefresh((n) => n + 1)}
        >
          Refresh assessments
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {runId && library?.canRun && (
        <div className="flex flex-wrap gap-2">
          {library.evaluators
            .filter((e) => !e.archived && e.publishedVersion > 0)
            .map((e) => (
              <Button key={e.id} variant="outline" size="sm" asChild>
                <Link
                  href={`/evaluators/${e.id}?tab=preview&runId=${encodeURIComponent(runId)}`}
                >
                  Evaluate with {e.draft.name}
                </Link>
              </Button>
            ))}
        </div>
      )}
      {!scores.length && !error && (
        <p className="text-sm text-muted-foreground">
          No saved evaluator assessments for this recording.
        </p>
      )}
      {scores.map((execution) => (
        <div key={execution.id} className="flex flex-col gap-2">
          <Link
            className="text-sm font-medium underline"
            href={`/evaluators/${execution.evaluatorId}?tab=executions`}
          >
            {execution.evaluatorName} · v{execution.evaluatorVersion}
          </Link>
          <p className="text-xs text-muted-foreground">
            {execution.source} ·{" "}
            {new Date(execution.createdAt).toLocaleString()}
          </p>
          <Button
            variant="outline"
            className="self-start"
            onClick={() => setSelectedId(execution.id)}
          >
            Inspect assessment
          </Button>
          {selected?.id === execution.id && (
            <ExecutionResult execution={selected} />
          )}
        </div>
      ))}
    </section>
  );
}
