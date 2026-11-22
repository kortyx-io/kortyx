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
const EvidenceSchema = z.object({
  evidence: z.object({ captured: z.unknown() }),
  variables: z.record(z.string(), z.unknown()),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
});
const ChoicesSchema = z.object({
  steps: z.array(
    z.object({
      index: z.number(),
      criteria: z
        .array(z.object({ id: z.string(), text: z.string() }))
        .default([]),
    }),
  ),
});
export function EvaluatorPreview({
  id,
  revision,
  version,
  disabled,
  initialExecutionId,
}: {
  id: string;
  revision: number;
  version?: number;
  disabled: boolean;
  initialExecutionId?: string;
}) {
  const [recordings, setRecordings] = useState<
    z.infer<typeof RecordingsSchema>["recordings"]
  >([]);
  const [target, setTarget] = useState<EvaluatorTarget>({
    type: "run",
    runId: "",
  });
  const [execution, setExecution] = useState<EvaluatorExecution | null>(null);
  const [evidence, setEvidence] = useState<unknown>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<
    z.infer<typeof ChoicesSchema>["steps"]
  >([]);
  const requestIdentity = useRef<string | null>(null);
  useEffect(() => {
    if (!initialExecutionId) return;
    const abort = new AbortController();
    void evaluatorRequest(
      `executions/${initialExecutionId}`,
      undefined,
      abort.signal,
    )
      .then((value) => setExecution(EvaluatorExecutionSchema.parse(value)))
      .catch(() => {});
    return () => abort.abort();
  }, [initialExecutionId]);

  useEffect(() => {
    const abort = new AbortController();
    void evaluatorRequest("recordings", undefined, abort.signal)
      .then((value) => setRecordings(RecordingsSchema.parse(value).recordings))
      .catch((cause) => {
        if (!abort.signal.aborted) setError(cause.message);
      });
    return () => abort.abort();
  }, []);
  const executionId = execution?.id,
    executionStatus = execution?.status;
  useEffect(() => {
    if (!executionId || !["queued", "running"].includes(executionStatus ?? ""))
      return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = EvaluatorExecutionSchema.parse(
          await evaluatorRequest(
            `executions/${executionId}`,
            undefined,
            abort.signal,
          ),
        );
        setExecution(result);
        if (["queued", "running"].includes(result.status))
          timer = setTimeout(poll, 1000);
      } catch (cause) {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Preview unavailable.",
          );
      }
    };
    timer = setTimeout(poll, 500);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [executionId, executionStatus]);
  const changeTarget = (value: EvaluatorTarget) => {
    setTarget(value);
    setEvidence(null);
    requestIdentity.current = null;
  };
  const filled = EvidenceSchema.safeParse(evidence);
  const selectedStep =
    target.type === "case"
      ? (target.stepIndex ?? choices.at(-1)?.index)
      : undefined;
  const criteria =
    choices.find((step) => step.index === selectedStep)?.criteria ?? [];
  return (
    <div className="grid min-w-0 gap-5 @3xl:grid-cols-2">
      <section
        aria-label="Preview evidence"
        className="flex min-w-0 flex-col gap-4 rounded-md border p-4"
      >
        <div>
          <h2 className="text-xs font-medium">Try a recording</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Inspect the variables and rendered request before running the judge.
            Run preview uses the configured model and may incur a charge.
          </p>
        </div>
        <EditorSelect
          id="judge-recording"
          label="Recent recordings"
          value={String(
            recordings.findIndex(
              (record) =>
                JSON.stringify(record.target) === JSON.stringify(target),
            ),
          )}
          options={recordings.map((record, index) => ({
            value: String(index),
            label: `${record.label} · ${record.environment}`,
          }))}
          onChange={(value) => {
            const record = recordings[Number(value)];
            if (record) {
              changeTarget(record.target);
              setChoices([]);
            }
          }}
        />
        <EditorField id="preview-run-id" label="Or enter a run ID">
          <Input
            id="preview-run-id"
            value={target.type === "run" ? target.runId : ""}
            onChange={(event) => {
              changeTarget({ type: "run", runId: event.target.value });
              setChoices([]);
            }}
          />
        </EditorField>
        {target.type === "run" && (
          <EditorField id="preview-environment" label="Run environment">
            <Input
              id="preview-environment"
              value={target.environment ?? ""}
              placeholder="Required for run IDs shared across environments"
              onChange={(event) =>
                changeTarget({
                  ...target,
                  environment: event.target.value || undefined,
                })
              }
            />
          </EditorField>
        )}
        {target.type === "case" && choices.length > 1 && (
          <EditorSelect
            id="preview-step"
            label="Conversation step"
            value={String(selectedStep)}
            options={choices.map((step) => ({
              value: String(step.index),
              label: `Step ${step.index + 1}`,
            }))}
            onChange={(value) =>
              changeTarget({
                ...target,
                stepIndex: Number(value),
                criterionId: undefined,
              })
            }
          />
        )}
        {target.type === "case" && criteria.length > 1 && (
          <EditorSelect
            id="preview-criterion"
            label="Criterion"
            value={target.criterionId ?? criteria[0]?.id ?? ""}
            options={criteria.map((criterion) => ({
              value: criterion.id,
              label: criterion.text,
            }))}
            onChange={(criterionId) => changeTarget({ ...target, criterionId })}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || disabled}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const value = await evaluatorRequest(`${id}/evidence`, {
                  target,
                  revision,
                  ...(version ? { version } : {}),
                });
                const parsed = EvidenceSchema.parse(value);
                setEvidence(value);
                const steps = ChoicesSchema.safeParse(parsed.evidence.captured);
                if (steps.success) setChoices(steps.data.steps);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Evidence unavailable.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Inspect evidence
          </Button>
          <Button
            size="sm"
            disabled={
              busy ||
              disabled ||
              ["queued", "running"].includes(executionStatus ?? "")
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              requestIdentity.current ??= crypto.randomUUID();
              try {
                setExecution(
                  EvaluatorExecutionSchema.parse(
                    await evaluatorRequest(`${id}/preview`, {
                      target,
                      revision,
                      ...(version ? { version } : {}),
                      requestKey: requestIdentity.current,
                    }),
                  ),
                );
                requestIdentity.current = null;
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : "Preview failed.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Run preview
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {filled.success && (
          <details open className="border-t pt-3">
            <summary className="cursor-pointer text-xs font-medium">
              Filled variables
            </summary>
            <dl className="mt-3 flex flex-col gap-3">
              {Object.entries(filled.data.variables).map(([key, value]) => (
                <div key={key}>
                  <dt className="font-mono text-[11px] text-muted-foreground">
                    {key}
                  </dt>
                  <dd className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
                    {value === null
                      ? "Not available in this recording"
                      : typeof value === "string"
                        ? value
                        : JSON.stringify(value, null, 2)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        {evidence !== null && (
          <details>
            <summary className="cursor-pointer text-xs">
              Recording and rendered request
            </summary>
            <div className="mt-3">
              <PreviewEvidence value={evidence} />
            </div>
          </details>
        )}
      </section>
      {execution ? (
        <ExecutionResult execution={execution} />
      ) : (
        <section className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center">
          <h2 className="text-xs font-medium">See how this judge reasons</h2>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground">
            The preview shows the verdict, explanation, supporting evidence and
            model usage for this saved version or draft.
          </p>
        </section>
      )}
    </div>
  );
}
