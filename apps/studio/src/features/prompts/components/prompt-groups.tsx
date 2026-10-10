"use client";
import {
  type PromptDetail,
  PromptDetailSchema,
  type PromptGroup,
  type PromptLibrary,
  PromptLibrarySchema,
} from "@kortyx/telemetry-contracts";
import { MoreHorizontal, Play, Plus, Trash2, Users } from "lucide-react";
import { parseAsString, parseAsStringLiteral } from "nuqs";
import { useEffect, useState } from "react";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { DetailLink } from "@/components/detail/detail-link";
import { DetailPage } from "@/components/detail/detail-page";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  usePromptLibrary,
  useRefreshPromptData,
} from "../hooks/use-prompt-data";
import { PromptConfirmation } from "./prompt-confirmation";
import { PromptWorkspace } from "./prompt-workspace";

export function PromptGroupsView({
  initial,
  targets,
  groupId,
  drawer = false,
}: {
  initial: PromptLibrary;
  targets: EvalTargets;
  groupId?: string;
  drawer?: boolean;
}) {
  const router = useRouter(),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [removing, setRemoving] = useState<{
      group: PromptGroup;
      promptId: string;
      name: string;
    } | null>(null),
    [deleting, setDeleting] = useState<PromptGroup | null>(null),
    [name, setName] = useState(""),
    [promptId, setPromptId] = useState(""),
    [version, setVersion] = useState(""),
    [detail, setDetail] = useState<PromptDetail | null>(null),
    [replace, setReplace] = useState(false),
    [search, setSearch] = useState(""),
    [matches, setMatches] = useState(initial.assets);
  const { data: library = initial, error: readError } =
    usePromptLibrary(initial);
  const refreshPromptData = useRefreshPromptData();
  const [query, setQuery] = useStudioQueryStates(
    {
      groupAction: parseAsStringLiteral(["create", "rename", "member"]),
      groupEditId: parseAsString,
    },
    { shallow: true },
  );
  const form = query.groupAction;
  const editing =
    library.groups.find((item) => item.id === query.groupEditId) ?? null;
  const setForm = (next: typeof form) => {
    void setQuery({
      groupAction: next,
      ...(next === null ? { groupEditId: null } : {}),
    });
  };
  const setEditing = (next: PromptGroup | null) => {
    void setQuery({ groupEditId: next?.id ?? null });
  };
  const group = library.groups.find((item) => item.id === groupId),
    path = groupId ? `/prompts/groups/${groupId}` : "/prompts/groups";
  const { open } = useEvalSetup(targets);
  useEffect(() => {
    setDetail(null);
    if (!promptId) return;
    const controller = new AbortController();
    void promptRequest(`assets/${promptId}`, undefined, controller.signal)
      .then((value) => {
        const detail = PromptDetailSchema.parse(value);
        setDetail(detail);
        setVersion(String(detail.asset.latestVersion));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(String(cause));
      });
    return () => controller.abort();
  }, [promptId]);
  const refresh = async () => {
    await refreshPromptData();
  };
  const act = async (body: unknown) => {
    setWorking(true);
    setError("");
    try {
      await promptRequest("actions", body);
      await refresh();
      setForm(null);
      setDeleting(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Group action failed.");
      return false;
    } finally {
      setWorking(false);
    }
  };
  useEffect(() => {
    if (form !== "member") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void promptRequest(
        `library?${new URLSearchParams({ search })}`,
        undefined,
        controller.signal,
      )
        .then((value) => setMatches(PromptLibrarySchema.parse(value).assets))
        .catch((cause) => {
          if (!controller.signal.aborted) setError(String(cause));
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, form]);
  const compatibleTarget = (group: PromptGroup) =>
    group.members.length
      ? targets.targets.find((target) =>
          group.members.every(
            (member) =>
              !member.archived &&
              target.manifest?.promptContracts?.some(
                (contract) =>
                  contract.id ===
                  (member.key ??
                    library.assets.find((asset) => asset.id === member.promptId)
                      ?.key),
              ),
          ),
        )
      : undefined;
  const run = (group: PromptGroup) => {
    const target = compatibleTarget(group);
    if (target)
      open(target.id, undefined, { type: "group", groupId: group.id });
  };
  const actions = (group: PromptGroup) => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`${group.name} group actions`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!targets.canRun || !compatibleTarget(group)}
          onSelect={() => run(group)}
        >
          Run a suite with this group
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!library.permissions.edit}
          onSelect={() => {
            setEditing(group);
            setForm("rename");
            setName(group.name);
          }}
        >
          Rename group
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!library.permissions.edit}
          onSelect={() => {
            setEditing(group);
            setForm("member");
            setPromptId("");
            setVersion("");
            setReplace(false);
          }}
        >
          Add prompt version
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!library.permissions.edit}
          onSelect={() => setDeleting(group)}
        >
          Delete group…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div className="min-w-0">
          <h1
            hidden={drawer}
            className="truncate text-sm font-semibold"
            title={group?.name}
          >
            {group?.name ?? "Test groups"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {group
              ? `${group.members.length} exact prompt versions`
              : "Named selections of prompt versions for an eval launch."}
          </p>
        </div>
        {group ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!targets.canRun || !compatibleTarget(group)}
              onClick={() => run(group)}
            >
              <Play className="size-3.5" />
              Run a suite
            </Button>
            {actions(group)}
          </div>
        ) : (
          <Button
            size="sm"
            disabled={!library.permissions.edit}
            onClick={() => {
              setName("");
              setForm("create");
            }}
          >
            <Plus className="size-3.5" />
            New group
          </Button>
        )}
      </header>
      {(error || readError) && (
        <p
          role="alert"
          className="border-b bg-destructive/5 px-5 py-3 text-xs text-destructive"
        >
          {error || readError?.message}
        </p>
      )}
      <PromptWorkspace>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [scrollbar-width:thin]">
          {group ? (
            <div className="space-y-3">
              {group.members.map((member) => {
                const asset = library.assets.find(
                  (asset) => asset.id === member.promptId,
                );
                return (
                  <div
                    key={member.promptId}
                    className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <div className="min-w-0">
                      <DetailLink
                        href={`/prompts/${member.promptId}?v=${member.version}`}
                        className="block truncate text-xs font-medium hover:underline"
                      >
                        {member.name ?? asset?.name ?? "Unavailable prompt"}
                      </DetailLink>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {member.key ?? asset?.key ?? member.promptId}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs">
                      v{member.version}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={working || !library.permissions.edit}
                      aria-label={`Remove ${asset?.name ?? member.promptId} from group`}
                      onClick={() => {
                        setError("");
                        setRemoving({
                          group,
                          promptId: member.promptId,
                          name: member.name ?? asset?.name ?? member.promptId,
                        });
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
              <Button
                size="sm"
                variant="outline"
                disabled={!library.permissions.edit}
                onClick={() => {
                  setEditing(group);
                  setForm("member");
                  setPromptId("");
                  setVersion("");
                  setReplace(false);
                }}
              >
                <Plus className="size-3.5" />
                Add prompt version
              </Button>
              <p className="text-xs text-muted-foreground">
                Choose a suite when you run the group. Editing or deleting this
                selection does not change previous evaluations.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] gap-3 border-b bg-muted/20 px-4 py-3 text-[11px] font-medium text-muted-foreground">
                <span>Group</span>
                <span>Prompts</span>
                <span className="sr-only">Actions</span>
              </div>
              {library.groups.length ? (
                library.groups.map((group) => (
                  <div
                    key={group.id}
                    className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-3 border-b px-4 py-3 last:border-0"
                  >
                    <DetailLink
                      href={`/prompts/groups/${group.id}`}
                      className="truncate text-xs font-medium hover:underline"
                    >
                      {group.name}
                    </DetailLink>
                    <span className="text-xs text-muted-foreground">
                      {group.members.length}
                    </span>
                    {actions(group)}
                  </div>
                ))
              ) : (
                <div className="space-y-3 px-4 py-12 text-center">
                  <Users className="mx-auto size-7 text-muted-foreground/50" />
                  <p className="text-xs font-medium">No test groups yet</p>
                  <p className="text-xs text-muted-foreground">
                    Group candidate versions when a workflow uses several
                    prompts.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </PromptWorkspace>
      <EvalRunSetup targets={targets} matchPath={path} />
      <DetailInspectorDrawer
        open={Boolean(form)}
        onClose={() => {
          if (!working) setForm(null);
        }}
        title={
          form === "member"
            ? "Add prompt version"
            : form === "rename"
              ? "Rename group"
              : "New test group"
        }
        description="Groups select versions for testing. They never route production traffic."
        closeLabel="Close group editor"
      >
        <div className="space-y-5 p-5">
          {(error || readError) && (
            <p role="alert" className="text-xs text-destructive">
              {error || readError?.message}
            </p>
          )}
          {form === "member" ? (
            <>
              <Input
                aria-label="Search prompts"
                placeholder="Search names or keys…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <EvalDropdown
                label="Prompt"
                className="w-full"
                value={promptId}
                options={matches.map((asset) => ({
                  value: asset.id,
                  label: asset.name,
                }))}
                onChange={(id) => {
                  setPromptId(id);
                  setReplace(false);
                }}
              />
              <EvalDropdown
                label="Version"
                className="w-full"
                value={version}
                disabled={!detail}
                options={(detail?.versions ?? []).map((item) => ({
                  value: String(item.version),
                  label: `v${item.version} · ${item.note}`,
                }))}
                onChange={setVersion}
              />
              {detail?.versionsNextCursor && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      const next = PromptDetailSchema.parse(
                        await promptRequest(
                          `assets/${promptId}?versionsCursor=${detail.versionsNextCursor}`,
                        ),
                      );
                      setDetail({
                        ...next,
                        versions: [...detail.versions, ...next.versions],
                      });
                    } catch (cause) {
                      setError(String(cause));
                    }
                  }}
                >
                  Load older versions
                </Button>
              )}
              {editing?.members.some(
                (member) =>
                  member.promptId === promptId &&
                  member.version !== Number(version),
              ) && (
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(event) => setReplace(event.target.checked)}
                  />
                  Replace this prompt’s current selection in the group
                </label>
              )}
              <Button
                size="sm"
                disabled={
                  working ||
                  !detail ||
                  !version ||
                  Boolean(
                    editing?.members.some(
                      (member) =>
                        member.promptId === promptId &&
                        member.version !== Number(version),
                    ) && !replace,
                  )
                }
                onClick={() => {
                  if (editing)
                    void act({
                      action: "group-update",
                      id: editing.id,
                      expectedRevision: editing.revision,
                      members: [
                        ...editing.members.filter(
                          (member) => member.promptId !== promptId,
                        ),
                        { promptId, version: Number(version) },
                      ],
                    });
                }}
              >
                Add version
              </Button>
            </>
          ) : (
            <>
              <label htmlFor="group-name" className="text-xs font-medium">
                Group name
              </label>
              <Input
                id="group-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                size="sm"
                disabled={working || !name.trim()}
                onClick={() =>
                  void act(
                    form === "rename"
                      ? {
                          action: "group-update",
                          id: editing?.id,
                          expectedRevision: editing?.revision,
                          name,
                        }
                      : { action: "group-create", name },
                  )
                }
              >
                {working ? "Saving…" : "Save group"}
              </Button>
            </>
          )}
        </div>
      </DetailInspectorDrawer>
      {removing && (
        <PromptConfirmation
          title="Remove prompt from group?"
          description={`Remove ${removing.name} from ${removing.group.name}? The prompt, its versions and historical evaluations will be preserved.`}
          label="Remove from group"
          busy={working}
          error={error}
          destructive
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            void act({
              action: "group-update",
              id: removing.group.id,
              expectedRevision: removing.group.revision,
              members: removing.group.members.filter(
                (item) => item.promptId !== removing.promptId,
              ),
            }).then((ok) => {
              if (ok) setRemoving(null);
            });
          }}
        />
      )}
      {deleting && (
        <PromptConfirmation
          title={`Delete ${deleting.name}?`}
          description="Prompts and their versions are preserved. Historical evals keep their original selection."
          label="Delete group"
          destructive
          busy={working}
          error={error}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const removed = await act({
              action: "group-delete",
              id: deleting.id,
              expectedRevision: deleting.revision,
            });
            if (removed && groupId === deleting.id)
              router.push("/prompts/groups");
          }}
        />
      )}
    </div>
  );
  return drawer ? (
    <DetailDrawer
      matchPath={path}
      dismissPath={groupId ? "/prompts/groups" : "/prompts"}
      title={group?.name ?? "Test groups"}
      description="Candidate versions for testing"
    >
      {content}
    </DetailDrawer>
  ) : (
    <DetailPage
      title={group?.name ?? "Test groups"}
      description="Candidate versions for testing"
    >
      {content}
    </DetailPage>
  );
}
