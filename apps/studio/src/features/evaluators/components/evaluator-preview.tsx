"use client";
import {
  type EvaluatorExecution,
  EvaluatorExecutionSchema,
  type EvaluatorTarget,
} from "@kortyx/telemetry-contracts";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { evaluatorRequest } from "../api/client";
import type { EvaluatorPreviewData } from "../schema";
import { EditorSelect } from "./editor-fields";
import { ExecutionResult } from "./execution-result";
import { PreviewEvidence } from "./preview-evidence";
import { RecordingPicker } from "./recording-picker";

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
  initial,
}: {
  id: string;
  revision: number;
  version?: number;
  disabled: boolean;
  initial: EvaluatorPreviewData;
}) {
  const recordings = initial.recordings;
  const [target, setTarget] = useState<EvaluatorTarget>({
    type: "run",
    runId: "",
  });
  const [execution, setExecution] = useState<EvaluatorExecution | null>(
    initial.execution,
  );
  const [evidence, setEvidence] = useState<unknown>(null),
    [error, setError] = useState(initial.error),
    [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<
    z.infer<typeof ChoicesSchema>["steps"]
  >([]);
  const requestIdentity = useRef<string | null>(null);
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
        <RecordingPicker
          recordings={recordings}
          disabled={busy}
          onChange={(value) => {
            changeTarget(value ?? { type: "run", runId: "" });
            setChoices([]);
          }}
        />
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
            disabled={
              busy || disabled || (target.type === "run" && !target.runId)
            }
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
              (target.type === "run" && !target.runId) ||
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
