"use client";
import {
  type PromptDetail,
  PromptDetailSchema,
  type PromptLibrary,
} from "@kortyx/telemetry-contracts";
import { MoreHorizontal } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
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
import { promptRequest } from "../api/client";
import { promptCode } from "../lib/code-helper";
import { categoryPath, downloadJson } from "../lib/presentation";
import { PromptActionSurface } from "./prompt-action-surface";
import { PromptPolicyDialog } from "./prompt-policy-dialog";

type Asset = PromptLibrary["assets"][number];
export const assetActions = [
  "rename",
  "move",
  "code",
  "archive",
  "restore",
  "policy",
] as const;
export type AssetAction = (typeof assetActions)[number];
export function PromptAssetMenu({
  asset,
  permissions,
  onAction,
  leadingActions,
  label = "Prompt actions",
}: {
  asset: Asset;
  permissions: PromptLibrary["permissions"];
  onAction: (action: AssetAction) => void;
  leadingActions?: ReactNode;
  label?: string;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={label}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="data-[state=closed]:animate-none!"
      >
        {leadingActions}
        <DropdownMenuItem onSelect={() => onAction("code")}>
          Code helper
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!permissions.edit}
          onSelect={() => onAction("rename")}
        >
          Rename prompt
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!permissions.edit}
          onSelect={() => onAction("move")}
        >
          Move to category
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!permissions.settings}
          onSelect={() => onAction("policy")}
        >
          Promotion policy
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={
            !permissions.edit ||
            (!asset.archived && asset.assignments.length > 0)
          }
          onSelect={() => onAction(asset.archived ? "restore" : "archive")}
        >
          {asset.archived ? "Restore prompt" : "Archive prompt"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PromptAssetActionDialog(props: PromptAssetActionDialogProps) {
  if (props.action === "policy") return <PromptPolicyDialog {...props} />;
  return <PromptAssetActionContent {...props} />;
}

type PromptAssetActionDialogProps = {
  action: AssetAction;
  asset: Asset;
  library: PromptLibrary;
  version?: PromptDetail["versions"][number];
  onClose: () => void;
  onDone: () => Promise<unknown>;
};

function PromptAssetActionContent({
  action,
  asset,
  library,
  version,
  onClose,
  onDone,
}: PromptAssetActionDialogProps) {
  const [name, setName] = useState(asset.name),
    [destination, setDestination] = useState(asset.categoryId ?? "root"),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [loadedVersion, setLoadedVersion] = useState(version),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (action !== "code" || version) return;
    const controller = new AbortController();
    void promptRequest(`assets/${asset.id}`, undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted)
          setLoadedVersion(PromptDetailSchema.parse(value).versions[0]);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(String(cause));
      });
    return () => controller.abort();
  }, [action, asset.id, version]);
  const confirmation = action === "archive" || action === "restore";
  const title =
    action === "code"
      ? "Use this prompt"
      : `${action[0]!.toUpperCase()}${action.slice(1)} prompt${confirmation ? "?" : ""}`;
  const code = loadedVersion ? promptCode(asset.key, loadedVersion) : "";
  const apply = async () => {
    setWorking(true);
    setError("");
    try {
      await promptRequest("actions", {
        action: "update",
        id: asset.id,
        expectedRevision: asset.revision,
        ...(action === "rename"
          ? { name: name.trim() }
          : action === "move"
            ? { categoryId: destination === "root" ? null : destination }
            : { archived: action === "archive" }),
      });
      await onDone();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Prompt action failed.",
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <PromptActionSurface
      modal
      wide={action === "code"}
      confirmation={confirmation}
      busy={working}
      open
      onClose={onClose}
      title={title}
      description={`${asset.name} · ${asset.key}`}
      closeLabel="Close prompt action"
      actions={
        action !== "code" && (
          <Button
            size="sm"
            variant={action === "archive" ? "destructive" : "default"}
            disabled={
              working ||
              !library.permissions.edit ||
              (action === "rename" && !name.trim()) ||
              (action === "archive" && asset.assignments.length > 0)
            }
            onClick={() => void apply()}
          >
            {working
              ? "Saving…"
              : `${action[0]!.toUpperCase()}${action.slice(1)} prompt`}
          </Button>
        )
      }
    >
      <div className="space-y-4 p-5">
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {action === "rename" ? (
          <div className="space-y-2">
            <label htmlFor="prompt-action-name" className="text-xs font-medium">
              Prompt name
            </label>
            <Input
              id="prompt-action-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The key used by your application stays the same.
            </p>
          </div>
        ) : action === "move" ? (
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
        ) : action === "code" ? (
          <>
            <p className="text-xs text-muted-foreground">
              Register this reference with createPrompts. Messages and
              configuration come from Studio.
            </p>
            {code ? (
              <pre className="overflow-auto rounded-md border bg-muted/30 p-4 text-[11px] leading-6">
                {code}
              </pre>
            ) : (
              !error && (
                <output className="text-xs text-muted-foreground">
                  Loading code helper…
                </output>
              )
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!code}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                } catch {
                  setError("Could not copy. Select and copy the code above.");
                }
              }}
            >
              {copied ? "Copied" : "Copy code"}
            </Button>
            <Button
              className="ml-2"
              size="sm"
              variant="ghost"
              disabled={!loadedVersion}
              onClick={async () => {
                try {
                  downloadJson(
                    `${asset.key.replaceAll("/", "-")}-v${loadedVersion!.version}.json`,
                    await promptRequest("export", {
                      keys: [asset.key],
                      versions: { [asset.key]: loadedVersion!.version },
                    }),
                  );
                } catch (cause) {
                  setError(String(cause));
                }
              }}
            >
              Export version
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {action === "archive"
              ? "This prompt will leave the active library. Its versions, runs and evaluations are preserved, and you can restore it later."
              : "This prompt will return to the active library. Its versions are preserved. Restoring does not make a version live or assign tags."}
          </p>
        )}
      </div>
    </PromptActionSurface>
  );
}
