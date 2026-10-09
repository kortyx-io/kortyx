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
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Code,
  MoreHorizontal,
  Play,
  Save,
} from "lucide-react";
import { parseAsBoolean, parseAsInteger, parseAsStringLiteral } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
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
import { PromptDiff } from "./prompt-diff";
import { editorClass, PromptFields, validateEditor } from "./prompt-fields";
import { PromptTables } from "./prompt-tables";
import { PromptWorkspace } from "./prompt-workspace";

type Version = PromptDetail["versions"][number];
type Panel = {
  type: "group" | "promote" | "code" | "review" | "move" | "rename" | "policy";
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
        "activity",
      ]).withDefault("content"),
      v: parseAsInteger,
      edit: parseAsBoolean.withDefault(false),
      history: parseAsBoolean.withDefault(true),
      promptAction: parseAsStringLiteral([
        "group",
        "promote",
        "code",
        "review",
        "move",
        "rename",
        "policy",
      ]),
      promptActionVersion: parseAsInteger,
    },
    { shallow: true },
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
    [environment, setEnvironment] = useState(
      initialLibrary.environments?.includes("production") !== false
        ? "production"
        : (initialLibrary.environments[0] ?? "production"),
    ),
    [destination, setDestination] = useState("root"),
    [assetName, setAssetName] = useState(detail.asset.name),
    [exception, setException] = useState(false),
    [replace, setReplace] = useState(false),
    [copied, setCopied] = useState(false);
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
  const refresh = async () => {
    const next = PromptDetailSchema.parse(
      await promptRequest(`assets/${detail.asset.id}`),
    );
    draftRevision.current = next.draftRevision;
    setDetail(next);
    setLibrary(PromptLibrarySchema.parse(await promptRequest("library")));
    router.refresh();
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
      await refresh();
      setPanel(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Prompt action failed.",
      );
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
    setCopied(false);
    setAssetName(detail.asset.name);
    setDestination(detail.asset.categoryId ?? "root");
    setPanel({ type, version });
  };
  const test = (version: Version) =>
    openEval(applicable?.id, undefined, {
      type: "single",
      id: detail.asset.id,
      version: version.version,
    });
  const codeVersion = panel?.version ?? selected;
  const code = `import { createPrompts, definePrompt, studioPromptSource, usePrompt, useReason } from "kortyx";\nimport { z } from "zod";\n\nconst promptRef = definePrompt({\n  id: ${JSON.stringify(detail.asset.key)},\n  format: ${JSON.stringify(codeVersion.content.format)},\n  variables: z.fromJSONSchema(${JSON.stringify(codeVersion.content.variablesSchema, null, 2)}),\n  config: z.fromJSONSchema(${JSON.stringify(codeVersion.content.configSchema, null, 2)}),\n});\n\nconst prompts = createPrompts({\n  definitions: [promptRef],\n  source: studioPromptSource({\n    apiUrl: process.env.KORTYX_API_URL!,\n    apiKey: process.env.KORTYX_PROMPTS_API_KEY!,\n    environment: "production",\n  }),\n});\n// Pass prompts to createAgent({ ...yourAgentOptions, prompts }).\n\n// Inside a workflow node:\nconst prompt = await usePrompt(promptRef, {\n  variables: input, // validated against the template input contract\n  version: ${codeVersion.version}, // omit to use the environment assignment\n});\n\nawait useReason({\n  prompt, // preserves system + user, or the complete ordered chat\n  model: myModel, // optionally map prompt.config.modelName to your model registry\n});`;

  const destinationPolicy = detail.policies.find(
    (policy) => policy.environment === environment,
  );
  const eligible = detail.evidence.filter(
    (item) =>
      item.version === panel?.version.version &&
      item.environment === environment &&
      item.fullSuite &&
      item.status === "passed" &&
      item.usage === "verified" &&
      targets.targets.find(
        (target) =>
          target.id === item.targetId && target.environment === environment,
      )?.revisions[item.suiteId] === item.suiteRevision,
  );
  const independentReviews = new Set(
    (detail.reviews ?? [])
      .filter(
        (review) =>
          review.version === panel?.version.version &&
          review.hash === panel?.version.hash &&
          review.environment === environment &&
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
        disabled={!permissions.promote}
        onSelect={() => showPanel("promote", version)}
      >
        Promote / roll back…
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
  const view = (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex w-full min-w-0 flex-none items-start gap-3 sm:w-auto sm:min-w-48 sm:flex-1">
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0"
            aria-label="Back to prompt library"
            onClick={() => router.push("/prompts")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h1
              hidden={drawer}
              className="truncate text-sm font-semibold"
              title={detail.asset.name}
            >
              {detail.asset.name}
            </h1>
            <p
              hidden={drawer}
              className="mt-1 truncate font-mono text-[11px] text-muted-foreground"
            >
              {detail.asset.key}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {categoryPath(library.categories, detail.asset.categoryId)} · v
              {selected.version}
              {detail.asset.assignments.some(
                (item) => item.version === selected.version,
              )
                ? " · Assigned"
                : " · Candidate"}
            </p>
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2 sm:justify-end">
          {!query.edit && (
            <Button
              size="sm"
              variant="outline"
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
                disabled={working || Boolean(compare)}
                onClick={cancelEdit}
              >
                Cancel
              </Button>
              <Button
                size="sm"
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
                <Save className="size-3.5" />
                Save version
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Prompt actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => showPanel("code", selected)}>
                Code helper
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!permissions.edit}
                onSelect={() => showPanel("rename", selected)}
              >
                Rename prompt
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!permissions.edit}
                onSelect={() => showPanel("move", selected)}
              >
                Move to category
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!permissions.settings}
                onSelect={() => showPanel("policy", selected)}
              >
                Promotion policy
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={
                  !permissions.edit || detail.asset.assignments.length > 0
                }
                onSelect={() =>
                  void act({
                    action: "update",
                    id: detail.asset.id,
                    expectedRevision: detail.asset.revision,
                    archived: !detail.asset.archived,
                  })
                }
              >
                {detail.asset.archived ? "Restore prompt" : "Archive prompt"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
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
      <nav
        className="flex shrink-0 gap-5 overflow-x-auto border-b px-5"
        aria-label="Prompt detail tabs"
      >
        {["content", "evals", "runs", "activity"].map((tab) => (
          <button
            type="button"
            key={tab}
            aria-current={query.tab === tab ? "page" : undefined}
            className={`min-h-11 border-b-2 px-1 text-xs capitalize ${query.tab === tab ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
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
                : ""}
          </button>
        ))}
      </nav>
      <PromptWorkspace>
        <div
          className={`shrink-0 border-b px-5 py-2 ${query.tab === "runs" || query.tab === "evals" ? "" : "@4xl/prompt-detail:hidden"}`}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="max-w-full gap-2">
                Version history
                <span className="text-muted-foreground">
                  · v{selected.version}
                </span>
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-80 max-w-[calc(100vw-2rem)]"
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
                          (item) => item.version === version.version,
                        ) && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                            Assigned
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
        <div className="flex min-h-0 flex-1">
          <aside
            className={`${query.history ? "w-56" : "w-12"} hidden shrink-0 border-r ${query.tab === "runs" || query.tab === "evals" ? "" : "@4xl/prompt-detail:block"}`}
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
                          (item) => item.version === version.version,
                        ) && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                            Assigned
                          </span>
                        )}
                      </span>
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
                    <DropdownMenu>
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
                      <DropdownMenuContent align="end">
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
              setCompare(null);
              const next = await refresh();
              setContent(structuredClone(next.versions[0]!.content));
              void setQuery({ edit: false, v: next.asset.latestVersion });
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
      <DetailInspectorDrawer
        open={Boolean(panel)}
        onClose={() => {
          if (!working) setPanel(null);
        }}
        title={
          panel?.type === "group"
            ? "Add to test group"
            : panel?.type === "promote"
              ? "Promote version"
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
          {panel?.type === "code" ? (
            <>
              <p className="text-xs text-muted-foreground">
                Register this reference with createPrompts. The messages and
                configuration come from Studio.
              </p>
              <pre className="overflow-auto rounded-lg border bg-muted/30 p-4 text-[11px] leading-6">
                {code}
              </pre>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                }}
              >
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Code className="size-3.5" />
                )}
                {copied ? "Copied" : "Copy code"}
              </Button>
            </>
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
          ) : panel?.type === "move" ? (
            <>
              <EvalDropdown
                label="Destination category"
                value={destination}
                className="w-full"
                options={[
                  { value: "root", label: "Root" },
                  ...library.categories.map((category) => ({
                    value: category.id,
                    label: categoryPath(library.categories, category.id),
                  })),
                ]}
                onChange={setDestination}
              />
              <Button
                size="sm"
                disabled={working}
                onClick={() =>
                  void act({
                    action: "update",
                    id: detail.asset.id,
                    expectedRevision: detail.asset.revision,
                    categoryId: destination === "root" ? null : destination,
                  })
                }
              >
                Move prompt
              </Button>
            </>
          ) : panel?.type === "rename" ? (
            <>
              <Input
                aria-label="Prompt name"
                value={assetName}
                onChange={(event) => setAssetName(event.target.value)}
              />
              <Button
                size="sm"
                disabled={working || !assetName.trim()}
                onClick={() =>
                  void act({
                    action: "update",
                    id: detail.asset.id,
                    expectedRevision: detail.asset.revision,
                    name: assetName,
                  })
                }
              >
                Rename prompt
              </Button>
            </>
          ) : panel?.type === "policy" ? (
            <PolicyEditor
              detail={detail}
              working={working}
              targets={targets}
              environments={library.environments ?? ["production"]}
              onSave={(policy) => void act({ action: "policy", policy })}
            />
          ) : (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="prompt-target-environment"
                  className="text-xs font-medium"
                >
                  Destination environment
                </label>
                <EvalDropdown
                  label="Destination environment"
                  className="w-full"
                  value={environment}
                  options={(library.environments ?? ["production"]).map(
                    (value) => ({ value, label: value }),
                  )}
                  onChange={(value) => {
                    setEnvironment(value);
                    setException(false);
                  }}
                />
              </div>
              {panel?.type === "promote" && (
                <>
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
                    <p className="font-medium">Promotion readiness</p>
                    <p>
                      {eligible.length
                        ? `${eligible.length} passing full suite${eligible.length === 1 ? "" : "s"} with verified usage`
                        : "No eligible passing full suite in this environment"}
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
                        required for this version and environment.
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      Evaluations must use this exact version with the
                      environment’s current companion prompts. Individual tests
                      remain available as supporting evidence.
                    </p>
                  </div>
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={exception}
                      disabled={destinationPolicy?.allowException === false}
                      onChange={(event) => setException(event.target.checked)}
                    />
                    Request an audited policy exception
                  </label>
                </>
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
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              )}
              <Button
                size="sm"
                disabled={
                  working ||
                  !environment.trim() ||
                  (panel?.type === "review" && !note.trim()) ||
                  (exception && note.trim().length < 10)
                }
                onClick={() => {
                  if (!panel) return;
                  void act(
                    panel.type === "review"
                      ? {
                          action: "review",
                          id: detail.asset.id,
                          version: panel.version.version,
                          environment,
                          note,
                        }
                      : {
                          action: "promote",
                          id: detail.asset.id,
                          version: panel.version.version,
                          environment,
                          expectedRevision:
                            detail.asset.assignments.find(
                              (item) => item.environment === environment,
                            )?.revision ?? 0,
                          rollback:
                            panel.version.version <
                            (detail.asset.assignments.find(
                              (item) => item.environment === environment,
                            )?.version ?? 0),
                          ...(exception ? { exceptionReason: note } : {}),
                        },
                  );
                }}
              >
                {working
                  ? "Saving…"
                  : panel?.type === "review"
                    ? "Submit review"
                    : `Promote v${panel?.version.version}`}
              </Button>
            </>
          )}
        </div>
      </DetailInspectorDrawer>
    </div>
  );
  return drawer ? (
    <DetailDrawer
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
function PolicyEditor({
  detail,
  working,
  targets,
  environments,
  onSave,
}: {
  detail: PromptDetail;
  working: boolean;
  targets: EvalTargets;
  environments: string[];
  onSave: (policy: PromptDetail["policies"][number]) => void;
}) {
  const [environment, setEnvironment] = useState(
      environments.includes("production")
        ? "production"
        : (environments[0] ?? "production"),
    ),
    existing = detail.policies.find(
      (policy) => policy.environment === environment,
    );
  const [requireTest, setRequireTest] = useState(existing?.requireTest ?? true),
    [requiredReviews, setRequiredReviews] = useState(
      String(existing?.requiredReviews ?? 0),
    ),
    [allowException, setAllowException] = useState(
      existing?.allowException ?? true,
    ),
    [suites, setSuites] = useState(existing?.requiredSuites ?? []);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="policy-environment" className="text-xs font-medium">
          Environment
        </label>
        <EvalDropdown
          label="Policy environment"
          className="w-full"
          value={environment}
          options={environments.map((value) => ({ value, label: value }))}
          onChange={(value) => {
            setEnvironment(value);
            const policy = detail.policies.find(
              (item) => item.environment === value,
            );
            setRequireTest(policy?.requireTest ?? true);
            setRequiredReviews(String(policy?.requiredReviews ?? 0));
            setAllowException(policy?.allowException ?? true);
            setSuites(policy?.requiredSuites ?? []);
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={requireTest}
          onChange={(event) => setRequireTest(event.target.checked)}
        />
        Require a passing full suite with verified prompt usage
      </label>
      <div className="space-y-2">
        <label htmlFor="policy-reviews" className="text-xs font-medium">
          Independent human reviews
        </label>
        <Input
          id="policy-reviews"
          type="number"
          min={0}
          max={10}
          value={requiredReviews}
          onChange={(event) => setRequiredReviews(event.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={allowException}
          onChange={(event) => setAllowException(event.target.checked)}
        />
        Allow explicit, audited exceptions
      </label>
      <div className="space-y-2">
        <p className="text-xs font-medium">Required suites</p>
        <p className="text-[11px] text-muted-foreground">
          All selected suites must pass in the destination environment.
        </p>
        <div className="max-h-64 space-y-2 overflow-auto rounded-md border p-3">
          {suites
            .filter(
              (item) =>
                !targets.targets.some(
                  (target) =>
                    target.environment === environment &&
                    target.id === item.targetId &&
                    target.manifest?.suites.some(
                      (suite) => suite.id === item.suiteId,
                    ),
                ),
            )
            .map((item) => (
              <label
                key={`${item.targetId}:${item.suiteId}`}
                className="flex items-start gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    setSuites((current) =>
                      current.filter(
                        (suite) =>
                          suite.targetId !== item.targetId ||
                          suite.suiteId !== item.suiteId,
                      ),
                    )
                  }
                />
                <span>
                  {item.suiteId}
                  <span className="block text-muted-foreground">
                    {item.targetId} · Currently unavailable; uncheck to remove
                  </span>
                </span>
              </label>
            ))}
          {targets.targets
            .filter((target) => target.environment === environment)
            .flatMap((target) =>
              (target.manifest?.suites ?? []).map((suite) => {
                const checked = suites.some(
                  (item) =>
                    item.targetId === target.id && item.suiteId === suite.id,
                );
                return (
                  <label
                    key={`${target.id}:${suite.id}`}
                    className="flex items-start gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={working}
                      onChange={() =>
                        setSuites((current) =>
                          checked
                            ? current.filter(
                                (item) =>
                                  item.targetId !== target.id ||
                                  item.suiteId !== suite.id,
                              )
                            : [
                                ...current,
                                { targetId: target.id, suiteId: suite.id },
                              ],
                        )
                      }
                    />
                    <span>
                      {suite.id}
                      <span className="block text-[11px] text-muted-foreground">
                        {target.name ?? target.id} · {target.environment}
                      </span>
                    </span>
                  </label>
                );
              }),
            )}
          {!targets.targets.some(
            (target) =>
              target.environment === environment &&
              target.manifest?.suites.length,
          ) && (
            <p className="text-xs text-muted-foreground">
              Connect an application to choose required suites.
            </p>
          )}
        </div>
      </div>
      <Button
        size="sm"
        disabled={
          working ||
          !environment.trim() ||
          !/^\d+$/.test(requiredReviews) ||
          Number(requiredReviews) > 10
        }
        onClick={() =>
          onSave({
            environment,
            revision: existing?.revision ?? 0,
            requireTest,
            requiredReviews: Number(requiredReviews),
            allowException,
            requiredSuites: suites,
          })
        }
      >
        Save policy
      </Button>
    </div>
  );
}
