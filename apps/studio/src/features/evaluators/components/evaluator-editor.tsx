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
import { Archive, MoreHorizontal, Pencil, Plus, Save, X } from "lucide-react";
import { parseAsBoolean, parseAsInteger, parseAsStringLiteral } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { DetailDrawer } from "@/components/detail/detail-drawer";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { DETAIL_TAB_IDS } from "@/lib/detail-tab-contract";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { evaluatorRequest } from "../api/client";
import type { EvaluatorPreviewData } from "../schema";
import { EvaluatorDetailHeader } from "./evaluator-detail-header";
import { EvaluatorPreview } from "./evaluator-preview";
import { JudgeContentEditor } from "./judge-content-editor";
import { JudgeDetailsDialog } from "./judge-details-dialog";
import {
  JudgeVersionHistory,
  JudgeVersionPicker,
} from "./judge-version-history";

const judgeContentIdentity = (definition: EvaluatorDefinition) =>
  JSON.stringify([definition.content, definition.model, definition.evidence]);

export function EvaluatorEditor({
  library,
  initial,
  initialPreview,
  drawer = false,
}: {
  library: EvaluatorLibrary;
  initial: EvaluatorDetail | null;
  initialPreview: EvaluatorPreviewData;
  drawer?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useStudioQueryStates(
    {
      v: parseAsInteger,
      edit: parseAsBoolean.withDefault(false),
      history: parseAsBoolean.withDefault(true),
      tab: parseAsStringLiteral(DETAIL_TAB_IDS.evaluators).withDefault(
        "content",
      ),
    },
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const [saveIntent, setSaveIntent] = useState<"draft" | "version" | null>(
    null,
  );
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
        (!detail.versions[0] ||
          judgeContentIdentity(detail.evaluator.draft) !==
            judgeContentIdentity(detail.versions[0].definition)),
    );
  const title = detail?.evaluator.draft.name ?? (draft.name || "New judge");
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
  const persist = async (input = draft) => {
    const definition = EvaluatorDefinitionSchema.parse(input);
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
  const saveDraft = async (input = draft) => {
    if (!input.name.trim()) {
      setSaveIntent("draft");
      setDetailsOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await persist(input);
      setNotice("Draft saved.");
      if (!detail) router.replace(`/evaluators/${result.id}?edit=true`);
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
    }
  };
  const saveVersion = async (input = draft) => {
    if (!input.name.trim()) {
      setSaveIntent("version");
      setDetailsOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const asset =
        JSON.stringify(input) !== saved || !detail
          ? await persist(input)
          : detail.evaluator;
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
    void setQuery({ v: version, edit: version === null, tab: "content" });
  const openDraft = () => {
    if (!hasDraft)
      setDraft({
        ...structuredClone(value),
        name: detail?.evaluator.draft.name ?? draft.name,
        description: detail?.evaluator.draft.description ?? draft.description,
      });
    void setQuery({ edit: true, v: null, tab: "content" });
    setNotice("");
  };
  const historyProps = {
    versions: detail?.versions ?? [],
    selectedVersion: selected?.version,
    editing,
    hasDraft: hasDraft || !detail?.versions.length,
    dirty,
    disabled: busy,
    onSelect: selectVersion,
  };
  const renameJudge = async (metadata: {
    name: string;
    description: string;
  }) => {
    if (!detail) {
      const next = { ...draft, ...metadata };
      setDraft(next);
      if (saveIntent === "draft") await saveDraft(next);
      if (saveIntent === "version") await saveVersion(next);
      setSaveIntent(null);
      return;
    }
    const result = EvaluatorSchema.parse(
      await evaluatorRequest(`${detail.evaluator.id}/metadata`, {
        ...metadata,
        revision: detail.evaluator.revision,
      }),
    );
    setDetail({ ...detail, evaluator: result });
    setDraft((previous) => ({ ...previous, ...metadata }));
    setSaved((previous) =>
      JSON.stringify({ ...JSON.parse(previous), ...metadata }),
    );
    setNotice("Judge details updated.");
  };
  const view = (
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              ref={actionsTrigger}
              aria-label="Judge actions"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!library.canEdit || archived || busy}
              onSelect={() => {
                setSaveIntent(null);
                setDetailsOpen(true);
              }}
            >
              <Pencil />
              Rename judge
            </DropdownMenuItem>
            {detail && (
              <DropdownMenuItem
                disabled={!library.canEdit || archived || busy || dirty}
                onSelect={() => setArchiveOpen(true)}
              >
                <Archive />
                Archive judge
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
      <div className="min-h-0 min-w-0 flex-1">
        <DetailTabs
          family="evaluators"
          actions={
            !detail || query.tab === "content" ? (
              <JudgeVersionPicker {...historyProps} />
            ) : undefined
          }
          helpByTab={{
            content: studioHelp.evaluators,
            preview: studioHelp.evaluators,
          }}
          tabs={[
            {
              id: "content",
              label: "Content",
              content: (
                <div className="flex h-full min-h-0 min-w-0">
                  <JudgeVersionHistory
                    {...historyProps}
                    expanded={query.history}
                    onExpandedChange={(history) => void setQuery({ history })}
                  />
                  <ScrollArea
                    type="auto"
                    className="min-h-0 min-w-0 flex-1"
                    viewportClassName="overscroll-contain"
                  >
                    <JudgeContentEditor
                      value={value}
                      models={library.models}
                      mode={editing ? (busy ? "saving" : "editing") : "reading"}
                      onChange={(next) => {
                        setDraft(next);
                        setNotice("");
                      }}
                    />
                  </ScrollArea>
                </div>
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
                            Save the draft before previewing these changes.
                          </p>
                        )}
                        {!library.workerAvailable && library.canEdit && (
                          <p className="text-xs text-muted-foreground">
                            Connect a backend judge model and preview worker to
                            run this judge.
                          </p>
                        )}
                        <EvaluatorPreview
                          key={`${detail.evaluator.id}:${editing ? detail.evaluator.revision : selected?.version}`}
                          initial={initialPreview}
                          id={detail.evaluator.id}
                          revision={detail.evaluator.revision}
                          version={!editing ? selected?.version : undefined}
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
      <JudgeDetailsDialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setSaveIntent(null);
        }}
        name={draft.name}
        description={draft.description}
        existing={Boolean(detail)}
        submitLabel={
          saveIntent === "draft"
            ? "Save draft"
            : saveIntent === "version"
              ? "Save version"
              : "Save details"
        }
        onRestoreFocus={() => actionsTrigger.current?.focus()}
        onSave={renameJudge}
      />
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
  );
  return drawer ? (
    <DetailDrawer
      customHeader
      title={title}
      description="Versioned judge instructions"
      matchPath={`/evaluators/${detail?.evaluator.id ?? "new"}`}
      dismissPath="/evaluators"
    >
      {view}
    </DetailDrawer>
  ) : (
    <DetailPage
      customHeader
      title={title}
      description="Versioned judge instructions"
    >
      {view}
    </DetailPage>
  );
}
