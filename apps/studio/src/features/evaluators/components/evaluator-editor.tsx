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
  type PromptLibrary,
  type ScoreGroup,
} from "@kortyx/telemetry-contracts";
import { Archive, MoreHorizontal, Save, Upload } from "lucide-react";
import { parseAsString } from "nuqs";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DetailPage } from "@/components/detail/detail-page";
import { type DetailTab, DetailTabs } from "@/components/detail/detail-tabs";
import { useWorkspaceLabel } from "@/components/layouts/workspace-labels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EvalTargets } from "@/features/evals/schema";
import type { DetailTabId } from "@/lib/detail-tab-contract";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { evaluatorRequest } from "../api/client";
import { EvaluatorConfiguration } from "./evaluator-configuration";
import { EvaluatorDatasets } from "./evaluator-datasets";
import { EvaluatorDetailHeader } from "./evaluator-detail-header";
import { EvaluatorPreview } from "./evaluator-preview";
import { EvaluatorRules } from "./evaluator-rules";
import { ExecutionResult } from "./execution-result";

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
  const [query] = useStudioQueryStates(
    { runId: parseAsString.withDefault("") },
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState("");
  const [execution, setExecution] = useState<EvaluatorExecution | null>(null);
  const dirty = JSON.stringify(draft) !== saved;
  const archived = detail?.evaluator.archived ?? false;
  const disabled = busy || !library.canEdit || archived;
  const title = detail?.evaluator.draft.name ?? "New evaluator";
  useWorkspaceLabel(
    initial ? `/evaluators/${initial.evaluator.id}` : "/evaluators/new",
    title,
  );
  const change = (value: Partial<EvaluatorDefinition>) => {
    setDraft((old) => ({ ...old, ...value }));
    setNotice("");
  };
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
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
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Execution unavailable.",
          );
      });
    return () => controller.abort();
  }, [selectedExecution]);
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
    } catch (cause) {
      setError(
        cause instanceof z.ZodError
          ? (cause.issues[0]?.message ?? "Check the configuration.")
          : cause instanceof Error
            ? cause.message
            : "Could not save evaluator.",
      );
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish.");
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
  };
  const tabs: (DetailTab & { id: DetailTabId<"evaluators"> })[] = [
    {
      id: "configuration",
      label: "Configuration",
      content: (
        <EvaluatorConfiguration
          draft={draft}
          detail={detail}
          library={library}
          prompts={prompts}
          disabled={disabled}
          onChange={change}
          onGroupCreated={groupCreated}
          onPromptsChanged={setPrompts}
        />
      ),
    },
  ];
  if (detail)
    tabs.push(
      {
        id: "preview",
        label: "Preview",
        content: (
          <div className="p-4 @lg:p-6">
            <EvaluatorPreview
              id={detail.evaluator.id}
              revision={detail.evaluator.revision}
              publishedVersion={detail.evaluator.publishedVersion}
              disabled={
                dirty || archived || !library.canRun || !library.workerAvailable
              }
              initialRunId={query.runId}
            />
          </div>
        ),
      },
      {
        id: "rules",
        label: "Rules",
        content: (
          <div className="p-4 @lg:p-6">
            <EvaluatorRules
              detail={detail}
              disabled={
                disabled ||
                !library.canRun ||
                !detail.evaluator.publishedVersion
              }
              workerAvailable={library.workerAvailable}
              onSaved={refresh}
            />
          </div>
        ),
      },
      {
        id: "executions",
        label: "Executions",
        content: (
          <div className="grid min-h-full min-w-0 @3xl:grid-cols-[20rem_minmax(0,1fr)]">
            <section
              aria-label="Execution history"
              className="min-w-0 border-b @3xl:border-r @3xl:border-b-0"
            >
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-xs font-medium">Execution history</h2>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => void refresh()}
                >
                  Refresh history
                </Button>
              </div>
              {!detail.executions.length && (
                <p className="p-4 text-xs leading-5 text-muted-foreground">
                  Preview this evaluator or assess a recording to see its
                  execution history.
                </p>
              )}
              {detail.executions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selectedExecution === item.id}
                  className="flex w-full min-w-0 flex-col gap-1 border-b px-4 py-3 text-left text-xs hover:bg-muted/50 aria-pressed:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setSelectedExecution(item.id)}
                >
                  <span>
                    {item.source} · {item.status} · {item.environment}
                  </span>
                  <span className="max-w-full truncate font-mono text-[11px] text-muted-foreground">
                    {item.target.type === "run"
                      ? item.target.runId
                      : `${item.target.caseId} · attempt ${item.target.repetition}`}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </section>
            <div className="min-w-0 p-4 @lg:p-6">
              {execution ? (
                <ExecutionResult execution={execution} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {selectedExecution
                    ? "Loading assessment…"
                    : "Select an execution to inspect its assessment and evidence."}
                </p>
              )}
            </div>
          </div>
        ),
      },
      {
        id: "datasets",
        label: "Datasets",
        content: (
          <div className="p-4 @lg:p-6">
            <EvaluatorDatasets
              detail={detail}
              targets={targets}
              disabled={disabled || !detail.evaluator.publishedVersion}
              onSaved={refresh}
            />
          </div>
        ),
      },
    );
  return (
    <DetailPage
      title={title}
      description="Evaluator configuration and recorded assessments"
      customHeader
    >
      <div
        className="flex h-full min-h-0 min-w-0 flex-col"
        data-evaluator-editor="true"
      >
        <EvaluatorDetailHeader
          title={title}
          status={
            archived
              ? "Archived · published history remains available"
              : dirty
                ? "Unsaved changes"
                : detail?.evaluator.publishedVersion
                  ? `Published v${detail.evaluator.publishedVersion}`
                  : "Draft"
          }
          onBack={() => router.push("/evaluators")}
        >
          <Button
            size="sm"
            variant="secondary"
            aria-label="Save draft"
            disabled={disabled || !dirty}
            onClick={() => void save()}
          >
            <Save />
            <span className="hidden @lg/evaluator-header:inline">
              Save draft
            </span>
          </Button>
          <Button
            size="sm"
            aria-label="Publish version"
            disabled={
              disabled ||
              dirty ||
              !detail ||
              !library.models.includes(draft.model)
            }
            onClick={() => void publish()}
          >
            <Upload />
            <span className="hidden @lg/evaluator-header:inline">
              Publish version
            </span>
          </Button>
          {detail && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Evaluator actions"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={disabled || dirty}
                  onSelect={() => setArchiveOpen(true)}
                >
                  <Archive />
                  Archive evaluator
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </EvaluatorDetailHeader>
        {error && (
          <p
            role="alert"
            className="shrink-0 border-b px-4 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        )}
        {notice && (
          <output className="shrink-0 border-b px-4 py-2 text-xs text-muted-foreground">
            {notice}
          </output>
        )}
        <div className="min-h-0 flex-1">
          <DetailTabs
            family="evaluators"
            tabs={tabs}
            helpByTab={{
              configuration: studioHelp.evaluators,
              preview: studioHelp.evaluators,
              rules: studioHelp.evaluators,
              executions: studioHelp.evaluators,
              datasets: studioHelp.datasets,
            }}
          />
        </div>
        <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <DialogContent>
            <DialogTitle className="text-sm font-semibold">
              Archive evaluator?
            </DialogTitle>
            <DialogDescription className="text-xs leading-5 text-muted-foreground">
              Archiving disables rules and removes dataset defaults. Published
              versions and results remain readable.
            </DialogDescription>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setArchiveOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  if (!detail) return;
                  setBusy(true);
                  setError("");
                  try {
                    await evaluatorRequest(`${detail.evaluator.id}/archive`, {
                      revision: detail.evaluator.revision,
                    });
                    await refresh();
                    setArchiveOpen(false);
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not archive.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Archive evaluator
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DetailPage>
  );
}
