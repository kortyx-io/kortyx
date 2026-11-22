"use client";

import {
  type ScoreGroupAsset,
  type ScoreGroupDefinition,
  ScoreGroupDetailSchema,
  type ScoreGroupVersion,
} from "@kortyx/telemetry-contracts";
import {
  Archive,
  Check,
  Copy,
  MoreHorizontal,
  Pencil,
  SquarePen,
} from "lucide-react";
import { useRef, useState } from "react";
import { DetailLink } from "@/components/detail/detail-link";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/lib/scoped-navigation";
import { evaluatorRequest } from "../api/client";
import { AssetDetailsDialog } from "./asset-details-dialog";

export function ScoreGroupRowActions({
  group,
  definition,
  canSelect,
  canEdit,
  disabled,
  href,
  onSelect,
  onSaved,
  onError,
}: {
  group: ScoreGroupAsset;
  definition: ScoreGroupDefinition;
  canSelect: boolean;
  canEdit: boolean;
  disabled: boolean;
  href: (id: string) => string;
  onSelect: (version: ScoreGroupVersion) => void;
  onSaved: (asset: ScoreGroupAsset) => void;
  onError: (error: unknown) => void;
}) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [action, setAction] = useState<"rename" | "archive" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writable = canEdit && !group.builtin && !group.archived;
  const duplicate = async () => {
    setBusy(true);
    try {
      const result = ScoreGroupDetailSchema.parse(
        await evaluatorRequest("score-groups", {
          ...structuredClone(definition),
          name: `${group.draft.name} copy`.slice(0, 200),
          description: group.draft.description,
        }),
      );
      onSaved(result.group);
      router.push(`${href(result.group.id)}&groupEdit=true&groupTab=fields`);
    } catch (cause) {
      onError(cause);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            size="icon-xs"
            variant="ghost"
            aria-label={`Actions for ${group.draft.name}`}
            disabled={disabled || busy}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="data-[state=closed]:animate-none!"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={!canSelect || group.archived || !group.latest}
              onSelect={() => {
                if (group.latest) onSelect(group.latest);
              }}
            >
              <Check />
              Score with this group
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!writable} asChild>
              <DetailLink
                href={`${href(group.id)}&groupEdit=true&groupTab=fields`}
              >
                <SquarePen />
                Edit
              </DetailLink>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!writable}
              onSelect={() => setAction("rename")}
            >
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canEdit || group.archived}
              onSelect={() => void duplicate()}
            >
              <Copy />
              Duplicate
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              disabled={!writable}
              onSelect={() => {
                setError("");
                setAction("archive");
              }}
            >
              <Archive />
              Archive
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AssetDetailsDialog
        entity="scoreGroup"
        open={action === "rename"}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        existing
        name={group.draft.name}
        description={group.draft.description}
        onRestoreFocus={() => trigger.current?.focus()}
        onSave={async (metadata) => {
          const result = ScoreGroupDetailSchema.parse(
            await evaluatorRequest(`score-groups/${group.id}/metadata`, {
              ...metadata,
              revision: group.revision,
            }),
          );
          onSaved(result.group);
        }}
      />
      <Dialog
        open={action === "archive"}
        onOpenChange={(open) => {
          if (!busy && !open) setAction(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogTitle>Archive score group?</DialogTitle>
          <DialogDescription>
            {group.draft.name} will no longer be available for new judge
            selections. Saved judge versions and previous results keep their
            recorded definitions.
          </DialogDescription>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = ScoreGroupDetailSchema.parse(
                    await evaluatorRequest(`score-groups/${group.id}/archive`, {
                      revision: group.revision,
                    }),
                  );
                  onSaved(result.group);
                  setAction(null);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not archive score group.",
                  );
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
    </>
  );
}
