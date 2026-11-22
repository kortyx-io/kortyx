"use client";
import {
  type EvaluatorDefinition,
  JUDGE_VARIABLES,
} from "@kortyx/telemetry-contracts";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PromptEditor } from "@/features/prompts/components/prompt-editor";
import { PromptMessagePreview } from "@/features/prompts/components/prompt-message-preview";
import { studioHelp } from "@/lib/studio-help";
import { EditorField, EditorSelect } from "./editor-fields";

const noReferences = () => {};
const emptyNames = {};
const emptyDependencies: [] = [];
export function JudgeContentEditor({
  value,
  models,
  mode,
  newJudge,
  onChange,
}: {
  value: EvaluatorDefinition;
  models: readonly string[];
  mode: "reading" | "editing" | "saving";
  newJudge: boolean;
  onChange: (next: EvaluatorDefinition) => void;
}) {
  const editing = mode !== "reading";
  const disabled = mode !== "editing";
  const change = (next: Partial<EvaluatorDefinition>) =>
    onChange({ ...value, ...next });
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 @lg:p-5">
      {!editing && value.description && (
        <p className="text-xs leading-5 text-muted-foreground">
          {value.description}
        </p>
      )}
      {editing && (
        <details
          open={newJudge}
          className="rounded-md border p-3"
          data-judge-details
        >
          <summary className="cursor-pointer text-xs font-medium">
            Judge details
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            <EditorField id="judge-name" label="Judge name">
              <Input
                disabled={disabled}
                id="judge-name"
                value={value.name}
                placeholder="Support response quality"
                onChange={(e) => change({ name: e.target.value })}
              />
            </EditorField>
            <EditorField id="judge-description" label="Description">
              <Textarea
                disabled={disabled}
                id="judge-description"
                className="min-h-16 text-xs"
                value={value.description}
                placeholder="What this judge assesses"
                onChange={(e) => change({ description: e.target.value })}
              />
            </EditorField>
          </div>
        </details>
      )}
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
      <details className="rounded-md border" data-judge-context>
        <summary className="cursor-pointer px-3 py-3 text-xs font-medium">
          Evaluation context{" "}
          <span className="ml-2 font-normal text-muted-foreground">
            Variables filled for each judgment
          </span>
        </summary>
        <div className="flex min-w-0 flex-col gap-3 border-t p-3">
          <p className="text-xs leading-5 text-muted-foreground">
            Kortyx supplies the criterion, input, observation, reference facts
            and preceding conversation. Observations include captured events and
            human pauses. Unavailable optional inputs remain explicit.
          </p>
          {editing ? (
            <PromptEditor
              id="judge-context"
              label="Evaluation context"
              value={value.content.context}
              messageRole="user"
              disabled={disabled}
              dependencies={emptyDependencies}
              names={emptyNames}
              references={false}
              variables={JUDGE_VARIABLES}
              onInclude={noReferences}
              onChange={(context) =>
                change({ content: { ...value.content, context } })
              }
            />
          ) : (
            <PromptMessagePreview
              label="Evaluation context"
              value={value.content.context}
            />
          )}
        </div>
      </details>
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
        {newJudge && (
          <p className="text-xs text-muted-foreground">
            Save a draft to open Preview and inspect a recorded case.
          </p>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          The model connection stays on the backend. Trajectory includes
          selected public execution events. Each saved version owns these
          instructions and this configuration.
        </p>
      </section>
    </div>
  );
}
