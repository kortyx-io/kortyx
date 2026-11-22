"use client";
import type {
  ScoreGroupAsset,
  ScoreGroupLibrary,
  ScoreGroupVersion,
} from "@kortyx/telemetry-contracts";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { DetailLink } from "@/components/detail/detail-link";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { useSearchParams } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { ScoreGroupRowActions } from "./score-group-row-actions";

export function JudgeScoreGroups({
  library,
  versions,
  selected,
  judgePath,
  editing,
  canSelect,
  disabled,
  onSelect,
  onSaved,
}: {
  library: ScoreGroupLibrary;
  versions: ScoreGroupVersion[];
  selected?: { id: string; version: number };
  judgePath: string;
  editing: boolean;
  canSelect: boolean;
  disabled: boolean;
  onSelect: (version: ScoreGroupVersion) => void;
  onSaved: (asset: ScoreGroupAsset) => void;
}) {
  const params = useSearchParams();
  const [error, setError] = useState("");
  const definitionFor = (group: ScoreGroupAsset) =>
    (selected?.id === group.id
      ? versions.find(
          (version) =>
            version.groupId === group.id &&
            version.version === selected.version,
        )?.definition
      : undefined) ??
    group.latest?.definition ??
    group.draft;
  const href = (id: string) => {
    const version =
      selected?.id === id
        ? selected.version
        : library.groups.find((group) => group.id === id)?.latest?.version;
    return `/evaluators/score-groups/${id}?judge=${encodeURIComponent(judgePath)}&tab=score-group${editing ? "&edit=true" : params.get("v") ? `&v=${params.get("v")}` : ""}${version ? `&groupV=${version}` : ""}`;
  };
  const columns: DataTableColumn<ScoreGroupAsset>[] = [
    {
      key: "use",
      label: "Active",
      filter: false,
      sortable: false,
      help: {
        ...studioHelp.scoreGroups,
        label: "Active score group",
        description:
          "The check identifies the group used by this judge version or draft. Choose Score with this group in a row’s actions menu to change it; save the judge version to keep that choice.",
      },
      defaultWidth: 64,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (group) =>
        selected?.id === group.id ? (
          <span
            role="img"
            className="flex justify-center"
            aria-label={`Active score group: ${group.draft.name}`}
          >
            <Check className="size-4" aria-hidden="true" />
          </span>
        ) : null,
    },
    {
      key: "name",
      label: "Score group",
      filter: false,
      defaultWidth: 220,
      help: studioHelp.scoreGroups,
      render: (group) => (
        <div className="flex min-w-0 flex-col gap-1">
          <DetailLink
            href={href(group.id)}
            className="font-medium hover:underline"
          >
            {group.draft.name}
          </DetailLink>
          <span className="text-[11px] text-muted-foreground">
            {group.builtin
              ? "Built-in · always available"
              : group.archived
                ? "Archived"
                : group.draft.description}
          </span>
        </div>
      ),
    },
    {
      key: "fields",
      label: "Fields",
      filter: false,
      defaultWidth: 220,
      render: (group) =>
        definitionFor(group)
          .fields.map((field) => field.label)
          .join(", "),
    },
    {
      key: "version",
      label: "Version",
      filter: false,
      defaultWidth: 110,
      render: (group) =>
        selected?.id === group.id ? (
          <div className="flex flex-col gap-1">
            <span>v{selected.version} · Selected</span>
            {group.latest && group.latest.version > selected.version && (
              <span className="text-[11px] text-muted-foreground">
                Latest: v{group.latest.version}
              </span>
            )}
          </div>
        ) : group.latest ? (
          `v${group.latest.version}`
        ) : (
          <span className="text-muted-foreground">
            Draft · Save a version to use
          </span>
        ),
    },
    {
      key: "updated",
      label: "Updated",
      filter: false,
      defaultWidth: 190,
      render: (group) =>
        group.builtin ? "System" : formatDateTime(group.updatedAt),
    },
    {
      key: "actions",
      label: "Actions",
      filter: false,
      sortable: false,
      defaultWidth: 80,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (group) => (
        <ScoreGroupRowActions
          group={group}
          definition={definitionFor(group)}
          canSelect={canSelect}
          canEdit={library.canEdit}
          disabled={disabled}
          href={href}
          onSelect={(version) => {
            setError("");
            onSelect(version);
          }}
          onSaved={onSaved}
          onError={(cause) =>
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not update score group.",
            )
          }
        />
      ),
    },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      {error && (
        <p role="alert" className="border-b px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <DataTable
        variant="inline"
        tableId="judge-score-groups"
        columns={columns}
        data={library.groups.filter(
          (group) => !group.archived || selected?.id === group.id,
        )}
        getRowKey={(group) => group.id}
        search={{ placeholder: "Search score groups…" }}
        toolbarStart={
          library.canEdit ? (
            <Button size="sm" disabled={disabled} asChild>
              <DetailLink href={href("new")}>
                <Plus />
                New score group
              </DetailLink>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
