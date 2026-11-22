"use client";
import {
  type EvaluatorExecution,
  EvaluatorExecutionSchema,
  type EvaluatorTarget,
  EvaluatorTargetSchema,
} from "@kortyx/telemetry-contracts";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evaluatorRequest } from "../api/client";
import { EditorField, EditorSelect } from "./editor-fields";
import { ExecutionResult } from "./execution-result";
import { PreviewEvidence } from "./preview-evidence";

const RecordingsSchema = z.object({
  recordings: z.array(
    z.object({
      target: EvaluatorTargetSchema,
      label: z.string(),
      environment: z.string(),
    }),
  ),
});
export function EvaluatorPreview({
  id,
  revision,
  publishedVersion,
  disabled,
  initialRunId,
  onSaved,
}: {
  id: string;
  revision: number;
  publishedVersion: number;
  disabled: boolean;
  initialRunId?: string;
  onSaved?: () => void;
}) {
  const [recordings, setRecordings] = useState<
    z.infer<typeof RecordingsSchema>["recordings"]
  >([]);
  const [target, setTarget] = useState<EvaluatorTarget>({
    type: "run",
    runId: initialRunId ?? "",
  });
  const [execution, setExecution] = useState<EvaluatorExecution | null>(null);
  const [evidence, setEvidence] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const identity = useRef<{
    key: string;
    target: string;
    revision: number;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void evaluatorRequest("recordings", undefined, controller.signal)
      .then((value) => setRecordings(RecordingsSchema.parse(value).recordings))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const executionId = execution?.id;
  const executionStatus = execution?.status;
  useEffect(() => {
    if (!executionId || !["queued", "running"].includes(executionStatus ?? ""))
      return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = EvaluatorExecutionSchema.parse(
          await evaluatorRequest(
            `executions/${executionId}`,
            undefined,
            controller.signal,
          ),
        );
        setExecution(next);
        if (["queued", "running"].includes(next.status))
          timer = setTimeout(poll, 1000);
        else onSaved?.();
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not observe execution.",
          );
      }
    };
    timer = setTimeout(poll, 500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [executionId, executionStatus, onSaved]);
  const select = (value: string) => {
    const record = recordings[Number(value)];
    if (record) {
      setTarget(record.target);
      setEvidence(null);
    }
  };
  const runAssessment = async (mode: "preview" | "evaluate") => {
    setBusy(true);
    setError("");
    const serialized = JSON.stringify({ target, mode, publishedVersion });
    if (
      !identity.current ||
      identity.current.target !== serialized ||
      identity.current.revision !== revision
    )
      identity.current = {
        key: crypto.randomUUID(),
        target: serialized,
        revision,
      };
    try {
      setExecution(
        EvaluatorExecutionSchema.parse(
          await evaluatorRequest(`${id}/${mode}`, {
            target,
            ...(mode === "preview"
              ? { revision }
              : { version: publishedVersion }),
            requestKey: identity.current.key,
          }),
        ),
      );
      identity.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assessment failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <section
        aria-label="Preview evidence"
        className="flex min-w-0 flex-col gap-4 rounded-lg border p-4"
      >
        <h2 className="font-medium">Preview against recorded evidence</h2>
        <p className="text-sm text-muted-foreground">
          Select an existing run or saved experiment case. Running the preview
          uses the judge model and may incur a charge.
        </p>
        <EditorSelect
          id="recording"
          label="Recent recordings"
          value={String(
            recordings.findIndex(
              (r) => JSON.stringify(r.target) === JSON.stringify(target),
            ),
          )}
          options={recordings.map((r, i) => ({
            value: String(i),
            label: `${r.label} · ${r.environment}`,
          }))}
          onChange={select}
        />
        <EditorField id="preview-run-id" label="Or enter a run ID">
          <Input
            id="preview-run-id"
            value={target.type === "run" ? target.runId : ""}
            onChange={(e) => {
              setTarget({ type: "run", runId: e.target.value });
              setEvidence(null);
            }}
          />
        </EditorField>
        {target.type === "run" && (
          <EditorField
            id="preview-environment"
            label="Run environment"
            description="Required when the same run ID exists in more than one environment."
          >
            <Input
              id="preview-environment"
              value={target.environment ?? ""}
              placeholder="Select from recordings, or enter the environment"
              onChange={(event) => {
                setTarget({
                  ...target,
                  environment: event.target.value || undefined,
                });
                setEvidence(null);
              }}
            />
          </EditorField>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy || disabled}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setEvidence(
                  await evaluatorRequest(`${id}/evidence`, {
                    target,
                    revision,
                  }),
                );
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Evidence unavailable.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Inspect evidence
          </Button>
          <Button
            disabled={
              busy ||
              disabled ||
              ["queued", "running"].includes(execution?.status ?? "")
            }
            onClick={() => void runAssessment("preview")}
          >
            Run preview
          </Button>
          {publishedVersion > 0 && (
            <Button
              variant="secondary"
              disabled={
                busy ||
                disabled ||
                ["queued", "running"].includes(execution?.status ?? "")
              }
              onClick={() => void runAssessment("evaluate")}
            >
              Evaluate with published v{publishedVersion}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {evidence !== null && <PreviewEvidence value={evidence} />}
      </section>
      {execution ? (
        <ExecutionResult execution={execution} />
      ) : (
        <section className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
          <h2 className="font-medium">See how your judge evaluates</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            The preview will show assessment text, additional fields, evidence
            references, model usage and cost.
          </p>
        </section>
      )}
    </div>
  );
}
