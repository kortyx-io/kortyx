"use client";
import type { EvaluatorLibrary } from "@kortyx/telemetry-contracts";
import { Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { TablePageHeader } from "@/components/data-table/table-page-header";
import { DetailLink } from "@/components/detail/detail-link";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
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
      label: "Judge",
      help: studioHelp.evaluators,
      render: (r) => (
        <DetailLink
          className="font-medium hover:underline"
          href={`/evaluators/${r.id}`}
        >
          {r.draft.name}
        </DetailLink>
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
      key: "state",
      label: "Version",
      render: (r) =>
        r.archived
          ? "Archived"
          : r.publishedVersion
            ? `v${r.publishedVersion}`
            : "Draft",
    },
    {
      filter: false,
      defaultWidth: 220,
      key: "updated",
      label: "Updated",
      render: (r) => formatDateTime(r.updatedAt),
    },
  ];
  return (
    <DataTable
      tableId="evaluators"
      columns={columns}
      data={library.evaluators}
      getRowKey={(r) => r.id}
      search={{ placeholder: "Search judges…" }}
      header={
        <TablePageHeader
          title="Evaluators"
          description="Versioned judge instructions with Kortyx-aware context"
          help={studioHelp.evaluators}
          actions={
            library.canEdit ? (
              <Button size="sm" asChild>
                <Link href="/evaluators/new">
                  <Plus />
                  New judge
                </Link>
              </Button>
            ) : undefined
          }
        />
      }
      emptyState={
        <div className="flex flex-col items-center gap-3 p-8">
          <h2 className="font-medium">Create your first judge</h2>
          <p className="max-w-lg text-center text-sm text-muted-foreground">
            Write judge instructions, inspect the available variables, and
            preview a recorded case before saving a version.
          </p>
          {library.canEdit && (
            <Button asChild>
              <Link href="/evaluators/new">New judge</Link>
            </Button>
          )}
        </div>
      }
    />
  );
}
