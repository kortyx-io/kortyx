"use client";
import type { EvaluatorDetail } from "@kortyx/telemetry-contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { EvalTargets } from "@/features/evals/schema";
import { evaluatorRequest } from "../api/client";
import { EditorSelect } from "./editor-fields";
export function EvaluatorDatasets({
  detail,
  targets,
  disabled,
  onSaved,
}: {
  detail: EvaluatorDetail;
  targets: EvalTargets | null;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [targetId, setTargetId] = useState(targets?.targets[0]?.id ?? "");
  const [suiteId, setSuiteId] = useState("");
  const [version, setVersion] = useState(
    String(detail.evaluator.publishedVersion),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const target = targets?.targets.find((t) => t.id === targetId);
  const bind = async (
    enabled: boolean,
    targetId: string,
    suiteId: string,
    version: number,
  ) => {
    setBusy(true);
    setError("");
    try {
      await evaluatorRequest(`${detail.evaluator.id}/datasets`, {
        enabled,
        targetId,
        suiteId,
        version,
      });
      await onSaved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update dataset defaults.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <div>
        <h2 className="font-medium">Dataset defaults</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use this evaluator when an experiment runs a selected dataset.
          Launching an experiment freezes the evaluator version. Existing checks
          and criteria keep their own outcomes.
        </p>
      </div>
      {detail.datasets.map((binding) => (
        <div
          key={`${binding.targetId}:${binding.suiteId}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
        >
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{binding.suiteId}</p>
            <p className="break-words text-xs text-muted-foreground">
              {binding.targetId} · evaluator v{binding.evaluatorVersion}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={busy || disabled}
            onClick={() =>
              void bind(
                false,
                binding.targetId,
                binding.suiteId,
                binding.evaluatorVersion,
              )
            }
          >
            Remove default
          </Button>
        </div>
      ))}
      <fieldset
        disabled={disabled || busy}
        className="flex flex-col gap-4 rounded-lg border p-4"
      >
        <legend className="px-1 text-sm font-medium">Connect dataset</legend>
        <EditorSelect
          id="dataset-target"
          label="Application"
          value={targetId}
          options={(targets?.targets ?? []).map((t) => ({
            value: t.id,
            label: t.name,
          }))}
          onChange={(id) => {
            setTargetId(id);
            setSuiteId("");
          }}
        />
        <EditorSelect
          id="dataset-selection"
          label="Dataset"
          value={suiteId}
          options={(target?.manifest?.suites ?? []).map((s) => ({
            value: s.id,
            label: s.name ?? s.id,
          }))}
          onChange={setSuiteId}
        />
        <EditorSelect
          id="dataset-version"
          label="Evaluator version"
          value={version}
          options={detail.versions.map((v) => ({
            value: String(v.version),
            label: `Version ${v.version}`,
          }))}
          onChange={setVersion}
        />
        <Button
          disabled={!suiteId || !targetId || !Number(version)}
          onClick={() => void bind(true, targetId, suiteId, Number(version))}
        >
          Use for dataset experiments
        </Button>
      </fieldset>
      {!targets?.targets.length && (
        <p className="text-sm text-muted-foreground">
          Connect an application evaluation endpoint to discover code-managed
          datasets.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
