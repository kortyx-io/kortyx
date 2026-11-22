"use client";
import {
  type EvaluatorDefinition,
  EvaluatorDefinitionSchema,
  type EvaluatorDetail,
  EvaluatorDetailSchema,
  type EvaluatorExecution,
  EvaluatorExecutionSchema,
  type EvaluatorLibrary,
  EvaluatorSchema,
  PromptDetailSchema,
  type PromptLibrary,
  PromptLibrarySchema,
  type ScoreGroup,
} from "@kortyx/telemetry-contracts";
import { parseAsString, parseAsStringLiteral } from "nuqs";
import { useEffect, useState } from "react";
import { z } from "zod";
import { TablePageHeader } from "@/components/data-table/table-page-header";
import { useWorkspaceLabel } from "@/components/layouts/workspace-labels";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EvalTargets } from "@/features/evals/schema";
import { promptRequest } from "@/features/prompts/api/client";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { evaluatorRequest } from "../api/client";
import { EditorField, EditorSelect } from "./editor-fields";
import { EvaluatorDatasets } from "./evaluator-datasets";
import { EvaluatorPreview } from "./evaluator-preview";
import { EvaluatorRules } from "./evaluator-rules";
import { ExecutionResult } from "./execution-result";
import { ScoreGroupEditor } from "./score-group-editor";

const tabs = [
  "configuration",
  "preview",
  "rules",
  "executions",
  "datasets",
] as const;
export function EvaluatorEditor({
  library: initialLibrary,
  initial,
  prompts: initialPrompts,
  targets,
}: {
  library: EvaluatorLibrary;
  initial: EvaluatorDetail | null;
  prompts: PromptLibrary;
  targets: EvalTargets | null;
}) {
  const router = useRouter();
  useWorkspaceLabel(
    initial ? `/evaluators/${initial.evaluator.id}` : "/evaluators/new",
    initial?.evaluator.draft.name ?? "New evaluator",
  );
  const [query, setQuery] = useStudioQueryStates(
    {
      tab: parseAsStringLiteral(tabs).withDefault("configuration"),
      runId: parseAsString.withDefault(""),
    },
    { shallow: true },
  );
  const [library, setLibrary] = useState(initialLibrary);
  const [detail, setDetail] = useState(initial);
  const [prompts, setPrompts] = useState(initialPrompts);
  const [draft, setDraft] = useState<EvaluatorDefinition>(
    initial?.evaluator.draft ?? {
      name: "",
      description: "",
      prompt: { id: "", version: 1 },
      model: initialLibrary.models[0] ?? "",
      scoreGroup: { id: "assessment", version: 1 },
      evidence: "response",
    },
  );
  const [saved, setSaved] = useState(
    JSON.stringify(initial?.evaluator.draft ?? null),
  );
  const [versions, setVersions] = useState<
    { version: number; label: string }[]
  >([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ScoreGroup | undefined>();
  const [creatingPrompt, setCreatingPrompt] = useState(false);
  const [rubric, setRubric] = useState("");
  const [promptKey, setPromptKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedExecution, setSelectedExecution] = useState("");
  const dirty = JSON.stringify(draft) !== saved;
  const archived = detail?.evaluator.archived ?? false;
  const disabled = busy || !library.canEdit || archived;
  const group = library.scoreGroups.find(
    (g) =>
      g.id === draft.scoreGroup.id && g.version === draft.scoreGroup.version,
  );
  const change = (value: Partial<EvaluatorDefinition>) => {
    setDraft((old) => ({ ...old, ...value }));
    setNotice("");
  };
  useEffect(() => {
    if (!draft.prompt.id) return;
    const abort = new AbortController();
    void promptRequest(
      `assets/${draft.prompt.id}?version=${draft.prompt.version}`,
      undefined,
      abort.signal,
    )
      .then((value) => {
        const parsed = PromptDetailSchema.parse(value);
        setVersions(
          parsed.versions.map((v) => ({
            version: v.version,
            label: `Version ${v.version} · ${v.note || "Saved prompt"}`,
          })),
        );
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : "Prompt unavailable.");
      });
    return () => abort.abort();
  }, [draft.prompt.id, draft.prompt.version]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const refresh = async () => {
    if (detail)
      setDetail(
        EvaluatorDetailSchema.parse(
          await evaluatorRequest(detail.evaluator.id),
        ),
      );
  };
  const save = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const definition = EvaluatorDefinitionSchema.parse(draft);
      const result = EvaluatorSchema.parse(
        await evaluatorRequest(
          detail?.evaluator.id ?? "",
          detail
            ? { definition, revision: detail.evaluator.revision }
            : definition,
        ),
      );
      setSaved(JSON.stringify(definition));
      if (!detail) {
        router.push(`/evaluators/${result.id}`);
        return;
      }
      setDetail({ ...detail, evaluator: result });
      setNotice("Draft saved.");
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? (e.issues[0]?.message ?? "Check the configuration.")
          : e instanceof Error
            ? e.message
            : "Could not save evaluator.",
      );
    } finally {
      setBusy(false);
    }
  };
  const groupCreated = (created: ScoreGroup) => {
    setLibrary((old) => ({
      ...old,
      scoreGroups: [...old.scoreGroups, created],
    }));
    change({ scoreGroup: { id: created.id, version: created.version } });
    setCreatingGroup(false);
  };
  const [execution, setExecution] = useState<EvaluatorExecution | null>(null);
  useEffect(() => {
    setExecution(null);
    if (!selectedExecution) return;
    const controller = new AbortController();
    void evaluatorRequest(
      `executions/${selectedExecution}`,
      undefined,
      controller.signal,
    )
      .then((value) => setExecution(EvaluatorExecutionSchema.parse(value)))
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Execution unavailable.");
      });
    return () => controller.abort();
  }, [selectedExecution]);
  return (
    <div className="flex h-full min-w-0 flex-col" data-evaluator-editor="true">
      <TablePageHeader
        title={detail ? detail.evaluator.draft.name : "New evaluator"}
        description={
          archived
            ? "Archived evaluator · published history remains available"
            : "Configure a reusable judge and test it against recorded evidence"
        }
        help={studioHelp.evaluators}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={disabled || !dirty}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save draft"}
            </Button>
            <Button
              disabled={
                disabled ||
                dirty ||
                !detail ||
                !library.models.includes(draft.model)
              }
              onClick={async () => {
                if (!detail) return;
                setBusy(true);
                setError("");
                try {
                  const result = EvaluatorSchema.parse(
                    await evaluatorRequest(`${detail.evaluator.id}/publish`, {
                      revision: detail.evaluator.revision,
                    }),
                  );
                  setDetail({ ...detail, evaluator: result });
                  await refresh();
                  setNotice(
                    `Published version ${result.publishedVersion}. Existing rules retain their selected versions.`,
                  );
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not publish.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Publish version
            </Button>
          </>
        }
      />
      <nav
        className="flex shrink-0 flex-wrap items-center gap-2 border-b px-5 py-3"
        aria-label="Evaluator sections"
      >
        {tabs.map((tab) => (
          <Button
            key={tab}
            variant={query.tab === tab ? "secondary" : "ghost"}
            size="sm"
            aria-current={query.tab === tab ? "page" : undefined}
            disabled={!detail && tab !== "configuration"}
            onClick={() => void setQuery({ tab })}
          >
            {tab[0]?.toUpperCase()}
            {tab.slice(1)}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {dirty
            ? "Unsaved changes"
            : detail?.evaluator.publishedVersion
              ? `Published v${detail.evaluator.publishedVersion}`
              : "Draft"}
        </span>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-destructive p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {notice && (
          <output className="mb-4 block rounded-md border p-3 text-sm">
            {notice}
          </output>
        )}
        {query.tab === "configuration" && (
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <fieldset disabled={disabled} className="flex flex-col gap-5">
                <EditorField id="evaluator-name" label="Evaluator name">
                  <Input
                    id="evaluator-name"
                    placeholder="Candidate search quality"
                    value={draft.name}
                    onChange={(e) => change({ name: e.target.value })}
                  />
                </EditorField>
                <EditorField id="evaluator-description" label="Description">
                  <Textarea
                    id="evaluator-description"
                    placeholder="What this judge assesses and where it should be used"
                    value={draft.description}
                    onChange={(e) => change({ description: e.target.value })}
                  />
                </EditorField>
                <section className="flex flex-col gap-4 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">Judge prompt</h2>
                    <HelpCircle help={studioHelp.prompts} />
                  </div>
                  <EditorSelect
                    id="judge-prompt"
                    label="Prompt"
                    value={draft.prompt.id}
                    options={prompts.assets
                      .filter((a) => !a.archived)
                      .map((a) => ({ value: a.id, label: a.name }))}
                    onChange={(id) => {
                      setVersions([]);
                      change({
                        prompt: {
                          id,
                          version:
                            prompts.assets.find((a) => a.id === id)
                              ?.latestVersion ?? 1,
                        },
                      });
                    }}
                  />
                  {draft.prompt.id && (
                    <>
                      <EditorSelect
                        id="judge-prompt-version"
                        label="Prompt version"
                        value={String(draft.prompt.version)}
                        options={[
                          ...(versions.some(
                            (v) => v.version === draft.prompt.version,
                          )
                            ? []
                            : [
                                {
                                  value: String(draft.prompt.version),
                                  label: `Version ${draft.prompt.version}`,
                                },
                              ]),
                          ...versions.map((v) => ({
                            value: String(v.version),
                            label: v.label,
                          })),
                        ]}
                        onChange={(version) =>
                          change({
                            prompt: {
                              ...draft.prompt,
                              version: Number(version),
                            },
                          })
                        }
                      />
                      <Link
                        className="text-sm underline"
                        href={`/prompts/${draft.prompt.id}`}
                      >
                        Open in Prompts
                      </Link>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Use the evidence variable for recorded inputs and outcomes.
                    Studio adds the selected field schema and evidence
                    limitations to the request.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setCreatingPrompt((v) => !v)}
                  >
                    Create judge prompt
                  </Button>
                  {creatingPrompt && (
                    <section className="flex flex-col gap-3 rounded-md border p-3">
                      <EditorField id="judge-prompt-key" label="Prompt key">
                        <Input
                          id="judge-prompt-key"
                          placeholder="evaluators/candidate-quality"
                          value={promptKey}
                          onChange={(e) => setPromptKey(e.target.value)}
                        />
                      </EditorField>
                      <EditorField id="judge-rubric" label="Rubric">
                        <Textarea
                          id="judge-rubric"
                          placeholder="Assess whether candidate claims are supported by successful recorded search results. Explain missing evidence."
                          rows={6}
                          value={rubric}
                          onChange={(e) => setRubric(e.target.value)}
                        />
                      </EditorField>
                      <Button
                        disabled={!rubric.trim() || !promptKey.trim()}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            const result = z.object({ id: z.uuid() }).parse(
                              await promptRequest("actions", {
                                action: "create",
                                key: promptKey,
                                name: draft.name
                                  ? `${draft.name} rubric`
                                  : "Evaluation rubric",
                                categoryId: null,
                                note: "Created from evaluator configuration",
                                idempotencyKey: crypto.randomUUID(),
                                content: {
                                  format: "system-user",
                                  messages: [
                                    { role: "system", content: rubric },
                                    {
                                      role: "user",
                                      content:
                                        "Assess this recorded evidence.\n{{evidence}}",
                                    },
                                  ],
                                  variablesSchema: {
                                    type: "object",
                                    properties: {
                                      evidence: { type: "string" },
                                    },
                                    required: ["evidence"],
                                    additionalProperties: false,
                                  },
                                  configSchema: {
                                    type: "object",
                                    properties: {},
                                    additionalProperties: false,
                                  },
                                  config: {},
                                  dependencies: [],
                                },
                              }),
                            );
                            setPrompts(
                              PromptLibrarySchema.parse(
                                await promptRequest("library"),
                              ),
                            );
                            change({ prompt: { id: result.id, version: 1 } });
                            setCreatingPrompt(false);
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Could not create prompt.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Save prompt version
                      </Button>
                    </section>
                  )}
                </section>
                {library.models.length ? (
                  <EditorSelect
                    id="judge-model"
                    label="Judge model"
                    value={draft.model}
                    options={library.models.map((m) => ({
                      value: m,
                      label: m,
                    }))}
                    onChange={(model) => change({ model })}
                  />
                ) : (
                  <EditorField id="judge-model" label="Judge model">
                    <Input
                      id="judge-model"
                      placeholder="Model ID to configure on your backend"
                      value={draft.model}
                      onChange={(e) => change({ model: e.target.value })}
                    />
                  </EditorField>
                )}
                {!library.models.length && (
                  <p className="text-sm text-muted-foreground">
                    Configure a server-side evaluator model connection before
                    previewing or publishing.{" "}
                    <Link className="underline" href="/settings/evaluations">
                      Evaluation settings
                    </Link>
                  </p>
                )}
                <EditorSelect
                  id="judge-evidence"
                  label="Evidence scope"
                  value={draft.evidence}
                  options={[
                    {
                      value: "response",
                      label: "Recorded response and interaction boundaries",
                    },
                    {
                      value: "trajectory",
                      label: "Recorded execution trajectory and tool evidence",
                    },
                  ]}
                  onChange={(value) =>
                    change({
                      evidence:
                        value === "trajectory" ? "trajectory" : "response",
                    })
                  }
                  description="Only captured data is available. Missing or omitted evidence must be explained in the assessment."
                />
                <section className="flex flex-col gap-4 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">Score group</h2>
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
                        change({
                          scoreGroup: { id, version: Number(version) },
                        });
                    }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingGroup(undefined);
                      setCreatingGroup(true);
                    }}
                  >
                    Create score group
                  </Button>
                  {group && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditingGroup(group);
                        setCreatingGroup(true);
                      }}
                    >
                      {group.id === "assessment"
                        ? "Customize Assessment group"
                        : "Create next group version"}
                    </Button>
                  )}
                  {creatingGroup && (
                    <ScoreGroupEditor
                      {...(editingGroup ? { initialGroup: editingGroup } : {})}
                      onCreated={groupCreated}
                      onCancel={() => setCreatingGroup(false)}
                    />
                  )}
                </section>
              </fieldset>
              {detail && !archived && (
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm">
                    Archive evaluator
                  </summary>
                  <p className="my-3 text-sm text-muted-foreground">
                    Archiving disables rules and removes dataset defaults.
                    Published versions and results remain readable.
                  </p>
                  <Button
                    variant="destructive"
                    disabled={disabled || dirty}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await evaluatorRequest(
                          `${detail.evaluator.id}/archive`,
                          { revision: detail.evaluator.revision },
                        );
                        await refresh();
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Could not archive.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Archive evaluator
                  </Button>
                </details>
              )}
            </div>
            <aside className="flex min-w-0 flex-col gap-5">
              <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
                <h2 className="font-medium">Output fields</h2>
                <p className="text-xs text-muted-foreground">
                  The judge fills these fields together in one response.
                </p>
                {group?.fields.map((field) => (
                  <div
                    key={field.id}
                    className="flex flex-col gap-1 border-t pt-3"
                  >
                    <p className="text-sm font-medium">
                      {field.label}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {field.type}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {field.description}
                    </p>
                    {field.type === "numeric" && (
                      <p className="text-xs">
                        {field.min}–{field.max} · {field.direction} is better
                      </p>
                    )}
                    {field.type === "categorical" && (
                      <p className="text-xs">{field.categories.join(" · ")}</p>
                    )}
                  </div>
                ))}
              </section>
              <section className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
                <h2 className="font-medium">Before publishing</h2>
                <p className="text-muted-foreground">
                  Save the draft, preview representative recordings, and review
                  the written conclusion and evidence. Publication pins the
                  prompt, model, evidence policy and score group.
                </p>
              </section>
              {detail && (
                <section className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
                  <h2 className="font-medium">Published versions</h2>
                  {detail.versions.map((v) => (
                    <div key={v.version}>
                      <p>
                        Version {v.version} · {v.definition.model}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Prompt v{v.definition.prompt.version} · score group v
                        {v.definition.scoreGroup.version}
                      </p>
                    </div>
                  ))}
                </section>
              )}
            </aside>
          </div>
        )}
        {detail && query.tab === "preview" && (
          <EvaluatorPreview
            id={detail.evaluator.id}
            revision={detail.evaluator.revision}
            publishedVersion={detail.evaluator.publishedVersion}
            disabled={
              dirty || archived || !library.canRun || !library.workerAvailable
            }
            initialRunId={query.runId}
          />
        )}
        {detail && query.tab === "rules" && (
          <EvaluatorRules
            detail={detail}
            disabled={
              disabled || !library.canRun || !detail.evaluator.publishedVersion
            }
            workerAvailable={library.workerAvailable}
            onSaved={refresh}
          />
        )}
        {detail && query.tab === "datasets" && (
          <EvaluatorDatasets
            detail={detail}
            targets={targets}
            disabled={disabled || !detail.evaluator.publishedVersion}
            onSaved={refresh}
          />
        )}
        {detail && query.tab === "executions" && (
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <section className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Execution history</h2>
                <Button variant="secondary" onClick={() => void refresh()}>
                  Refresh history
                </Button>
              </div>
              {!detail.executions.length && (
                <p className="text-sm text-muted-foreground">
                  Preview this evaluator or assess a recorded run to see its
                  execution history.
                </p>
              )}
              {detail.executions.map((item) => (
                <Button
                  key={item.id}
                  variant={
                    selectedExecution === item.id ? "secondary" : "outline"
                  }
                  className="h-auto justify-start whitespace-normal p-3 text-left"
                  onClick={() => setSelectedExecution(item.id)}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span>
                      {item.source} · {item.status} · {item.environment}
                    </span>
                    <span className="break-all font-mono text-xs">
                      {item.target.type === "run"
                        ? item.target.runId
                        : `${item.target.caseId} · attempt ${item.target.repetition}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </span>
                </Button>
              ))}
            </section>
            {execution && <ExecutionResult execution={execution} />}
          </div>
        )}
      </div>
    </div>
  );
}
