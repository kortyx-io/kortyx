"use client";

import {
  type EvaluatorDefinition,
  type EvaluatorDetail,
  type EvaluatorLibrary,
  PromptDetailSchema,
  type PromptLibrary,
  type ScoreGroup,
} from "@kortyx/telemetry-contracts";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { promptRequest } from "@/features/prompts/api/client";
import { studioHelp } from "@/lib/studio-help";
import { EditorField, EditorSelect } from "./editor-fields";
import { EvaluatorPromptDialog } from "./evaluator-prompt-dialog";
import { ScoreGroupEditor } from "./score-group-editor";

export function EvaluatorConfiguration({
  draft,
  detail,
  library,
  prompts,
  disabled,
  onChange,
  onGroupCreated,
  onPromptsChanged,
}: {
  draft: EvaluatorDefinition;
  detail: EvaluatorDetail | null;
  library: EvaluatorLibrary;
  prompts: PromptLibrary;
  disabled: boolean;
  onChange: (value: Partial<EvaluatorDefinition>) => void;
  onGroupCreated: (group: ScoreGroup) => void;
  onPromptsChanged: (library: PromptLibrary) => void;
}) {
  const [versions, setVersions] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [promptOpen, setPromptOpen] = useState(false);
  const promptTrigger = useRef<HTMLButtonElement>(null);
  const groupTrigger = useRef<HTMLButtonElement | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ScoreGroup>();
  const [error, setError] = useState("");
  const group = library.scoreGroups.find(
    (g) =>
      g.id === draft.scoreGroup.id && g.version === draft.scoreGroup.version,
  );
  useEffect(() => {
    setVersions([]);
    if (!draft.prompt.id) return;
    const abort = new AbortController();
    void promptRequest(
      `assets/${draft.prompt.id}?version=${draft.prompt.version}`,
      undefined,
      abort.signal,
    )
      .then((value) => {
        setVersions(
          PromptDetailSchema.parse(value).versions.map((v) => ({
            value: String(v.version),
            label: `Version ${v.version} · ${v.note || "Saved prompt"}`,
          })),
        );
        setError("");
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Prompt unavailable.",
          );
      });
    return () => abort.abort();
  }, [draft.prompt.id, draft.prompt.version]);
  const versionOptions = versions.some(
    (v) => v.value === String(draft.prompt.version),
  )
    ? versions
    : [
        {
          value: String(draft.prompt.version),
          label: `Version ${draft.prompt.version}`,
        },
        ...versions,
      ];
  return (
    <div className="grid min-h-full min-w-0 @4xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0 p-4 @lg:p-6">
        <fieldset
          disabled={disabled}
          className="mx-auto flex max-w-3xl min-w-0 flex-col gap-6"
        >
          <section
            aria-label="Evaluator identity"
            className="flex flex-col gap-4"
          >
            <h2 className="text-xs font-semibold">General</h2>
            <EditorField id="evaluator-name" label="Evaluator name">
              <Input
                id="evaluator-name"
                value={draft.name}
                placeholder="Candidate search quality"
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </EditorField>
            <EditorField id="evaluator-description" label="Description">
              <Textarea
                id="evaluator-description"
                className="min-h-16 text-xs"
                rows={2}
                value={draft.description}
                placeholder="What this judge assesses and where it should be used"
                onChange={(e) => onChange({ description: e.target.value })}
              />
            </EditorField>
          </section>
          <section
            aria-label="Judge configuration"
            className="flex min-w-0 flex-col gap-4 border-t pt-5"
          >
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold">Judge</h2>
              <HelpCircle help={studioHelp.prompts} />
            </div>
            <div className="grid min-w-0 gap-4 @xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <EditorSelect
                id="judge-prompt"
                label="Prompt"
                value={draft.prompt.id}
                options={prompts.assets
                  .filter((a) => !a.archived)
                  .map((a) => ({ value: a.id, label: a.name }))}
                onChange={(id) =>
                  onChange({
                    prompt: {
                      id,
                      version:
                        prompts.assets.find((a) => a.id === id)
                          ?.latestVersion ?? 1,
                    },
                  })
                }
              />
              <EditorSelect
                id="judge-prompt-version"
                label="Prompt version"
                value={String(draft.prompt.version)}
                options={versionOptions}
                disabled={!draft.prompt.id}
                onChange={(version) =>
                  onChange({
                    prompt: { ...draft.prompt, version: Number(version) },
                  })
                }
              />
            </div>
            <div className="-mt-2 flex flex-wrap items-center gap-4">
              {draft.prompt.id && (
                <Link
                  className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  href={`/prompts/${draft.prompt.id}`}
                >
                  Open in Prompts
                </Link>
              )}
              <Button
                size="inline"
                variant="link"
                ref={promptTrigger}
                onClick={() => setPromptOpen(true)}
              >
                <Plus />
                Create judge prompt
              </Button>
            </div>
            <div className="grid min-w-0 gap-4 @xl:grid-cols-2">
              {library.models.length ? (
                <EditorSelect
                  id="judge-model"
                  label="Judge model"
                  value={draft.model}
                  options={library.models.map((m) => ({ value: m, label: m }))}
                  onChange={(model) => onChange({ model })}
                />
              ) : (
                <EditorField id="judge-model" label="Judge model">
                  <Input
                    id="judge-model"
                    placeholder="Model ID to configure on your backend"
                    value={draft.model}
                    onChange={(e) => onChange({ model: e.target.value })}
                  />
                </EditorField>
              )}
              <EditorSelect
                id="judge-evidence"
                label="Evidence scope"
                value={draft.evidence}
                options={[
                  { value: "response", label: "Recorded response" },
                  { value: "trajectory", label: "Execution trajectory" },
                ]}
                onChange={(value) =>
                  onChange({
                    evidence:
                      value === "trajectory" ? "trajectory" : "response",
                  })
                }
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Response uses recorded inputs and outcomes. Trajectory also
              includes captured tool events. Missing evidence must be explained
              in the assessment.
            </p>
            {!library.models.length && (
              <p className="text-xs text-muted-foreground">
                Configure a backend model connection before previewing or
                publishing.{" "}
                <Link className="underline" href="/settings/evaluations">
                  Evaluation settings
                </Link>
              </p>
            )}
          </section>
          <section
            aria-label="Score group configuration"
            className="flex min-w-0 flex-col gap-4 border-t pt-5"
          >
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold">Scoring</h2>
              <HelpCircle help={studioHelp.scoreGroups} />
            </div>
            <EditorSelect
              id="judge-score-group"
              label="Score group"
              value={`${draft.scoreGroup.id}:${draft.scoreGroup.version}`}
              options={library.scoreGroups.map((g) => ({
                value: `${g.id}:${g.version}`,
                label: `${g.name} · v${g.version}`,
              }))}
              onChange={(value) => {
                const [id, version] = value.split(":");
                if (id)
                  onChange({ scoreGroup: { id, version: Number(version) } });
              }}
            />
            <div className="-mt-2 flex flex-wrap gap-4">
              <Button
                size="inline"
                variant="link"
                onClick={(event) => {
                  groupTrigger.current = event.currentTarget;
                  setEditingGroup(undefined);
                  setGroupOpen(true);
                }}
              >
                <Plus />
                Create score group
              </Button>
              {group && (
                <Button
                  size="inline"
                  variant="link"
                  onClick={(event) => {
                    groupTrigger.current = event.currentTarget;
                    setEditingGroup(group);
                    setGroupOpen(true);
                  }}
                >
                  {group.id === "assessment"
                    ? "Customize Assessment group"
                    : "Create next group version"}
                </Button>
              )}
            </div>
          </section>
          <p className="text-xs leading-5 text-muted-foreground">
            Save the draft, then preview a recording before publishing.
            Published versions freeze the prompt, model, evidence policy and
            score group.
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="mt-4 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <aside
        aria-label="Evaluator output schema"
        className="flex min-w-0 flex-col gap-6 border-t bg-muted/10 p-4 @lg:p-6 @4xl:border-t-0 @4xl:border-l"
      >
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-semibold">Output fields</h2>
            <HelpCircle help={studioHelp.scoreGroups} />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {group?.name ?? "Select a score group"}
            {group ? ` · v${group.version}` : ""}. Fields are returned together.
          </p>
          {group?.fields.map((field) => (
            <div key={field.id} className="flex flex-col gap-1 border-t pt-3">
              <p className="text-xs font-medium">
                {field.label}{" "}
                <span className="font-normal text-muted-foreground">
                  · {field.type}
                </span>
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {field.description}
              </p>
              {field.type === "numeric" && (
                <p className="text-[11px] text-muted-foreground">
                  {field.min}–{field.max} · {field.direction} is better
                </p>
              )}
              {field.type === "categorical" && (
                <p className="text-[11px] text-muted-foreground">
                  {field.categories.join(" · ")}
                </p>
              )}
            </div>
          ))}
        </section>
        {Boolean(detail?.versions.length) && (
          <details className="border-t pt-4">
            <summary className="cursor-pointer text-xs font-medium">
              Published versions · {detail?.versions.length}
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {detail?.versions.map((v) => (
                <div key={v.version} className="text-xs">
                  <p>
                    Version {v.version} · {v.definition.model}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Prompt v{v.definition.prompt.version} · score group v
                    {v.definition.scoreGroup.version}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
      </aside>
      <EvaluatorPromptDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        name={draft.name}
        onRestoreFocus={() => promptTrigger.current?.focus()}
        onCreated={(id, next) => {
          onPromptsChanged(next);
          onChange({ prompt: { id, version: 1 } });
        }}
      />
      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent
          className="max-h-[85dvh] max-w-xl overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            groupTrigger.current?.focus();
          }}
        >
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-sm font-semibold">
              {editingGroup ? "Configure score group" : "Create score group"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Define the fields returned by this judge. Saved group versions
              remain immutable.
            </DialogDescription>
          </div>
          <ScoreGroupEditor
            key={`${editingGroup?.id ?? "new"}:${editingGroup?.version ?? 0}`}
            {...(editingGroup ? { initialGroup: editingGroup } : {})}
            onCreated={(created) => {
              onGroupCreated(created);
              setGroupOpen(false);
            }}
            onCancel={() => setGroupOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
