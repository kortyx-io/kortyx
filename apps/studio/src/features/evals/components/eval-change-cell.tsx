"use client";
import { GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import {
  type ConversationChange,
  changeKinds,
  type EvaluationChanges,
} from "../lib/evaluation-changes";

function OpenComparisonButton({
  label,
  onOpen,
  disabled = false,
}: {
  label: string;
  onOpen: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <GitCompareArrows />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Open comparison</TooltipContent>
    </Tooltip>
  );
}

export function EvalChangeCell({
  change,
  onInspect,
}: {
  change?: ConversationChange;
  onInspect: () => void;
}) {
  return change ? (
    <div className="flex min-h-11 min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Button
          variant="link"
          size="inline"
          className="justify-start"
          onClick={(event) => {
            event.stopPropagation();
            onInspect();
          }}
        >
          {change.label}
        </Button>
        <span className="truncate text-xs text-muted-foreground">
          {change.earlier.total
            ? `Previously ${change.earlier.passed}/${change.earlier.total} passed`
            : "No matching earlier result"}
        </span>
      </div>
      <OpenComparisonButton
        label={`Open comparison for ${change.name}`}
        onOpen={onInspect}
      />
    </div>
  ) : (
    <span className="text-xs text-muted-foreground">No earlier result</span>
  );
}

export function EvaluationChangeCell({
  comparison,
  onInspect,
}: {
  comparison?: EvaluationChanges;
  onInspect: (rows: ConversationChange[]) => void;
}) {
  if (!comparison)
    return (
      <span className="text-xs text-muted-foreground">Changes unavailable</span>
    );
  if (comparison.state !== "ready")
    return (
      <span className="block truncate text-xs text-muted-foreground">
        {comparison.state === "active"
          ? "Still running"
          : comparison.state === "error"
            ? "Changes unavailable · refresh to retry"
            : "No earlier completed run"}
      </span>
    );
  const groups = changeKinds
    .map(({ kind, label }) => ({
      kind,
      label,
      rows: comparison.rows.filter((row) => row.kind === kind),
    }))
    .filter((group) => group.rows.length);
  const shortLabel = (kind: string) =>
    kind === "regressed"
      ? "regressed"
      : kind === "improved"
        ? "improved"
        : kind === "review"
          ? "need review"
          : kind === "still-failing"
            ? "still failing"
            : "unchanged";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-4 min-w-0 items-center gap-3 overflow-hidden">
          {groups.slice(0, 2).map((group) => (
            <Button
              key={group.kind}
              variant="link"
              size="inline"
              className="min-w-0 truncate"
              onClick={(event) => {
                event.stopPropagation();
                onInspect(group.rows);
              }}
            >
              {group.rows.length} {shortLabel(group.kind)}
            </Button>
          ))}
          {groups.length > 2 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="link"
                  size="inline"
                  aria-label="More change groups"
                >
                  +{groups.length - 2}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  {groups.slice(2).map((group) => (
                    <DropdownMenuItem
                      key={group.kind}
                      onSelect={() => onInspect(group.rows)}
                    >
                      {group.rows.length} {group.label.toLowerCase()}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {!groups.length ? (
            <span className="truncate text-xs text-muted-foreground">
              No recorded conversations
            </span>
          ) : null}
        </div>
        {comparison.earlier ? (
          <InfoTooltip
            label="Compared with"
            trigger={
              <Button
                variant="link"
                size="inline"
                className="h-4 max-w-full min-w-0 justify-start"
              >
                <span className="truncate text-[11px] font-normal text-muted-foreground">
                  vs {comparison.earlier.name}
                </span>
              </Button>
            }
          >
            <p>{comparison.earlier.name}</p>
            <p>{formatDateTime(comparison.earlier.createdAt)}</p>
            <p>
              The latest earlier completed run of this application and
              environment in the recent history. Open the run to choose a
              different reference.
            </p>
          </InfoTooltip>
        ) : null}
      </div>
      <OpenComparisonButton
        label={`Inspect changes for ${comparison.candidate.name}`}
        disabled={!groups.length}
        onOpen={() => onInspect(groups.flatMap((group) => group.rows))}
      />
    </div>
  );
}
