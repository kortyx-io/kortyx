"use client";
import {
  type EvaluatorDetail,
  type EvaluatorRuleDefinition,
  EvaluatorRuleDefinitionSchema,
} from "@kortyx/telemetry-contracts";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evaluatorRequest } from "../api/client";
import { EditorField, EditorSelect } from "./editor-fields";
export function EvaluatorRules({
  detail,
  disabled,
  workerAvailable,
  onSaved,
}: {
  detail: EvaluatorDetail;
  disabled: boolean;
  workerAvailable: boolean;
  onSaved: () => Promise<void>;
}) {
  const blank: EvaluatorRuleDefinition = {
    name: "",
    evaluatorVersion: detail.evaluator.publishedVersion || 1,
    environment: "development",
    stage: "completed",
    workflowId: "",
    sampleRate: 0.1,
    dailyLimit: 100,
    enabled: false,
  };
  const [ruleId, setRuleId] = useState("");
  const creationId = useRef<string | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const update = (value: Partial<EvaluatorRuleDefinition>) => {
    setForm((f) => ({ ...f, ...value }));
    setMatches(null);
  };
  const versions = detail.versions.map((v) => ({
    value: String(v.version),
    label: `Version ${v.version}`,
  }));
  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <div>
        <h2 className="text-base font-medium">Production rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Match future recorded runs and assess their evidence asynchronously.
          Each rule pins an evaluator version. Daily limits count admitted judge
          calls in UTC.
        </p>
      </div>
      <EditorSelect
        id="rule-selection"
        label="Rule"
        value={ruleId || "new"}
        options={[
          { value: "new", label: "New rule" },
          ...detail.rules.map((r) => ({
            value: r.id,
            label: `${r.name} · ${r.enabled ? "Active" : "Disabled"}`,
          })),
        ]}
        onChange={(id) => {
          setRuleId(id === "new" ? "" : id);
          const selected = detail.rules.find((r) => r.id === id);
          setForm(
            selected
              ? EvaluatorRuleDefinitionSchema.strip().parse(selected)
              : blank,
          );
          setMatches(null);
        }}
      />
      <fieldset disabled={disabled || busy} className="flex flex-col gap-4">
        <EditorField id="rule-name" label="Rule name">
          <Input
            id="rule-name"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </EditorField>
        <EditorSelect
          id="rule-version"
          label="Evaluator version"
          value={String(form.evaluatorVersion)}
          options={versions}
          onChange={(v) => update({ evaluatorVersion: Number(v) })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <EditorField id="rule-environment" label="Environment">
            <Input
              id="rule-environment"
              value={form.environment}
              onChange={(e) => update({ environment: e.target.value })}
            />
          </EditorField>
          <EditorSelect
            id="rule-stage"
            label="When to assess"
            value={form.stage}
            options={[
              { value: "completed", label: "Run finished" },
              { value: "paused", label: "Waiting for human input" },
            ]}
            onChange={(stage) =>
              update({ stage: stage === "paused" ? "paused" : "completed" })
            }
          />
        </div>
        <EditorField
          id="rule-workflow"
          label="Workflow ID"
          description="Leave empty to match all workflows in this environment."
        >
          <Input
            id="rule-workflow"
            value={form.workflowId}
            onChange={(e) => update({ workflowId: e.target.value })}
          />
        </EditorField>
        <div className="grid gap-4 sm:grid-cols-2">
          <EditorField id="rule-sampling" label="Sample percentage">
            <Input
              id="rule-sampling"
              type="number"
              min="0.01"
              max="100"
              value={form.sampleRate * 100}
              onChange={(e) =>
                update({ sampleRate: Number(e.target.value) / 100 })
              }
            />
          </EditorField>
          <EditorField
            id="rule-limit"
            label="Daily judge-call limit"
            description="A call cap bounds volume. Provider pricing determines spend."
          >
            <Input
              id="rule-limit"
              type="number"
              min="1"
              max="10000"
              value={form.dailyLimit}
              onChange={(e) => update({ dailyLimit: Number(e.target.value) })}
            />
          </EditorField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            disabled={!workerAvailable}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          Activate this rule when saved
        </label>
        {!workerAvailable && (
          <p className="text-sm text-muted-foreground">
            Configure the evaluator worker and model connection to activate
            rules.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const parsed = EvaluatorRuleDefinitionSchema.parse(form);
                setMatches(
                  await evaluatorRequest(
                    `${detail.evaluator.id}/rules/preview`,
                    parsed,
                  ),
                );
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not preview matches.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Preview matching runs
          </Button>
          <Button
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const parsed = EvaluatorRuleDefinitionSchema.parse(form);
                creationId.current ??= crypto.randomUUID();
                const existing = detail.rules.find((r) => r.id === ruleId);
                await evaluatorRequest(`${detail.evaluator.id}/rules`, {
                  definition: parsed,
                  ...(existing
                    ? { id: existing.id, revision: existing.revision }
                    : { creationId: creationId.current }),
                });
                await onSaved();
                creationId.current = null;
                setRuleId("");
                setForm(blank);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not save rule.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {form.enabled ? "Save and activate" : "Save disabled rule"}
          </Button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {matches !== null && (
        <section
          aria-label="Rule match preview"
          className="rounded-lg border p-4"
        >
          <h3 className="font-medium">Matching recordings</h3>
          <p className="my-2 text-xs text-muted-foreground">
            Previewing matches makes no model calls. Only recordings arriving
            after activation are automatically assessed.
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(matches, null, 2)}
          </pre>
        </section>
      )}
    </section>
  );
}
