"use client";

import type { EvaluatorDetail } from "@kortyx/telemetry-contracts";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

export type JudgeHistoryProps = {
  versions: EvaluatorDetail["versions"];
  selectedVersion?: number;
  editing: boolean;
  hasDraft: boolean;
  dirty: boolean;
  disabled: boolean;
  onSelect: (version: number | null) => void;
};

export function JudgeVersionHistory({
  expanded,
  onExpandedChange,
  versions,
  selectedVersion,
  editing,
  hasDraft,
  dirty,
  disabled,
  onSelect,
}: JudgeHistoryProps & {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  return (
    <aside
      aria-label="Judge version history"
      data-judge-version-history
      className={`${expanded ? "w-56" : "w-12"} hidden min-h-0 shrink-0 flex-col border-r @2xl/judge-detail:flex`}
    >
      <Button
        size="sm"
        variant="ghost"
        className="m-2 max-w-full self-start"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
      >
        <ChevronDown
          className={`transition-transform ${expanded ? "" : "-rotate-90"}`}
        />
        <span className={expanded ? "" : "sr-only"}>Version history</span>
      </Button>
      {expanded && (
        <ScrollArea
          type="auto"
          className="min-h-0 flex-1"
          viewportClassName="overscroll-contain"
        >
          <div className="flex flex-col gap-1 px-2 pb-2">
            {hasDraft && (
              <button
                type="button"
                disabled={disabled}
                aria-label="Open draft in history"
                aria-pressed={editing || !versions.length}
                onClick={() => onSelect(null)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-3 text-left text-xs hover:bg-muted/50 aria-pressed:bg-muted"
              >
                <span className="text-muted-foreground">
                  {dirty ? "Unsaved changes" : "Saved instructions"}
                </span>
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                  Draft
                </span>
              </button>
            )}
            {versions.map((version) => (
              <button
                type="button"
                key={version.version}
                disabled={disabled}
                aria-label={`Open judge version ${version.version}`}
                aria-pressed={!editing && selectedVersion === version.version}
                onClick={() => onSelect(version.version)}
                className="flex w-full min-w-0 flex-col gap-1 rounded-md px-2 py-3 text-left hover:bg-muted/50 aria-pressed:bg-muted"
              >
                <span className="text-xs font-medium">v{version.version}</span>
                <span className="block max-w-full truncate text-[11px] text-muted-foreground">
                  {version.definition.model}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(version.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}

export function JudgeVersionPicker({
  versions,
  selectedVersion,
  editing,
  hasDraft,
  disabled,
  onSelect,
}: JudgeHistoryProps) {
  return (
    <div
      data-judge-version-picker
      className="shrink-0 @2xl/judge-detail:hidden"
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="max-w-full"
            aria-label={`Version history · ${editing || selectedVersion === undefined ? "Draft" : `v${selectedVersion}`}`}
          >
            <span className="hidden @xl/judge-detail:inline">
              Version history ·
            </span>
            <span>
              {editing || selectedVersion === undefined
                ? "Draft"
                : `v${selectedVersion}`}
            </span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-80 max-w-[calc(100vw-2rem)] data-[state=closed]:animate-none!"
        >
          <DropdownMenuLabel>Version history</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={
              editing || selectedVersion === undefined
                ? "draft"
                : String(selectedVersion)
            }
            onValueChange={(value) =>
              onSelect(value === "draft" ? null : Number(value))
            }
          >
            {hasDraft && (
              <DropdownMenuRadioItem
                value="draft"
                disabled={disabled}
                className="py-2"
              >
                Draft
              </DropdownMenuRadioItem>
            )}
            {versions.map((version) => (
              <DropdownMenuRadioItem
                key={version.version}
                value={String(version.version)}
                disabled={disabled}
                className="items-start py-2"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-medium">
                    v{version.version}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {version.definition.model}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(version.createdAt).toLocaleDateString()}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
