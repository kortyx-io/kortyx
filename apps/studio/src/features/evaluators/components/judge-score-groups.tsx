"use client";
import type {
  ScoreGroupAsset,
  ScoreGroupLibrary,
  ScoreGroupVersion,
} from "@kortyx/telemetry-contracts";
import { Pencil, Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { DetailLink } from "@/components/detail/detail-link";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { useSearchParams } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";

export function JudgeScoreGroups({
  library,
  versions,
  selected,
  judgePath,
  editing,
  disabled,
  onSelect,
}: {
  library: ScoreGroupLibrary;
  versions: ScoreGroupVersion[];
  selected?: { id: string; version: number };
  judgePath: string;
  editing: boolean;
  disabled: boolean;
  onSelect: (version: ScoreGroupVersion) => void;
}) {
  const params = useSearchParams();
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
      label: "Use",
      filter: false,
      defaultWidth: 64,
      render: (group) => (
        <input
          type="radio"
          name="judge-score-group"
          aria-label={`Use ${group.draft.name}`}
          checked={selected?.id === group.id}
          disabled={!editing || disabled || group.archived || !group.latest}
          onChange={() => {
            if (group.latest) onSelect(group.latest);
          }}
          className="size-3.5 cursor-pointer accent-foreground disabled:cursor-default"
        />
      ),
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
        (selected?.id === group.id
          ? (versions.find(
              (version) =>
                version.groupId === group.id &&
                version.version === selected.version,
            )?.definition ??
            group.latest?.definition ??
            group.draft)
          : (group.latest?.definition ?? group.draft)
        ).fields
          .map((field) => field.label)
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
          "Draft"
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
      cellClassName: "text-center",
      render: (group) =>
        library.canEdit && !group.builtin && !group.archived ? (
          <Button size="icon-xs" variant="ghost" disabled={disabled} asChild>
            <DetailLink
              href={`${href(group.id)}&groupEdit=true&groupTab=fields`}
              aria-label={`Edit ${group.draft.name}`}
            >
              <Pencil />
            </DetailLink>
          </Button>
        ) : null,
    },
  ];
  return (
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
  );
}
