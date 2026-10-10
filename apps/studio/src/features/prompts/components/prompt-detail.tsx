"use client";
import {
  canonicalPromptJson,
  type PromptContent,
  promptHash,
} from "@kortyx/prompts";
import {
  type PromptDetail,
  PromptDetailSchema,
  type PromptLibrary,
  PromptLibrarySchema,
  type PromptMutation,
} from "@kortyx/telemetry-contracts";
import { ChevronDown, MoreHorizontal, Play, Save } from "lucide-react";
import { parseAsBoolean, parseAsInteger, parseAsStringLiteral } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { DetailPage } from "@/components/detail/detail-page";
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { EvalDropdown } from "@/features/evals/components/eval-dropdown";
import { EvalRunSetup } from "@/features/evals/components/eval-run-setup";
import { useEvalSetup } from "@/features/evals/hooks/use-eval-setup";
import type { EvalTargets } from "@/features/evals/schema";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter } from "@/lib/scoped-navigation";
import { promptRequest } from "../api/client";
import { categoryPath, downloadJson } from "../lib/presentation";
import { PromptActionSurface } from "./prompt-action-surface";
import {
  type AssetAction,
  assetActions,
  PromptAssetActionDialog,
  PromptAssetMenu,
} from "./prompt-asset-actions";
import { PromptConfirmation } from "./prompt-confirmation";
import {
  PromptDetailHeader,
  PromptHeaderOverflow,
} from "./prompt-detail-header";
import { PromptDiff } from "./prompt-diff";
import { editorClass, PromptFields, validateEditor } from "./prompt-fields";
import { PromptTables } from "./prompt-tables";
import { PromptWorkspace } from "./prompt-workspace";

type Version = PromptDetail["versions"][number];
type Panel = {
  type:
    | "tags"
    | "group"
    | "promote"
    | "code"
    | "review"
    | "move"
    | "rename"
    | "policy"
    | "archive"
    | "restore";
  version: Version;
};
export function PromptDetailView({
  initial,
  initialLibrary,
  targets,
  drawer = false,
}: {
  initial: PromptDetail;
  initialLibrary: PromptLibrary;
  targets: EvalTargets;
  drawer?: boolean;
}) {
  const router = useRouter(),
    [detail, setDetail] = useState(initial),
    [library, setLibrary] = useState(initialLibrary);
  const [query, setQuery] = useStudioQueryStates(
    {
      tab: parseAsStringLiteral([
        "content",
        "evals",
        "runs",
        "reviews",
        "activity",
      ]).withDefault("content"),
      v: parseAsInteger,
      edit: parseAsBoolean.withDefault(false),
      history: parseAsBoolean.withDefault(true),
      promptAction: parseAsStringLiteral([
        "tags",
        "group",
        "promote",
        "code",
        "review",
        "move",
        "rename",
        "policy",
        "archive",
        "restore",
      ]),
      promptActionVersion: parseAsInteger,
    },
    // Client-only panels must not replay an older transition after dismissal.
    { shallow: true, startTransition: undefined },
  );
  const selected =
    detail.versions.find((version) => version.version === query.v) ??
    detail.versions[0]!;
  const [content, setContent] = useState<PromptContent>(
      structuredClone(detail.draft ?? selected.content),
    ),
    [error, setError] = useState(""),
    [readError, setReadError] = useState(""),
    [working, setWorking] = useState(false),
    [confirmation, setConfirmation] = useState<{
      title: string;
      description: string;
      label: string;
      mutation: PromptMutation;
    } | null>(null),
    [confirmDiscard, setConfirmDiscard] = useState(false),
    [fieldsValid, setFieldsValid] = useState(true),
    [autosave, setAutosave] = useState("Draft saved");
  const [compare, setCompare] = useState<{
    before: Version;
    after: Version | { content: PromptContent; version: number };
    save: boolean;
    hash?: string;
    idempotencyKey?: string;
  } | null>(null);
  const panelVersion =
    detail.versions.find(
      (version) => version.version === query.promptActionVersion,
    ) ?? selected;
  const panel: Panel | null = query.promptAction
    ? { type: query.promptAction, version: panelVersion }
    : null;
  const setPanel = (next: Panel | null) => {
    void setQuery({
      promptAction: next?.type ?? null,
      promptActionVersion: next?.version.version ?? null,
    });
  };
  const [note, setNote] = useState(""),
    [groupId, setGroupId] = useState(""),
    [groupName, setGroupName] = useState(""),
    [tagName, setTagName] = useState(""),
    [exception, setException] = useState(false),
    [replace, setReplace] = useState(false);
  const draftRevision = useRef(detail.draftRevision),
    queue = useRef<PromptContent | null>(null),
    pending = useRef<Promise<void> | null>(null),
    conflicted = useRef(false),
    discarding = useRef(false),
    editorVersion = useRef<number | null>(query.edit ? selected.version : null);
  const path = `/prompts/${detail.asset.id}`,
    permissions = library.permissions;
  const inspectedVersion =
    panel && (panel.type === "promote" || panel.type === "review")
      ? panel.version.version
      : query.v;
  useEffect(() => {
    if (query.edit) return;
    const controller = new AbortController();
    const read = () => {
      if (document.visibilityState !== "visible") return;
      void promptRequest(
        `assets/${initial.asset.id}${inspectedVersion ? `?version=${inspectedVersion}` : ""}`,
        undefined,
        controller.signal,
      )
        .then((value) => {
          if (controller.signal.aborted) return;
          const next = PromptDetailSchema.parse(value);
          setReadError("");
          draftRevision.current = next.draftRevision;
          setDetail((current) => ({
            ...next,
            versions: [
              ...next.versions,
              ...current.versions.filter(
                (version) =>
                  !next.versions.some(
                    (item) => item.version === version.version,
                  ),
              ),
            ].sort((a, b) => b.version - a.version),
            versionsNextCursor:
              current.versions.length > 100
                ? current.versionsNextCursor
                : next.versionsNextCursor,
          }));
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setReadError(
              cause instanceof Error ? cause.message : "Prompt unavailable.",
            );
        });
    };
    read();
    const timer = window.setInterval(read, 5000);
    window.addEventListener("focus", read);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", read);
    };
  }, [initial.asset.id, query.edit, inspectedVersion]);
  const { open: openEval } = useEvalSetup(targets);
  const applicable = targets.targets.find((target) =>
    target.manifest?.promptContracts?.some(
      (contract) => contract.id === detail.asset.key,
    ),
  );
  const refresh = async (version?: number, refreshRoute = true) => {
    const next = PromptDetailSchema.parse(
      await promptRequest(
        `assets/${detail.asset.id}${version ? `?version=${version}` : ""}`,
      ),
    );
    draftRevision.current = next.draftRevision;
    setDetail(next);
    setLibrary(PromptLibrarySchema.parse(await promptRequest("library")));
    if (refreshRoute) router.refresh();
    return next;
  };
  const flush = useCallback(() => {
    if (pending.current) return pending.current;
    pending.current = (async () => {
      while (queue.current && !conflicted.current && !discarding.current) {
        const next = queue.current;
        queue.current = null;
        setAutosave("Saving draft…");
        try {
          const result = (await promptRequest("actions", {
            action: "draft",
            id: detail.asset.id,
            content: next,
            baseVersion: detail.asset.latestVersion,
            expectedRevision: draftRevision.current,
          })) as { draftRevision: number };
          draftRevision.current = result.draftRevision;
          setAutosave("Draft saved");
        } catch (cause) {
          conflicted.current = true;
          setAutosave("Draft conflict");
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not save draft. Your local edits are retained.",
          );
        }
      }
    })().finally(() => {
      pending.current = null;
    });
    return pending.current;
  }, [detail.asset.id, detail.asset.latestVersion]);
  useEffect(() => {
    if (
      !query.edit ||
      !fieldsValid ||
      !permissions.edit ||
      conflicted.current ||
      working ||
      confirmDiscard ||
      compare
    )
      return;
    const timer = window.setTimeout(() => {
      if (discarding.current) return;
      try {
        queue.current = validateEditor(content);
        void flush();
      } catch {
        setAutosave("Check prompt fields");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [
    content,
    fieldsValid,
    query.edit,
    compare,
    permissions.edit,
    flush,
    working,
    confirmDiscard,
  ]);
  useEffect(() => {
    if (!query.edit) {
      editorVersion.current = null;
      return;
    }
    if (editorVersion.current === selected.version) return;
    editorVersion.current = selected.version;
    setContent(
      structuredClone(
        detail.draftBase === selected.version && detail.draft
          ? detail.draft
          : selected.content,
      ),
    );
    setFieldsValid(true);
  }, [
    query.edit,
    selected.version,
    selected.content,
    detail.draftBase,
    detail.draft,
  ]);
  const startEdit = (version: Version) => {
    editorVersion.current = version.version;
    conflicted.current = false;
    setContent(
      structuredClone(
        version.version === detail.draftBase && detail.draft
          ? detail.draft
          : version.content,
      ),
    );
    setError("");
    setFieldsValid(true);
    void setQuery({ edit: true, tab: "content", v: version.version });
  };
  const discardDraft = async () => {
    if (discarding.current) return;
    discarding.current = true;
    queue.current = null;
    setWorking(true);
    setError("");
    try {
      // Let our in-flight autosave finish before discarding its revision. A
      // concurrent editor's newer revision must still fail the server CAS.
      await pending.current;
      const result = (await promptRequest("actions", {
        action: "discard-draft",
        id: detail.asset.id,
        expectedRevision: draftRevision.current,
      })) as { draftRevision: number };
      draftRevision.current = result.draftRevision;
      setDetail((current) => ({
        ...current,
        draft: null,
        draftBase: null,
        draftRevision: result.draftRevision,
      }));
      setContent(structuredClone(selected.content));
      setFieldsValid(true);
      conflicted.current = false;
      setAutosave("Draft saved");
      await setQuery({ edit: false });
      setConfirmDiscard(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not discard the draft. Your changes are retained.",
      );
    } finally {
      discarding.current = false;
      setWorking(false);
    }
  };
  const cancelEdit = () => {
    if (
      !fieldsValid ||
      canonicalPromptJson(content) !== canonicalPromptJson(selected.content)
    ) {
      setError("");
      setConfirmDiscard(true);
    } else {
      void discardDraft();
    }
  };
  const act = async (mutation: PromptMutation) => {
    setWorking(true);
    setError("");
    try {
      await promptRequest("actions", mutation);
      await refresh(
        mutation.action === "review" ? mutation.version : undefined,
        // Review notes do not change the library. A route refresh would replace
        // the intercepted drawer while its modal is being dismissed.
        mutation.action !== "review",
      );
      if (mutation.action === "review") {
        await setQuery({
          tab: "reviews",
          v: mutation.version,
          promptAction: null,
          promptActionVersion: null,
        });
      } else {
        setPanel(null);
      }
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Prompt action failed.",
      );
      return false;
    } finally {
      setWorking(false);
    }
  };
  const showPanel = (type: Panel["type"], version: Version) => {
    setNote("");
    setError("");
    setGroupId("");
    setGroupName("");
    setException(false);
    setReplace(false);
    setPanel({ type, version });
  };
  const test = (version: Version) =>
    openEval(applicable?.id, undefined, {
      type: "single",
      id: detail.asset.id,
      version: version.version,
    });

  const destinationPolicy = detail.policies[0];
  const live = detail.asset.assignments.find((item) => item.tag === "live");
  const rollback = Boolean(
    live && panel && panel.version.version < live.version,
  );
  const eligible = detail.evidence.filter(
    (item) =>
      item.version === panel?.version.version &&
      item.fullSuite &&
      item.status === "passed" &&
      item.usage === "verified" &&
      targets.targets.find((target) => target.id === item.targetId)?.revisions[
        item.suiteId
      ] === item.suiteRevision,
  );
  const selectedReviews = (detail.reviews ?? []).filter(
    (review) =>
      review.version === selected.version && review.hash === selected.hash,
  );
  const independentReviews = new Set(
    (detail.reviews ?? [])
      .filter(
        (review) =>
          review.version === panel?.version.version &&
          review.hash === panel?.version.hash &&
          review.independent,
      )
      .map((review) => review.reviewer),
  ).size;
  const missingSuites = (destinationPolicy?.requiredSuites ?? []).filter(
    (suite) =>
      !eligible.some(
        (item) =>
          item.targetId === suite.targetId && item.suiteId === suite.suiteId,
      ),
  );
  const promotionBlocked =
    ((destinationPolicy?.requireTest ?? true) && !eligible.length) ||
    missingSuites.length > 0 ||
    independentReviews < (destinationPolicy?.requiredReviews ?? 0);
  const validException =
    exception &&
    destinationPolicy?.allowException !== false &&
    note.trim().length >= 10;
  const evidence = detail.evidence.filter(
    (item) => item.version === selected.version,
  );
  const selectVersion = (version: number) => {
    void setQuery({
      v: version,
      edit: false,
      promptAction: null,
      promptActionVersion: null,
    });
  };
  const loadOlderVersions = async () => {
    setWorking(true);
    try {
      const older = PromptDetailSchema.parse(
        await promptRequest(
          `assets/${detail.asset.id}?versionsCursor=${detail.versionsNextCursor}`,
        ),
      );
      setDetail((current) => ({
        ...current,
        versions: [
          ...current.versions,
          ...older.versions.filter(
            (version) =>
              !current.versions.some(
                (item) => item.version === version.version,
              ),
          ),
        ].sort((a, b) => b.version - a.version),
        versionsNextCursor: older.versionsNextCursor,
      }));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setWorking(false);
    }
  };
  const versionActions = (version: Version) => (
    <>
      <DropdownMenuItem
        disabled={
          !permissions.promote ||
          detail.asset.archived ||
          live?.version === version.version
        }
        onSelect={() => showPanel("promote", version)}
      >
        Make this live
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={detail.versions.length < 2}
        onSelect={() =>
          setCompare({
            before:
              detail.versions.find((item) => item.version < version.version) ??
              detail.versions.at(-1)!,
            after: version,
            save: false,
          })
        }
      >
        Compare versions
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!permissions.edit || query.edit}
        onSelect={() => startEdit(version)}
      >
        Edit
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!targets.canRun || !applicable || query.edit}
        onSelect={() => test(version)}
      >
        Test this version
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!permissions.edit}
        onSelect={() => showPanel("group", version)}
      >
        Add to test group
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!permissions.edit || detail.asset.archived}
        onSelect={() => {
          setTagName("");
          showPanel("tags", version);
        }}
      >
        Manage tags
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!permissions.review}
        onSelect={() => showPanel("review", version)}
      >
        Review this version
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => showPanel("code", version)}>
        Pinned code helper
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          void promptRequest("export", {
            keys: [detail.asset.key],
            versions: { [detail.asset.key]: version.version },
          })
            .then((bundle) =>
              downloadJson(
                `${detail.asset.key.replaceAll("/", "-")}-v${version.version}.json`,
                bundle,
              ),
            )
            .catch((cause) => setError(String(cause)));
        }}
      >
        Export version
      </DropdownMenuItem>
    </>
  );
  const tagAction =
    panel?.type === "tags" ? (
      <Button
        size="sm"
        disabled={
          working ||
          !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(tagName) ||
          tagName === "live" ||
          detail.asset.assignments.some(
            (item) =>
              item.tag === tagName && item.version === panel.version.version,
          )
        }
        onClick={() => {
          const existing = detail.asset.assignments.find(
            (item) => item.tag === tagName,
          );
          const mutation: PromptMutation = {
            action: "tag-set",
            id: detail.asset.id,
            tag: tagName,
            version: panel.version.version,
            expectedRevision: existing?.revision ?? 0,
          };
          if (existing)
            setConfirmation({
              title: "Move tag?",
              description: `Move ${tagName} from v${existing.version} to v${panel.version.version}? Applications requesting this tag will receive the new version. Live stays unchanged.`,
              label: "Move tag",
              mutation,
            });
          else void act(mutation);
        }}
      >
        Assign tag
      </Button>
    ) : null;
  const releaseAction =
    panel?.type === "promote" || panel?.type === "review" ? (
      <Button
        size="sm"
        disabled={
          working ||
          (panel?.type === "review" && !note.trim()) ||
          (panel?.type === "promote" &&
            ((exception && !validException) ||
              (promotionBlocked && !validException)))
        }
        onClick={() => {
          if (!panel) return;
          const mutation: PromptMutation =
            panel.type === "review"
              ? {
                  action: "review",
                  id: detail.asset.id,
                  version: panel.version.version,
                  note,
                }
              : {
                  action: "promote",
                  id: detail.asset.id,
                  version: panel.version.version,
                  expectedRevision:
                    detail.asset.assignments.find((item) => item.tag === "live")
                      ?.revision ?? 0,
                  rollback:
                    panel.version.version <
                    (detail.asset.assignments.find(
                      (item) => item.tag === "live",
                    )?.version ?? 0),
                  ...(exception ? { exceptionReason: note } : {}),
                };
          void act(mutation);
        }}
      >
        {working
          ? "Saving…"
          : panel?.type === "review"
            ? "Submit review"
            : `${rollback ? "Roll back to" : "Promote"} v${panel?.version.version}`}
      </Button>
    ) : null;
  const view = (
    <div className="@container/prompt-surface flex h-full min-h-0 flex-col">
      <PromptDetailHeader
        title={detail.asset.name}
        promptKey={detail.asset.key}
        category={categoryPath(library.categories, detail.asset.categoryId)}
        version={selected.version}
        live={detail.asset.assignments.some(
          (item) => item.tag === "live" && item.version === selected.version,
        )}
        onBack={() => router.push("/prompts")}
      >
        <div className="flex shrink-0 items-center gap-1.5">
          {!query.edit && (
            <Button
              size="sm"
              variant="outline"
              className="hidden @2xl/prompt-surface:inline-flex"
              disabled={!targets.canRun || !applicable}
              onClick={() => test(selected)}
            >
              <Play className="size-3.5" />
              Test version
            </Button>
          )}
          {query.edit ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="hidden @2xl/prompt-surface:inline-flex"
                disabled={working || Boolean(compare)}
                onClick={cancelEdit}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                aria-label="Save version"
                disabled={
                  working ||
                  !fieldsValid ||
                  Boolean(compare) ||
                  conflicted.current
                }
                onClick={async () => {
                  try {
                    const reviewed = structuredClone(validateEditor(content));
                    queue.current = reviewed;
                    await flush();
                    if (conflicted.current) return;
                    setCompare({
                      before: detail.versions[0]!,
                      after: {
                        content: reviewed,
                        version: detail.asset.latestVersion + 1,
                      },
                      save: true,
                      hash: await promptHash(reviewed),
                      idempotencyKey: crypto.randomUUID(),
                    });
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Check prompt fields.",
                    );
                  }
                }}
              >
                <Save className="hidden size-3.5 @lg/prompt-surface:block" />
                <span className="@lg/prompt-surface:hidden">Save</span>
                <span className="hidden @lg/prompt-surface:inline">
                  Save version
                </span>
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={!permissions.edit || detail.asset.archived}
              onClick={() => startEdit(selected)}
            >
              Edit
            </Button>
          )}
          <PromptAssetMenu
            asset={detail.asset}
            permissions={permissions}
            onAction={(action) => showPanel(action, selected)}
            leadingActions={
              <PromptHeaderOverflow>
                {query.edit ? (
                  <DropdownMenuItem
                    disabled={working || Boolean(compare)}
                    onSelect={cancelEdit}
                  >
                    Cancel editing
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={!targets.canRun || !applicable}
                    onSelect={() => test(selected)}
                  >
                    Test version
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </PromptHeaderOverflow>
            }
          />
        </div>
      </PromptDetailHeader>
      {(error || readError) && !panel && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 border-b bg-destructive/5 px-5 py-3 text-xs text-destructive"
        >
          <span>{error || readError}</span>
          {conflicted.current && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!fieldsValid || working}
                onClick={async () => {
                  setWorking(true);
                  try {
                    await refresh();
                    conflicted.current = false;
                    queue.current = null;
                    setError("");
                    setAutosave(
                      "Review local changes against the latest version",
                    );
                  } catch (cause) {
                    setError(String(cause));
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Use local draft on latest
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadJson(
                    `${detail.asset.key.replaceAll("/", "-")}-draft.json`,
                    content,
                  )
                }
              >
                Export local draft
              </Button>
            </div>
          )}
        </div>
      )}
      <PromptWorkspace>
        <div
          data-prompt-tabs-row
          className="flex shrink-0 items-center gap-2 border-b px-3"
        >
          <nav
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto @sm/prompt-detail:gap-3"
            aria-label="Prompt detail tabs"
          >
            {["content", "evals", "runs", "reviews", "activity"].map((tab) => (
              <button
                type="button"
                key={tab}
                aria-current={query.tab === tab ? "page" : undefined}
                className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-0.5 text-xs capitalize @sm/prompt-detail:px-1 ${query.tab === tab ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() =>
                  void setQuery({
                    tab: tab as typeof query.tab,
                    promptAction: null,
                    promptActionVersion: null,
                  })
                }
              >
                {tab}
                {tab === "evals"
                  ? ` ${new Set(evidence.map((item) => item.evaluationId ?? item.runId)).size}`
                  : tab === "runs"
                    ? ` ${new Set(detail.usage.filter((item) => item.version === selected.version).map((item) => item.runId)).size}`
                    : tab === "reviews"
                      ? ` ${selectedReviews.length}`
                      : ""}
              </button>
            ))}
          </nav>
          <div
            data-prompt-version-picker
            className="shrink-0 @2xl/prompt-detail:hidden"
          >
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="max-w-full gap-1.5 px-2"
                  aria-label={`Version history · v${selected.version}`}
                >
                  <span className="hidden @xl/prompt-detail:inline">
                    Version history ·
                  </span>
                  <span>v{selected.version}</span>
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-80 max-w-[calc(100vw-2rem)] data-[state=closed]:animate-none!"
              >
                <DropdownMenuLabel>Version history</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={String(selected.version)}
                  onValueChange={(value) => selectVersion(Number(value))}
                >
                  {detail.versions.map((version) => (
                    <DropdownMenuRadioItem
                      key={version.version}
                      value={String(version.version)}
                      disabled={query.edit}
                      className="items-start py-2"
                    >
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-center justify-between gap-2 text-xs font-medium">
                          <span>v{version.version}</span>
                          {detail.asset.assignments.some(
                            (item) =>
                              item.tag === "live" &&
                              item.version === version.version,
                          ) && (
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                              Live
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {version.note}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {new Date(version.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {detail.versionsNextCursor && (
                  <DropdownMenuItem
                    disabled={working}
                    onSelect={(event) => {
                      event.preventDefault();
                      void loadOlderVersions();
                    }}
                  >
                    Load older versions
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    v{selected.version} actions
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {versionActions(selected)}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1">
          <aside
            data-prompt-version-history
            className={`${query.history ? "w-56" : "w-12"} hidden shrink-0 border-r @2xl/prompt-detail:block`}
          >
            <Button
              size="sm"
              variant="ghost"
              className="m-2 flex max-w-full items-center gap-2"
              aria-expanded={query.history}
              onClick={() => void setQuery({ history: !query.history })}
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${query.history ? "" : "-rotate-90"}`}
              />
              <span className={query.history ? "" : "sr-only"}>
                Version history
              </span>
            </Button>
            {query.history && (
              <div className="max-h-[calc(100dvh-22rem)] space-y-1 overflow-y-auto px-2 pb-2">
                {detail.versions.map((version) => (
                  <div
                    key={version.version}
                    className={`flex items-start gap-1 rounded-md ${selected.version === version.version ? "bg-muted" : "hover:bg-muted/50"}`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 space-y-1 px-2 py-3 text-left"
                      disabled={query.edit}
                      onClick={() => selectVersion(version.version)}
                    >
                      <span className="flex items-center justify-between gap-2 text-xs font-medium">
                        <span>v{version.version}</span>
                        {detail.asset.assignments.some(
                          (item) =>
                            item.tag === "live" &&
                            item.version === version.version,
                        ) && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                            Live
                          </span>
                        )}
                      </span>
                      {detail.asset.assignments.some(
                        (item) =>
                          item.version === version.version &&
                          item.tag !== "live",
                      ) && (
                        <span
                          className="block truncate text-[10px] text-sky-700 dark:text-sky-400"
                          title={detail.asset.assignments
                            .filter(
                              (item) =>
                                item.version === version.version &&
                                item.tag !== "live",
                            )
                            .map((item) => item.tag)
                            .join(", ")}
                        >
                          {detail.asset.assignments
                            .filter(
                              (item) =>
                                item.version === version.version &&
                                item.tag !== "live",
                            )
                            .map((item) => item.tag)
                            .join(" · ")}
                        </span>
                      )}
                      <span
                        className="block truncate text-[11px] text-muted-foreground"
                        title={version.note}
                      >
                        {version.note}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {new Date(version.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="mt-1 size-8 shrink-0"
                          aria-label={`Version ${version.version} actions`}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="data-[state=closed]:animate-none!"
                      >
                        {versionActions(version)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
                {detail.versionsNextCursor && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={working}
                    onClick={() => void loadOlderVersions()}
                  >
                    Load older versions
                  </Button>
                )}
              </div>
            )}
          </aside>
          <main
            className={`min-h-0 min-w-0 flex-1 ${query.tab === "runs" || query.tab === "evals" ? "overflow-hidden" : "overflow-y-auto p-5"}`}
          >
            {query.tab === "content" ? (
              <div className="w-full space-y-5">
                {query.edit && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs">Editing a draft · {autosave}</p>
                  </div>
                )}
                <PromptFields
                  library={library}
                  ownKey={detail.asset.key}
                  key={`${detail.asset.id}:${selected.version}:${query.edit}`}
                  value={query.edit ? content : selected.content}
                  onChange={setContent}
                  onValidityChange={setFieldsValid}
                  disabled={!query.edit || Boolean(compare) || working}
                />
              </div>
            ) : query.tab === "evals" || query.tab === "runs" ? (
              <PromptTables
                key={`${detail.asset.id}:${selected.version}:${query.tab}`}
                id={detail.asset.id}
                version={selected.version}
                kind={query.tab}
                evidence={evidence}
                canTest={targets.canRun && Boolean(applicable)}
                onTest={() => test(selected)}
              />
            ) : query.tab === "reviews" ? (
              <section
                aria-label={`Reviews for v${selected.version}`}
                className="space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold">
                      Reviews for v{selected.version}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Saved notes for this version. Independent human reviews
                      count toward its promotion policy.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!permissions.review}
                    onClick={() => showPanel("review", selected)}
                  >
                    Review this version
                  </Button>
                </div>
                {selectedReviews.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No reviews yet for v{selected.version}.
                  </p>
                ) : (
                  selectedReviews.map((review) => (
                    <article
                      key={`${review.version}:${review.reviewer}`}
                      className="space-y-3 rounded-lg border p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <p className="break-all text-xs font-medium">
                            {review.reviewer}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {review.independent
                              ? "Independent human review"
                              : "Does not count toward independent reviews"}
                          </p>
                        </div>
                        <time
                          dateTime={review.createdAt}
                          className="text-xs text-muted-foreground"
                        >
                          {new Date(review.createdAt).toLocaleString()}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {review.note}
                      </p>
                    </article>
                  ))
                )}
              </section>
            ) : (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold">Activity</h2>
                {detail.activity.map((item) => (
                  <div key={item.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="text-xs font-medium capitalize">
                        {item.action}
                      </p>
                      <time className="text-[11px] text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                      {item.actor}
                    </p>
                    {typeof item.details.exceptionReason === "string" && (
                      <p className="mt-2 text-xs">
                        Exception: {item.details.exceptionReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </PromptWorkspace>
      <EvalRunSetup targets={targets} matchPath={path} />
      {confirmation && (
        <PromptConfirmation
          title={confirmation.title}
          description={confirmation.description}
          label={confirmation.label}
          busy={working}
          error={error}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            void act(confirmation.mutation).then((ok) => {
              if (ok) setConfirmation(null);
            });
          }}
        />
      )}
      <Dialog
        open={confirmDiscard}
        onOpenChange={(open) => {
          if (!discarding.current) setConfirmDiscard(open);
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            event.stopPropagation();
            if (discarding.current) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (discarding.current) event.preventDefault();
          }}
        >
          <DialogTitle className="pr-6 text-base font-semibold">
            Discard changes?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Your changes, including the autosaved draft, will be lost. You’ll
            return to saved version v{selected.version}. This cannot be undone.
          </DialogDescription>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={working}
              onClick={() => setConfirmDiscard(false)}
            >
              Keep editing
            </Button>
            <Button
              variant="destructive"
              disabled={working}
              onClick={() => void discardDraft()}
            >
              {working ? "Discarding…" : "Discard changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {compare && (
        <PromptDiff
          before={compare.before.content}
          after={compare.after.content}
          beforeLabel={`v${compare.before.version}`}
          afterLabel={
            compare.save
              ? `Draft → v${compare.after.version}`
              : `v${compare.after.version}`
          }
          saving={compare.save}
          working={working}
          selectors={
            !compare.save ? (
              <>
                <EvalDropdown
                  label="Before version"
                  value={String(compare.before.version)}
                  options={detail.versions.map((version) => ({
                    value: String(version.version),
                    label: `v${version.version} · ${version.note}`,
                  }))}
                  onChange={(value) =>
                    setCompare({
                      ...compare,
                      before: detail.versions.find(
                        (version) => version.version === Number(value),
                      )!,
                    })
                  }
                />
                <EvalDropdown
                  label="After version"
                  value={String(compare.after.version)}
                  options={detail.versions.map((version) => ({
                    value: String(version.version),
                    label: `v${version.version} · ${version.note}`,
                  }))}
                  onChange={(value) =>
                    setCompare({
                      ...compare,
                      after: detail.versions.find(
                        (version) => version.version === Number(value),
                      )!,
                    })
                  }
                />
              </>
            ) : undefined
          }
          onClose={() => setCompare(null)}
          onAccept={async (changeNote) => {
            setWorking(true);
            setError("");
            try {
              await promptRequest("actions", {
                action: "save",
                id: detail.asset.id,
                content: compare.after.content,
                baseVersion: detail.asset.latestVersion,
                expectedDraftRevision: draftRevision.current,
                expectedHash: compare.hash,
                note: changeNote,
                idempotencyKey: compare.idempotencyKey,
              });
              const next = await refresh();
              setContent(structuredClone(next.versions[0]!.content));
              await setQuery({ edit: false, v: next.asset.latestVersion });
              setCompare(null);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Save failed. Your draft is retained.",
              );
              setCompare(null);
            } finally {
              setWorking(false);
            }
          }}
        />
      )}
      {panel && assetActions.includes(panel.type as AssetAction) && (
        <PromptAssetActionDialog
          key={`${panel.type}-${panel.version.version}`}
          action={panel.type as AssetAction}
          asset={detail.asset}
          library={library}
          version={panel.version}
          onClose={() => setPanel(null)}
          onDone={refresh}
        />
      )}
      <PromptActionSurface
        modal={
          panel?.type === "promote" ||
          panel?.type === "tags" ||
          panel?.type === "review"
        }
        confirmation={panel?.type === "promote"}
        busy={working}
        actions={
          panel?.type === "promote" || panel?.type === "review"
            ? releaseAction
            : panel?.type === "tags"
              ? tagAction
              : undefined
        }
        open={Boolean(
          panel && !assetActions.includes(panel.type as AssetAction),
        )}
        onClose={() => {
          if (!working) setPanel(null);
        }}
        title={
          panel?.type === "tags"
            ? "Manage tags"
            : panel?.type === "group"
              ? "Add to test group"
              : panel?.type === "promote"
                ? rollback
                  ? "Roll back version"
                  : "Promote version"
                : panel?.type === "review"
                  ? "Review version"
                  : panel?.type === "move"
                    ? "Move prompt"
                    : panel?.type === "rename"
                      ? "Rename prompt"
                      : panel?.type === "policy"
                        ? "Promotion policy"
                        : "Use this prompt"
        }
        description={`v${panel?.version.version ?? selected.version} · ${detail.asset.key}`}
        closeLabel="Close prompt action"
      >
        <div className="space-y-5 p-5">
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {panel?.type === "tags" ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Tags point to a version without making it live. Use names such
                as staging or development for your own release workflow.
              </p>
              <div className="flex flex-wrap gap-2">
                {detail.asset.assignments
                  .filter((item) => item.version === panel.version.version)
                  .map((item) => (
                    <span
                      key={item.tag}
                      className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"
                    >
                      {item.tag}
                      {item.tag !== "live" && (
                        <button
                          type="button"
                          aria-label={`Remove tag ${item.tag}`}
                          disabled={working}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setConfirmation({
                              title: "Remove tag?",
                              description: `Applications requesting ${item.tag} will no longer resolve this prompt. The version and live tag stay unchanged.`,
                              label: "Remove tag",
                              mutation: {
                                action: "tag-remove",
                                id: detail.asset.id,
                                tag: item.tag,
                                expectedRevision: item.revision,
                              },
                            })
                          }
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
              </div>
              <label
                htmlFor="prompt-tag-name"
                className="block space-y-2 text-xs font-medium"
              >
                <span>Tag name</span>
                <Input
                  id="prompt-tag-name"
                  placeholder="staging"
                  value={tagName}
                  onChange={(event) => setTagName(event.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, hyphens, and underscores. The live
                tag is managed through promotion.
              </p>
            </div>
          ) : panel?.type === "group" ? (
            <>
              <EvalDropdown
                label="Test group"
                className="w-full"
                value={groupId}
                options={library.groups.map((group) => ({
                  value: group.id,
                  label: group.name,
                }))}
                onChange={(id) => {
                  setGroupId(id);
                  setReplace(false);
                }}
              />
              <div className="space-y-2">
                <label htmlFor="new-group-name" className="text-xs font-medium">
                  Or create a group
                </label>
                <Input
                  id="new-group-name"
                  value={groupName}
                  onChange={(event) => {
                    setGroupName(event.target.value);
                    setGroupId("");
                  }}
                  placeholder="Candidate experiment"
                />
              </div>
              {library.groups
                .find((group) => group.id === groupId)
                ?.members.some(
                  (member) =>
                    member.promptId === detail.asset.id &&
                    member.version !== panel.version.version,
                ) && (
                <label className="flex items-start gap-2 rounded-md border p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(event) => setReplace(event.target.checked)}
                  />
                  Replace the selected version of this prompt in the group
                </label>
              )}
              <Button
                size="sm"
                disabled={
                  working ||
                  (!groupId && !groupName.trim()) ||
                  Boolean(
                    library.groups
                      .find((group) => group.id === groupId)
                      ?.members.some(
                        (member) =>
                          member.promptId === detail.asset.id &&
                          member.version !== panel.version.version,
                      ) && !replace,
                  )
                }
                onClick={async () => {
                  setWorking(true);
                  setError("");
                  try {
                    const group = library.groups.find(
                      (group) => group.id === groupId,
                    );
                    const members = [
                      ...(group?.members ?? []).filter(
                        (member) => member.promptId !== detail.asset.id,
                      ),
                      {
                        promptId: detail.asset.id,
                        version: panel.version.version,
                      },
                    ];
                    await promptRequest(
                      "actions",
                      group
                        ? {
                            action: "group-update",
                            id: group.id,
                            expectedRevision: group.revision,
                            members,
                          }
                        : {
                            action: "group-create",
                            name: groupName.trim(),
                            members,
                          },
                    );
                    await refresh();
                    setPanel(null);
                  } catch (cause) {
                    setError(String(cause));
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Add version to group
              </Button>
            </>
          ) : (
            <>
              {panel?.type === "promote" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {live
                      ? `Live will move from v${live.version} to v${panel.version.version}.`
                      : `v${panel.version.version} will be the first live version.`}{" "}
                    Applications using live will receive this version. Optional
                    tags stay unchanged.
                  </p>
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
                    <p className="font-medium">Promotion readiness</p>
                    <p>
                      {destinationPolicy?.requireTest === false &&
                      !missingSuites.length
                        ? "Passing evaluations are optional under this prompt's policy."
                        : eligible.length
                          ? `${eligible.length} passing full suite${eligible.length === 1 ? "" : "s"} with verified usage`
                          : "A passing full suite is required before making this version live."}
                    </p>
                    {missingSuites.length > 0 && (
                      <p className="text-destructive">
                        {missingSuites.length} required suite
                        {missingSuites.length === 1 ? "" : "s"} still need a
                        passing evaluation.
                      </p>
                    )}
                    {(destinationPolicy?.requiredReviews ?? 0) > 0 && (
                      <p>
                        {independentReviews} /{" "}
                        {destinationPolicy?.requiredReviews} independent human
                        review
                        {destinationPolicy?.requiredReviews === 1 ? "" : "s"}{" "}
                        required for this version.
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      Evaluations must use this exact version with the current
                      live companion prompts. Individual tests remain available
                      as supporting evidence.
                    </p>
                  </div>
                  {promotionBlocked && (
                    <p className="text-xs text-muted-foreground">
                      {destinationPolicy?.allowException === false
                        ? "Complete the requirements above before promoting. Policy exceptions are disabled for this prompt."
                        : "Complete the requirements above, or provide an exception reason to make this version live without meeting them. The reason is saved in the activity log."}
                    </p>
                  )}
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={exception}
                      disabled={destinationPolicy?.allowException === false}
                      onChange={(event) => {
                        setException(event.target.checked);
                        setError("");
                      }}
                    />
                    Request an audited policy exception
                  </label>
                </>
              )}
              {panel?.type === "review" && (
                <p className="text-xs text-muted-foreground">
                  Your review is saved to v{panel.version.version} and appears
                  in its Reviews tab. Submitting again updates your existing
                  review for this version.
                </p>
              )}
              {(panel?.type === "review" || exception) && (
                <div className="space-y-2">
                  <label
                    htmlFor="prompt-action-note"
                    className="text-xs font-medium"
                  >
                    {panel?.type === "review"
                      ? "Review note"
                      : "Exception reason"}
                  </label>
                  <textarea
                    id="prompt-action-note"
                    className={`${editorClass} min-h-24 font-sans`}
                    value={note}
                    aria-describedby={
                      exception ? "prompt-exception-help" : undefined
                    }
                    aria-invalid={
                      exception && note.length > 0 && note.trim().length < 10
                        ? true
                        : undefined
                    }
                    onChange={(event) => {
                      setNote(event.target.value);
                      setError("");
                    }}
                  />
                  {exception && (
                    <p
                      id="prompt-exception-help"
                      className="text-xs text-muted-foreground"
                    >
                      Explain why you are bypassing the policy. At least 10
                      characters required ({note.trim().length}/10).
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </PromptActionSurface>
    </div>
  );
  return drawer ? (
    <DetailDrawer
      customHeader
      matchPath={path}
      dismissPath="/prompts"
      title={detail.asset.name}
      description={detail.asset.key}
    >
      {view}
    </DetailDrawer>
  ) : (
    <DetailPage title={detail.asset.name} description={detail.asset.key}>
      {view}
    </DetailPage>
  );
}
