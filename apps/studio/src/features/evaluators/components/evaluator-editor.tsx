"use client";
import {
  DEFAULT_JUDGE_CONTENT,
  type EvaluatorDefinition,
  EvaluatorDefinitionSchema,
  type EvaluatorDetail,
  EvaluatorDetailSchema,
  type EvaluatorLibrary,
  EvaluatorSchema,
} from "@kortyx/telemetry-contracts";
import {
  Archive,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Save,
  X,
} from "lucide-react";
import { parseAsBoolean, parseAsInteger } from "nuqs";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DetailPage } from "@/components/detail/detail-page";
import { DetailTabs } from "@/components/detail/detail-tabs";
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
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { evaluatorRequest } from "../api/client";
import { EvaluatorDetailHeader } from "./evaluator-detail-header";
import { EvaluatorPreview } from "./evaluator-preview";
import { JudgeContentEditor } from "./judge-content-editor";

export function EvaluatorEditor({
  library,
  initial,
}: {
  library: EvaluatorLibrary;
  initial: EvaluatorDetail | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useStudioQueryStates(
    { v: parseAsInteger, edit: parseAsBoolean.withDefault(false) },
    { shallow: true },
  );
  const [detail, setDetail] = useState(initial);
  const [draft, setDraft] = useState<EvaluatorDefinition>(
    initial?.evaluator.draft ?? {
      name: "",
      description: "",
      content: structuredClone(DEFAULT_JUDGE_CONTENT),
      model: library.models[0] ?? "",
      evidence: "trajectory",
    },
  );
  const [saved, setSaved] = useState(
    JSON.stringify(initial?.evaluator.draft ?? null),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [archiveOpen, setArchiveOpen] = useState(false);
  const archived = detail?.evaluator.archived ?? false;
  const editing =
    (!detail || !detail.evaluator.publishedVersion || query.edit) &&
    library.canEdit &&
    !archived;
  const dirty = JSON.stringify(draft) !== saved;
  const selected =
    detail?.versions.find((version) => version.version === query.v) ??
    detail?.versions[0];
  const value = editing ? draft : (selected?.definition ?? draft);
  const hasDraft =
    dirty ||
    Boolean(
      detail &&
        (!selected ||
          JSON.stringify(detail.evaluator.draft) !==
            JSON.stringify(detail.versions[0]?.definition)),
    );
  const title = detail?.evaluator.draft.name ?? "New judge";
  useWorkspaceLabel(
    detail ? `/evaluators/${detail.evaluator.id}` : "/evaluators/new",
    title,
  );
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const readDetail = async (id: string) => {
    const next = EvaluatorDetailSchema.parse(await evaluatorRequest(id));
    setDetail(next);
    return next;
  };
  const persist = async () => {
    const definition = EvaluatorDefinitionSchema.parse(draft);
    const result = EvaluatorSchema.parse(
      await evaluatorRequest(
        detail?.evaluator.id ?? "",
        detail
          ? { definition, revision: detail.evaluator.revision }
          : definition,
      ),
    );
    setDraft(definition);
    setSaved(JSON.stringify(definition));
    if (detail) setDetail({ ...detail, evaluator: result });
    else await readDetail(result.id);
    return result;
  };
  const report = (cause: unknown) =>
    setError(
      cause instanceof z.ZodError
        ? (cause.issues[0]?.message ?? "Check judge instructions.")
        : cause instanceof Error
          ? cause.message
          : "Could not save judge.",
    );
  const saveDraft = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await persist();
      setNotice("Draft saved.");
      if (!detail) router.replace(`/evaluators/${result.id}?edit=true`);
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
    }
  };
  const saveVersion = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const asset = dirty || !detail ? await persist() : detail.evaluator;
      const published = EvaluatorSchema.parse(
        await evaluatorRequest(`${asset.id}/publish`, {
          revision: asset.revision,
        }),
      );
      await readDetail(asset.id);
      setSaved(JSON.stringify(published.draft));
      setDraft(published.draft);
      if (!detail)
        router.replace(
          `/evaluators/${asset.id}?v=${published.publishedVersion}`,
        );
      else await setQuery({ v: published.publishedVersion, edit: false });
      setNotice(`Saved version ${published.publishedVersion}.`);
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
    }
  };
  const selectVersion = (version: number | null) =>
    void setQuery({ v: version, edit: version === null });
  const openDraft = () => {
    if (!hasDraft) setDraft(structuredClone(value));
    void setQuery({ edit: true, v: null });
    setNotice("");
  };
  const versionButtons = (
    <>
      {(hasDraft || !detail?.versions.length) && (
        <button
          type="button"
          aria-pressed={editing}
          className="flex w-full flex-col gap-1 rounded-lg px-3 py-3 text-left text-xs hover:bg-muted/60 aria-pressed:bg-muted"
          onClick={() => selectVersion(null)}
        >
          <span>Draft</span>
          <span className="text-[11px] text-muted-foreground">
            {dirty ? "Unsaved changes" : "Saved instructions"}
          </span>
        </button>
      )}
      {detail?.versions.map((version) => (
        <button
          type="button"
          key={version.version}
          aria-pressed={!editing && selected?.version === version.version}
          className="flex w-full flex-col gap-1 rounded-lg px-3 py-3 text-left text-xs hover:bg-muted/60 aria-pressed:bg-muted"
          onClick={() => selectVersion(version.version)}
        >
          <span>v{version.version}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {version.definition.model}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(version.createdAt).toLocaleDateString()}
          </span>
        </button>
      ))}
    </>
  );
  return (
    <DetailPage
      title={title}
      description="Versioned judge instructions"
      customHeader
    >
      <div
        className="@container/judge-detail flex h-full min-h-0 min-w-0 flex-col"
        data-evaluator-editor="true"
      >
        <EvaluatorDetailHeader
          title={title}
          status={
            archived
              ? "Archived"
              : editing
                ? dirty
                  ? "Unsaved changes"
                  : "Draft saved"
                : `v${selected?.version ?? 1} · ${value.model}`
          }
          onBack={() => router.push("/evaluators")}
        >
          {editing ? (
            <>
              {Boolean(detail?.evaluator.publishedVersion) && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Close editor"
                  onClick={() => void setQuery({ edit: false })}
                >
                  <X />
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                aria-label="Save draft"
                disabled={busy || !dirty}
                onClick={() => void saveDraft()}
              >
                <Save />
                <span className="hidden @lg/evaluator-header:inline">
                  Save draft
                </span>
              </Button>
              <Button
                size="sm"
                aria-label="Save version"
                disabled={busy}
                onClick={() => void saveVersion()}
              >
                <Plus />
                <span className="hidden @lg/evaluator-header:inline">
                  Save version
                </span>
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              aria-label={hasDraft ? "Edit draft" : "New version"}
              disabled={!library.canEdit || archived || busy}
              onClick={openDraft}
            >
              <Plus />
              <span className="hidden @lg/evaluator-header:inline">
                {hasDraft ? "Edit draft" : "New version"}
              </span>
            </Button>
          )}
          {detail && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Judge actions"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!library.canEdit || archived || busy || dirty}
                  onSelect={() => setArchiveOpen(true)}
                >
                  <Archive />
                  Archive judge
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
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 @2xl/judge-detail:grid-cols-[14rem_minmax(0,1fr)]">
          <aside
            aria-label="Judge version history"
            className="data-table-body-scroll hidden min-h-0 overflow-y-auto border-r p-2 @2xl/judge-detail:block"
          >
            <h2 className="flex h-9 items-center px-3 text-xs font-medium">
              <ChevronDown className="mr-1 size-3.5" />
              Version history
            </h2>
            {versionButtons}
          </aside>
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="shrink-0 border-b px-3 py-1 @2xl/judge-detail:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost">
                    Version history ·{" "}
                    {editing ? "Draft" : `v${selected?.version ?? 1}`}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {versionButtons}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="min-h-0 flex-1">
              <DetailTabs
                family="evaluators"
                helpByTab={{
                  content: studioHelp.evaluators,
                  preview: studioHelp.evaluators,
                }}
                tabs={[
                  {
                    id: "content",
                    label: "Content",
                    content: (
                      <JudgeContentEditor
                        value={value}
                        models={library.models}
                        mode={
                          editing ? (busy ? "saving" : "editing") : "reading"
                        }
                        newJudge={!detail}
                        onChange={(next) => {
                          setDraft(next);
                          setNotice("");
                        }}
                      />
                    ),
                  },
                  ...(detail
                    ? [
                        {
                          id: "preview" as const,
                          label: "Preview",
                          content: (
                            <div className="flex flex-col gap-4 p-4 @lg:p-5">
                              {editing && dirty && (
                                <p className="text-xs text-muted-foreground">
                                  Save the draft before previewing these
                                  changes.
                                </p>
                              )}
                              {!library.workerAvailable && library.canEdit && (
                                <p className="text-xs text-muted-foreground">
                                  Connect a backend judge model and preview
                                  worker to run this judge.
                                </p>
                              )}
                              <EvaluatorPreview
                                key={`${detail.evaluator.id}:${editing ? detail.evaluator.revision : selected?.version}`}
                                initialExecutionId={
                                  !library.canEdit && !library.canRun
                                    ? detail.executions[0]?.id
                                    : undefined
                                }
                                id={detail.evaluator.id}
                                revision={detail.evaluator.revision}
                                version={
                                  !editing ? selected?.version : undefined
                                }
                                disabled={
                                  busy ||
                                  archived ||
                                  !library.canRun ||
                                  !library.workerAvailable ||
                                  (editing && dirty)
                                }
                              />
                            </div>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </div>
        </div>
        <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <DialogContent>
            <DialogTitle className="text-sm font-semibold">
              Archive judge?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              The judge will no longer be selectable for future dataset
              associations. Saved versions remain available.
            </DialogDescription>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
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
                  try {
                    await evaluatorRequest(`${detail.evaluator.id}/archive`, {
                      revision: detail.evaluator.revision,
                    });
                    await readDetail(detail.evaluator.id);
                    setArchiveOpen(false);
                  } catch (cause) {
                    report(cause);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Archive judge
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DetailPage>
  );
}
