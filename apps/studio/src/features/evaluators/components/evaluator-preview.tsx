"use client";
import {
  type EvaluatorDefinition,
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
  evidenceScope,
}: {
  id: string;
  revision: number;
  version?: number;
  disabled: boolean;
  initial: EvaluatorPreviewData;
  evidenceScope: EvaluatorDefinition["evidence"];
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
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const evidenceRequest = useRef<AbortController | null>(null);
  useEffect(() => () => evidenceRequest.current?.abort(), []);
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
    evidenceRequest.current?.abort();
    setTarget(value);
    setEvidence(null);
    setExecution(null);
    setError("");
    requestIdentity.current = null;
    setLoadingEvidence(false);
    if (!disabled && (value.type === "case" || value.runId))
      void inspectEvidence(value);
  };
  const inspectEvidence = async (value: EvaluatorTarget) => {
    evidenceRequest.current?.abort();
    const abort = new AbortController();
    evidenceRequest.current = abort;
    setLoadingEvidence(true);
    setError("");
    try {
      const result = await evaluatorRequest(
        `${id}/evidence`,
        {
          target: value,
          revision,
          ...(version ? { version } : {}),
        },
        abort.signal,
      );
      const parsed = EvidenceSchema.parse(result);
      if (abort.signal.aborted) return;
      setEvidence(result);
      const steps = ChoicesSchema.safeParse(parsed.evidence.captured);
      setChoices(steps.success ? steps.data.steps : []);
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Evidence unavailable.",
        );
    } finally {
      if (!abort.signal.aborted) setLoadingEvidence(false);
    }
  };
  const filled = EvidenceSchema.safeParse(evidence);
  const observation = filled.success
    ? z
        .object({ text: z.string(), structured: z.array(z.unknown()) })
        .safeParse(filled.data.variables.observation)
    : null;
  const missingResponse =
    observation?.success &&
    !observation.data.text.trim() &&
    !observation.data.structured.length;
  const missingInput =
    filled.success &&
    (filled.data.variables.input === null ||
      filled.data.variables.input === undefined ||
      filled.data.variables.input === "");
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
        {loadingEvidence && (
          <output className="text-xs text-muted-foreground">
            Loading recorded evidence…
          </output>
        )}
        {filled.success && (
          <section
            className="flex flex-col gap-3 text-xs"
            aria-label="Recording content"
          >
            <div>
              <p className="mb-1 font-medium">Recorded input</p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">
                {missingInput
                  ? "Input was not captured. To judge against the user's request, enable input content capture in the app and record a new run."
                  : typeof filled.data.variables.input === "string"
                    ? filled.data.variables.input
                    : JSON.stringify(filled.data.variables.input)}
              </p>
            </div>
            <div>
              <p className="mb-1 font-medium">Recorded response</p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">
                {missingResponse
                  ? "No final response was captured. Enable output content capture in the app and record a new run, or select another recording."
                  : observation?.success
                    ? observation.data.text ||
                      JSON.stringify(observation.data.structured)
                    : "Response content is unavailable."}
              </p>
            </div>
          </section>
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
            disabled={
              busy ||
              loadingEvidence ||
              disabled ||
              (target.type === "run" && !target.runId)
            }
            onClick={() => void inspectEvidence(target)}
          >
            Inspect evidence
          </Button>
          <Button
            size="sm"
            disabled={
              busy ||
              disabled ||
              loadingEvidence ||
              !filled.success ||
              (evidenceScope === "response" && Boolean(missingResponse)) ||
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
          <details className="border-t pt-3">
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
