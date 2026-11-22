"use client";
import {
  ASSESSMENT_FIELD,
  type ScoreGroupDefinition,
  ScoreGroupDefinitionSchema,
  type ScoreGroupDetail,
  ScoreGroupDetailSchema,
  scoreGroupOutputSchema,
} from "@kortyx/telemetry-contracts";
import {
  Archive,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
} from "lucide-react";
import { parseAsBoolean, parseAsInteger, parseAsStringLiteral } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  DetailDrawer,
  useDetailDrawer,
} from "@/components/detail/detail-drawer";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { evaluatorRequest } from "../api/client";
import { AssetDetailsDialog } from "./asset-details-dialog";
import { EvaluatorDetailHeader } from "./evaluator-detail-header";
import {
  JudgeVersionHistory,
  JudgeVersionPicker,
} from "./judge-version-history";
import { useScoreGroupBridge } from "./score-group-bridge";
import { ScoreGroupFields } from "./score-group-fields";
import { ScoreGroupJson } from "./score-group-json";

type Props = {
  initial: ScoreGroupDetail | null;
  canEdit: boolean;
  drawer?: boolean;
  judgePath?: string;
};
export function ScoreGroupEditor(props: Props) {
  const [title, setTitle] = useState(
    props.initial?.group.draft.name || "New score group",
  );
  const view = <ScoreGroupEditorBody {...props} onTitleChange={setTitle} />;
  return props.drawer ? (
    <DetailDrawer
      customHeader
      title={title}
      description="Versioned judge output fields"
      matchPath={`/evaluators/score-groups/${props.initial?.group.id ?? "new"}`}
      dismissPath={props.judgePath ?? "/evaluators"}
    >
      {view}
    </DetailDrawer>
  ) : (
    <DetailPage
      customHeader
      title={title}
      description="Versioned judge output fields"
    >
      {view}
    </DetailPage>
  );
}
function ScoreGroupEditorBody({
  initial,
  canEdit,
  judgePath,
  onTitleChange,
}: Props & { onTitleChange: (title: string) => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const { navigation } = useDetailDrawer();
  const bridge = useScoreGroupBridge();
  const [query, setQuery] = useStudioQueryStates(
    {
      groupV: parseAsInteger,
      groupEdit: parseAsBoolean.withDefault(false),
      groupHistory: parseAsBoolean.withDefault(true),
      groupTab: parseAsStringLiteral(["fields", "output"] as const).withDefault(
        "fields",
      ),
    },
    { shallow: true },
  );
  const [detail, setDetail] = useState(initial);
  const [draft, setDraft] = useState<ScoreGroupDefinition>(
    initial?.group.draft ?? {
      name: "",
      description: "",
      fields: [structuredClone(ASSESSMENT_FIELD)],
    },
  );
  const [saved, setSaved] = useState(
    JSON.stringify(initial?.group.draft ?? null),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saveIntent, setSaveIntent] = useState<"draft" | "version" | null>(
    null,
  );
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const builtin = detail?.group.builtin ?? false;
  const archived = detail?.group.archived ?? false;
  const editing =
    canEdit &&
    !builtin &&
    !archived &&
    (!detail?.group.publishedVersion || query.groupEdit);
  const selected =
    detail?.versions.find((version) => version.version === query.groupV) ??
    detail?.versions[0];
  const value = editing
    ? draft
    : {
        ...(selected?.definition ?? draft),
        name: detail?.group.draft.name ?? draft.name,
        description: detail?.group.draft.description ?? draft.description,
      };
  const dirty = JSON.stringify(draft) !== saved;
  const title = detail?.group.draft.name || draft.name || "New score group";
  useEffect(() => onTitleChange(title), [title, onTitleChange]);
  useWorkspaceLabel(
    `/evaluators/score-groups/${detail?.group.id ?? "new"}`,
    title,
  );
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const owner = judgePath ? bridge?.get(judgePath) : undefined;
  const hasDraft =
    !detail?.versions[0] ||
    dirty ||
    JSON.stringify(detail.group.draft.fields) !==
      JSON.stringify(detail.versions[0].definition.fields);
  const history = {
    versions: detail?.versions ?? [],
    selectedVersion: selected?.version,
    editing,
    hasDraft,
    dirty,
    disabled: busy,
    assetName: "score group",
    onSelect: (version: number | null) =>
      void setQuery({
        groupV: version,
        groupEdit: version === null,
        groupTab: "fields",
      }),
  };
  const report = (cause: unknown) =>
    setError(
      cause instanceof z.ZodError
        ? `${cause.issues[0]?.path.join(" · ")}: ${cause.issues[0]?.message}`
        : cause instanceof Error
          ? cause.message
          : "Could not save score group.",
    );
  const parentQuery = () => {
    const next = new URLSearchParams();
    if (judgePath) next.set("judge", judgePath);
    for (const name of ["tab", "edit", "v"]) {
      const value = params.get(name);
      if (value) next.set(name, value);
    }
    return next;
  };
  const persist = async (input = draft) => {
    const definition = ScoreGroupDefinitionSchema.parse(input);
    const result = ScoreGroupDetailSchema.parse(
      await evaluatorRequest(
        `score-groups${detail ? `/${detail.group.id}` : ""}`,
        detail ? { definition, revision: detail.group.revision } : definition,
      ),
    );
    setDetail(result);
    setDraft(result.group.draft);
    setSaved(JSON.stringify(result.group.draft));
    owner?.saved(result.group);
    return result;
  };
  const save = async (publish: boolean, input = draft) => {
    if (!input.name.trim()) {
      setSaveIntent(publish ? "version" : "draft");
      setDetailsOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let next =
        JSON.stringify(input) !== saved || !detail
          ? await persist(input)
          : detail;
      if (publish)
        next = ScoreGroupDetailSchema.parse(
          await evaluatorRequest(`score-groups/${next.group.id}/publish`, {
            revision: next.group.revision,
          }),
        );
      setDetail(next);
      setDraft(next.group.draft);
      setSaved(JSON.stringify(next.group.draft));
      owner?.saved(next.group);
      if (!initial) {
        const query = parentQuery();
        query.set(
          publish ? "groupV" : "groupEdit",
          publish ? String(next.group.publishedVersion) : "true",
        );
        router.replace(`/evaluators/score-groups/${next.group.id}?${query}`);
      } else
        await setQuery({
          groupEdit: !publish,
          groupV: publish ? next.group.publishedVersion : null,
        });
      setNotice(
        publish
          ? `Saved version ${next.group.publishedVersion}.`
          : "Draft saved.",
      );
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
    }
  };
  const duplicate = async () => {
    setBusy(true);
    setError("");
    try {
      const next = ScoreGroupDetailSchema.parse(
        await evaluatorRequest("score-groups", {
          ...structuredClone(value),
          name: `${value.name} copy`.slice(0, 200),
        }),
      );
      owner?.saved(next.group);
      const query = parentQuery();
      query.set("groupEdit", "true");
      router.push(`/evaluators/score-groups/${next.group.id}?${query}`);
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
    }
  };
  const renameGroup = async (metadata: {
    name: string;
    description: string;
  }) => {
    if (!detail) {
      const next = { ...draft, ...metadata };
      setDraft(next);
      if (saveIntent) await save(saveIntent === "version", next);
      setSaveIntent(null);
      return;
    }
    const result = ScoreGroupDetailSchema.parse(
      await evaluatorRequest(`score-groups/${detail.group.id}/metadata`, {
        ...metadata,
        revision: detail.group.revision,
      }),
    );
    const savedMetadata = {
      name: result.group.draft.name,
      description: result.group.draft.description,
    };
    setDetail(result);
    setDraft((previous) => ({ ...previous, ...savedMetadata }));
    setSaved((previous) =>
      JSON.stringify({ ...JSON.parse(previous), ...savedMetadata }),
    );
    owner?.saved(result.group);
    setNotice("Score group details updated.");
  };
  const valid = ScoreGroupDefinitionSchema.safeParse({
    ...value,
    name: value.name.trim() || "New score group",
  });
  const sample = Object.fromEntries(
    value.fields.map((field) => [
      field.id,
      {
        status: "scored",
        value:
          field.type === "text"
            ? "Written assessment"
            : field.type === "boolean"
              ? true
              : field.type === "number"
                ? field.preset === "score"
                  ? 0.8
                  : field.min
                : field.multiple
                  ? [field.options[0]?.id]
                  : field.options[0]?.id,
        reason: "A concise explanation based on the recording.",
        evidence: [],
      },
    ]),
  );
  return (
    <div
      className="@container/judge-detail flex h-full min-h-0 min-w-0 flex-col"
      data-score-group-editor
    >
      <EvaluatorDetailHeader
        title={title}
        kind="Score group"
        help={studioHelp.scoreGroups}
        status={
          builtin
            ? "Built-in · v1 · Read-only"
            : archived
              ? "Archived"
              : editing
                ? dirty
                  ? "Unsaved changes"
                  : "Draft saved"
                : `v${selected?.version ?? 1} · ${value.fields.length} fields`
        }
        onBack={() => router.push(judgePath ?? "/evaluators")}
      >
        {!editing && selected && owner?.canUse() && !archived && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !initial}
            onClick={() => {
              if (detail) {
                owner.use(selected, detail.group);
                navigation?.close();
              }
            }}
          >
            <span className="hidden @md/evaluator-header:inline">
              Use this version
            </span>
            <span className="@md/evaluator-header:hidden">
              Use v{selected.version}
            </span>
          </Button>
        )}
        {editing ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !dirty}
              onClick={() => void save(false)}
              aria-label="Save group draft"
            >
              <Save />
              <span className="hidden @md/evaluator-header:inline">
                Save draft
              </span>
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void save(true)}
              aria-label="Save group version"
            >
              <Plus />
              <span className="hidden @md/evaluator-header:inline">
                Save version
              </span>
            </Button>
          </>
        ) : (
          canEdit &&
          !archived && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                if (builtin) {
                  void duplicate();
                  return;
                }
                if (!hasDraft && selected)
                  setDraft({
                    ...structuredClone(selected.definition),
                    name: detail?.group.draft.name ?? draft.name,
                    description:
                      detail?.group.draft.description ?? draft.description,
                  });
                void setQuery({
                  groupEdit: true,
                  groupV: null,
                  groupTab: "fields",
                });
              }}
              aria-label={builtin ? "Duplicate group" : "New group version"}
            >
              {builtin ? <Copy /> : <Plus />}
              <span className="hidden @md/evaluator-header:inline">
                {builtin
                  ? "Duplicate"
                  : hasDraft
                    ? "Edit draft"
                    : "New version"}
              </span>
            </Button>
          )
        )}
        {canEdit && !builtin && !archived && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Score group actions"
                ref={actionsTrigger}
                disabled={busy}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
                  <Pencil />
                  Rename score group
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void duplicate()}>
                  <Copy />
                  Duplicate group
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
                  <Archive />
                  Archive group
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </EvaluatorDetailHeader>
      {(error || notice) && (
        <p
          role={error ? "alert" : undefined}
          className={`border-b px-4 py-2 text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error || notice}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <DetailTabs
          family="score-group"
          queryKey="groupTab"
          actions={
            query.groupTab === "fields" ? (
              <JudgeVersionPicker {...history} />
            ) : undefined
          }
          helpByTab={{
            fields: studioHelp.scoreGroups,
            output: studioHelp.scoreGroups,
          }}
          tabs={[
            {
              id: "fields",
              label: "Fields",
              content: (
                <div className="flex h-full min-h-0">
                  <JudgeVersionHistory
                    {...history}
                    expanded={query.groupHistory}
                    onExpandedChange={(groupHistory) =>
                      void setQuery({ groupHistory })
                    }
                  />
                  <div className="min-h-0 min-w-0 flex-1">
                    <ScoreGroupFields
                      value={value}
                      editing={editing}
                      disabled={busy}
                      onChange={(next) => {
                        setDraft(next);
                        setNotice("");
                      }}
                    />
                  </div>
                </div>
              ),
            },
            {
              id: "output",
              label: "Output",
              content: (
                <div
                  className="flex flex-col gap-4 p-4 @lg:p-5"
                  data-score-group-output
                >
                  <div>
                    <h2 className="text-xs font-medium">
                      Expected judge output
                    </h2>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Illustrative values show this group’s structure. Select a
                      saved version on the judge, then run Preview to produce
                      real results. All fields are validated together.
                    </p>
                  </div>
                  <ScoreGroupJson
                    label="Example judge output JSON"
                    value={JSON.stringify(sample, null, 2)}
                  />
                  <details>
                    <summary className="cursor-pointer text-xs">
                      Structured output schema
                    </summary>
                    {valid.success ? (
                      <div className="mt-3">
                        <ScoreGroupJson
                          label="Structured output JSON schema"
                          value={JSON.stringify(
                            z.toJSONSchema(scoreGroupOutputSchema(valid.data)),
                            null,
                            2,
                          )}
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Complete field settings to preview the schema.
                      </p>
                    )}
                  </details>
                </div>
              ),
            },
          ]}
        />
      </div>
      <AssetDetailsDialog
        entity="scoreGroup"
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
        onSave={renameGroup}
      />
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogTitle>Archive score group?</DialogTitle>
          <DialogDescription>
            It will no longer be available for new judge selections. Published
            judge snapshots and previous results keep their recorded
            definitions.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setArchiveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={async () => {
                if (!detail) return;
                setBusy(true);
                try {
                  const next = ScoreGroupDetailSchema.parse(
                    await evaluatorRequest(
                      `score-groups/${detail.group.id}/archive`,
                      { revision: detail.group.revision },
                    ),
                  );
                  setDetail(next);
                  owner?.saved(next.group);
                  setArchiveOpen(false);
                } catch (cause) {
                  report(cause);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Archive group
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
