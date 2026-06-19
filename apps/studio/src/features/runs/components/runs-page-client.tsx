"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, DataTableProvider } from "@/components/data-table";
import { createRunColumns } from "@/features/runs/components/run-table-columns";
import { RunsEmptyState } from "@/features/runs/components/runs-empty-state";
import { RunsToolbar } from "@/features/runs/components/runs-toolbar";
import { useRunsQuery } from "@/features/runs/hooks/use-runs-query";
import {
  COLUMN_LAYOUT_STORAGE_KEY,
  PAGE_SIZE,
  PAGE_SIZES,
} from "@/features/runs/lib/constants";
import type { Run } from "@/features/runs/types";

export default function RunsPageClient({ runs: initialRuns }: { runs: Run[] }) {
  const router = useRouter();
  const runsQuery = useRunsQuery(initialRuns);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);
  const { live } = runsQuery;

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => undefined);
  }

  function openRun(run: Run, event: React.MouseEvent<HTMLTableRowElement>) {
    const href = `/runs/${run.id}`;
    if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
    else router.push(href);
  }

  const columns = createRunColumns({
    liveSeconds: now,
    onToggleStatus: runsQuery.toggleStatus,
    onCopy: copy,
  });

  return (
    <DataTableProvider columns={columns} persistKey={COLUMN_LAYOUT_STORAGE_KEY}>
      <DataTable
        data={runsQuery.filteredRuns}
        getRowKey={(run) => run.id}
        onRowClick={openRun}
        rowClassName={(run) =>
          run.status === "failed" ? "bg-red-500/[0.025]" : undefined
        }
        sort={runsQuery.sort}
        direction={runsQuery.direction}
        onSort={runsQuery.handleSort}
        onSetSortDirection={runsQuery.setSortDirection}
        onClearSort={runsQuery.clearSort}
        header={
          <RunsToolbar
            query={runsQuery}
            live={live}
            refreshing={refreshing}
            onToggleLive={() => runsQuery.setLive(!live)}
            onRefresh={() => {
              setRefreshing(true);
              window.setTimeout(() => setRefreshing(false), 650);
            }}
          />
        }
        emptyState={<RunsEmptyState onClear={runsQuery.clearFilters} />}
        scrollRestoreKey="runs-table-scroll-position"
        pagination={{
          cursor: runsQuery.cursor,
          pageSize: runsQuery.pageSize,
          pageSizes: PAGE_SIZES,
          totalCount: runsQuery.filteredRuns.length,
          onCursorChange: (next) =>
            runsQuery.setParams({ cursor: next === 0 ? null : next }),
          onPageSizeChange: (next) =>
            runsQuery.setParams({
              cursor: null,
              pageSize: next === PAGE_SIZE ? null : next,
            }),
        }}
      />
    </DataTableProvider>
  );
}
