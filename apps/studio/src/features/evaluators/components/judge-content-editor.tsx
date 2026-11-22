"use client";
import {
  type EvaluatorDefinition,
  JUDGE_VARIABLES,
} from "@kortyx/telemetry-contracts";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { PromptEditor } from "@/features/prompts/components/prompt-editor";
import { studioHelp } from "@/lib/studio-help";
import { EditorField, EditorSelect } from "./editor-fields";

const noReferences = () => {};
const emptyNames = {};
const emptyDependencies: [] = [];
export function JudgeContentEditor({
  value,
  models,
  mode,
  onChange,
}: {
  value: EvaluatorDefinition;
  models: readonly string[];
  mode: "reading" | "editing" | "saving";
  onChange: (next: EvaluatorDefinition) => void;
}) {
  const editing = mode !== "reading";
  const disabled = mode !== "editing";
  const change = (next: Partial<EvaluatorDefinition>) =>
    onChange({ ...value, ...next });
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 @lg:p-5">
      <section className="flex min-w-0 flex-col gap-2" data-judge-instructions>
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-medium">Judge instructions</h2>
          <HelpCircle help={studioHelp.evaluators} />
        </div>
        {editing ? (
          <PromptEditor
            id="judge-instructions"
            label="Judge instructions"
            value={value.content.instructions}
            messageRole="system"
            disabled={disabled}
            dependencies={emptyDependencies}
            names={emptyNames}
            references={false}
            variables={JUDGE_VARIABLES}
            onInclude={noReferences}
            onChange={(instructions) =>
              change({ content: { ...value.content, instructions } })
            }
          />
        ) : (
          <PromptEditor
            id="judge-instructions"
            label="Judge instructions"
            value={value.content.instructions}
            messageRole="system"
            disabled
            dependencies={emptyDependencies}
            names={emptyNames}
            references={false}
            onInclude={noReferences}
            onChange={noReferences}
          />
        )}
      </section>
      <section className="flex min-w-0 flex-col gap-2" data-judge-context>
        <h2 className="text-xs font-medium">Evaluation context</h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Kortyx fills these variables for each judgment. Observations include
          captured events and human pauses; unavailable optional inputs remain
          explicit.
        </p>
        <PromptEditor
          id="judge-context"
          label="Evaluation context"
          value={value.content.context}
          messageRole="user"
          disabled={disabled}
          dependencies={emptyDependencies}
          names={emptyNames}
          references={false}
          variables={editing ? JUDGE_VARIABLES : []}
          onInclude={noReferences}
          onChange={(context) =>
            change({ content: { ...value.content, context } })
          }
        />
      </section>
      <section className="flex flex-col gap-3" data-judge-configuration>
        <h2 className="text-xs font-medium">Configuration</h2>
        <div className="grid gap-4 @xl:grid-cols-2">
          {models.length ? (
            <EditorSelect
              id="judge-model"
              label="Judge model"
              value={value.model}
              disabled={disabled}
              options={models.map((model) => ({ value: model, label: model }))}
              onChange={(model) => change({ model })}
            />
          ) : (
            <EditorField id="judge-model" label="Judge model">
              <Input
                id="judge-model"
                disabled={disabled}
                value={value.model}
                placeholder="Model ID configured on your backend"
                onChange={(e) => change({ model: e.target.value })}
              />
            </EditorField>
          )}
          <EditorSelect
            id="judge-evidence"
            label="Evidence scope"
            disabled={disabled}
            value={value.evidence}
            options={[
              { value: "trajectory", label: "Execution trajectory" },
              { value: "response", label: "Recorded response" },
            ]}
            onChange={(evidence) =>
              change({
                evidence: evidence === "response" ? "response" : "trajectory",
              })
            }
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          The model connection stays on the backend. Trajectory includes
          selected public execution events. Each saved version owns these
          instructions and this configuration.
        </p>
      </section>
    </div>
  );
}
