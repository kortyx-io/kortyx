"use client";
import type { EvaluatorLibrary } from "@kortyx/telemetry-contracts";
import { Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { TablePageHeader } from "@/components/data-table/table-page-header";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import { studioHelp } from "@/lib/studio-help";
export function EvaluatorLibraryView({
  library,
}: {
  library: EvaluatorLibrary;
}) {
  type Row = EvaluatorLibrary["evaluators"][number];
  const columns: DataTableColumn<Row>[] = [
    {
      filter: false,
      defaultWidth: 220,
      key: "name",
      label: "Evaluator",
      help: studioHelp.evaluators,
      render: (r) => (
        <Link
          className="font-medium hover:underline"
          href={`/evaluators/${r.id}`}
        >
          {r.draft.name}
        </Link>
      ),
    },
    {
      key: "model",
      filter: false,
      defaultWidth: 220,
      label: "Model",
      render: (r) => r.draft.model,
    },
    {
      filter: false,
      defaultWidth: 220,
      key: "group",
      label: "Score group",
      help: studioHelp.scoreGroups,
      render: (r) =>
        library.scoreGroups.find(
          (g) =>
            g.id === r.draft.scoreGroup.id &&
            g.version === r.draft.scoreGroup.version,
        )?.name ?? "Unavailable",
    },
    {
      filter: false,
      defaultWidth: 220,
      key: "state",
      label: "Published",
      render: (r) =>
        r.archived
          ? "Archived"
          : r.publishedVersion
            ? `Version ${r.publishedVersion}`
            : "Draft",
    },
    {
      filter: false,
      defaultWidth: 220,
      key: "updated",
      label: "Updated",
      render: (r) => new Date(r.updatedAt).toLocaleDateString(),
    },
  ];
  return (
    <DataTable
      tableId="evaluators"
      columns={columns}
      data={library.evaluators}
      getRowKey={(r) => r.id}
      search={{ placeholder: "Search evaluators…" }}
      header={
        <TablePageHeader
          title="Evaluators"
          description="Reusable judges for experiments and recorded application runs"
          help={studioHelp.evaluators}
          actions={
            library.canEdit ? (
              <Button size="sm" asChild>
                <Link href="/evaluators/new">
                  <Plus />
                  New evaluator
                </Link>
              </Button>
            ) : undefined
          }
        />
      }
      emptyState={
        <div className="flex flex-col items-center gap-3 p-8">
          <h2 className="font-medium">Create your first evaluator</h2>
          <p className="max-w-lg text-center text-sm text-muted-foreground">
            Choose a prompt, model and score group, then preview the judge
            against recorded evidence before publishing.
          </p>
          {library.canEdit && (
            <Button asChild>
              <Link href="/evaluators/new">New evaluator</Link>
            </Button>
          )}
        </div>
      }
    />
  );
}
