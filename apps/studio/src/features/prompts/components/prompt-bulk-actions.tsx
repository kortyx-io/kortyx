"use client";
import type { PromptLibrary } from "@kortyx/telemetry-contracts";
import { parseAsStringLiteral } from "nuqs";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { EvalDropdown } from "@/features/evals/components/eval-dropdown";
import { useStudioQueryStates } from "@/lib/nuqs";
import { promptRequest } from "../api/client";
import { categoryPath, downloadJson } from "../lib/presentation";
import { PromptActionSurface } from "./prompt-action-surface";

type Asset = PromptLibrary["assets"][number];
export function PromptBulkActions({
  selected,
  library,
  onDone,
  onClear,
}: {
  selected: Asset[];
  library: PromptLibrary;
  onDone: () => Promise<void>;
  onClear: () => void;
}) {
  const [query, setQuery] = useStudioQueryStates(
    {
      bulkPromptAction: parseAsStringLiteral([
        "move",
        "group",
        "archive",
        "restore",
      ]),
    },
    { shallow: true },
  );
  const action = query.bulkPromptAction;
  const setAction = (value: typeof action) => {
    void setQuery({ bulkPromptAction: value });
  };
  const [destination, setDestination] = useState("root"),
    [groupId, setGroupId] = useState(""),
    [name, setName] = useState(""),
    [replace, setReplace] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const group = library.groups.find((item) => item.id === groupId);
  const conflicts = group?.members.some((member) =>
    selected.some(
      (asset) =>
        asset.id === member.promptId && asset.latestVersion !== member.version,
    ),
  );
  const begin = (value: typeof action) => {
    setError("");
    setAction(value);
    setReplace(false);
    setName("");
    setGroupId("");
  };
  const apply = async () => {
    setWorking(true);
    setError("");
    try {
      if (action === "group") {
        const members = [
          ...(group?.members ?? []).filter(
            (member) => !selected.some((asset) => asset.id === member.promptId),
          ),
          ...selected.map((asset) => ({
            promptId: asset.id,
            version: asset.latestVersion,
          })),
        ];
        if (members.length > 100)
          throw new Error("A test group supports at most 100 prompts.");
        await promptRequest(
          "actions",
          group
            ? {
                action: "group-update",
                id: group.id,
                expectedRevision: group.revision,
                members,
              }
            : { action: "group-create", name: name.trim(), members },
        );
      } else
        await promptRequest("actions", {
          action: "bulk-update",
          assets: selected.map((asset) => ({
            id: asset.id,
            expectedRevision: asset.revision,
          })),
          ...(action === "move"
            ? { categoryId: destination === "root" ? null : destination }
            : { archived: action === "archive" }),
        });
      await onDone();
      setAction(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bulk action failed.");
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            {selected.length} selected · Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!library.permissions.edit}
            onSelect={() => begin("move")}
          >
            Move to category…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              !library.permissions.edit ||
              selected.some((asset) => asset.archived)
            }
            onSelect={() => begin("group")}
          >
            Add latest versions to test group…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              setWorking(true);
              setError("");
              try {
                downloadJson(
                  "kortyx-prompts.json",
                  await promptRequest("export", {
                    keys: selected.map((asset) => asset.key),
                    versions: Object.fromEntries(
                      selected.map((asset) => [asset.key, asset.latestVersion]),
                    ),
                  }),
                );
              } catch (cause) {
                setError(String(cause));
              } finally {
                setWorking(false);
              }
            }}
          >
            Export selected versions
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              !library.permissions.edit ||
              selected.some(
                (asset) => asset.assignments.length || asset.archived,
              )
            }
            onSelect={() => begin("archive")}
          >
            Archive selected prompts…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              !library.permissions.edit ||
              selected.some((asset) => !asset.archived)
            }
            onSelect={() => begin("restore")}
          >
            Restore selected prompts…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="ghost" disabled={working} onClick={onClear}>
        Clear selection
      </Button>
      {error && !action && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <PromptActionSurface
        modal={action !== "group"}
        confirmation={action === "archive" || action === "restore"}
        busy={working}
        open={Boolean(action)}
        onClose={() => {
          if (!working) setAction(null);
        }}
        title={
          action === "move"
            ? "Move selected prompts"
            : action === "group"
              ? "Add versions to test group"
              : action === "restore"
                ? "Restore selected prompts?"
                : "Archive selected prompts?"
        }
        description={`${selected.length} selected prompts. Their versions and historical evidence are preserved.`}
        actions={
          <Button
            size="sm"
            variant={action === "archive" ? "destructive" : "default"}
            disabled={
              working ||
              (action === "group" &&
                ((!groupId && !name.trim()) ||
                  (Boolean(conflicts) && !replace)))
            }
            onClick={() => void apply()}
          >
            {working
              ? "Saving…"
              : action === "move"
                ? "Move prompts"
                : action === "group"
                  ? "Add versions"
                  : action === "restore"
                    ? "Restore prompts"
                    : "Archive prompts"}
          </Button>
        }
        closeLabel="Close bulk prompt action"
      >
        <div className="space-y-5 p-5">
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <ul className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3 text-xs">
            {selected.map((asset) => (
              <li key={asset.id} className="flex min-w-0 justify-between gap-2">
                <span className="truncate" title={asset.key}>
                  {asset.name}
                </span>
                <span className="shrink-0 font-mono">
                  v{asset.latestVersion}
                </span>
              </li>
            ))}
          </ul>
          {action === "move" ? (
            <EvalDropdown
              label="Destination category"
              className="w-full"
              value={destination}
              options={[
                { value: "root", label: "Root" },
                ...library.categories.map((category) => ({
                  value: category.id,
                  label: categoryPath(library.categories, category.id),
                })),
              ]}
              onChange={setDestination}
            />
          ) : action === "group" ? (
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
                  setName("");
                  setReplace(false);
                }}
              />
              <Input
                aria-label="New group name"
                placeholder="Or name a new group"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setGroupId("");
                }}
              />
              <p className="text-xs text-muted-foreground">
                These exact versions are selected for testing. Choose a suite
                when launching the group.
              </p>
              {conflicts && (
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(event) => setReplace(event.target.checked)}
                  />
                  Replace the group’s existing selection for these prompts
                </label>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {action === "restore"
                ? "These prompts will return to the active library. No versions will be assigned to an environment."
                : "These prompts will leave the active library and can be restored later."}
            </p>
          )}
        </div>
      </PromptActionSurface>
    </>
  );
}
