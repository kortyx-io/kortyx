"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, DataTableProvider } from "@/components/data-table";
import { createRunColumns } from "@/features/runs/components/run-table-columns";
import { RunsEmptyState } from "@/features/runs/components/runs-empty-state";
import { RunsFilterPanel } from "@/features/runs/components/runs-filter-panel";
import { RunsToolbar } from "@/features/runs/components/runs-toolbar";
import { useRunsQuery } from "@/features/runs/hooks/use-runs-query";
import { useRunsTablePreferences } from "@/features/runs/hooks/use-runs-table-preferences";
import { PAGE_SIZES } from "@/features/runs/lib/constants";
import {
  RUNS_TABLE_PREFERENCES_COOKIE,
  type RunsTablePreferences,
} from "@/features/runs/lib/table-preferences";
import type { Run } from "@/features/runs/types";
import { cn } from "@/lib/utils";

type RunsPageClientProps = {
  runs: Run[];
  /** DB/server-provided table preferences for the current user. */
  preferences?: Partial<RunsTablePreferences>;
};

export default function RunsPageClient({
  runs: initialRuns,
  preferences,
}: RunsPageClientProps) {
  const router = useRouter();

  // Single owner of all persistable table state (layout + sort + dir +
  // pageSize). Written to a cookie so the server renders the right layout on
  // refresh (no flash); wire `onPersist` to a server action to also write the
  // user's profile in the DB.
  const prefs = useRunsTablePreferences({
    cookieName: RUNS_TABLE_PREFERENCES_COOKIE,
    initial: preferences,
    // onPersist: saveRunsTablePreferences,
  });

  const runsQuery = useRunsQuery(initialRuns, {
    sort: prefs.value.sort,
    dir: prefs.value.dir,
    pageSize: prefs.value.pageSize,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [now, setNow] = useState(0);
  const { live } = runsQuery;

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  // Persist sort/dir/pageSize alongside the column layout. No-ops on mount
  // since the values equal the hydrated preferences.
  useEffect(() => {
    prefs.save({
      sort: runsQuery.sort,
      dir: runsQuery.direction,
      pageSize: runsQuery.pageSize,
    });
  }, [runsQuery.sort, runsQuery.direction, runsQuery.pageSize, prefs.save]);

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
    <DataTableProvider
      columns={columns}
      initialLayout={prefs.value.layout}
      onLayoutChange={(layout) => prefs.save({ layout })}
    >
      <div className="flex h-full min-h-0 gap-2">
        <DataTable
          className="min-w-0 flex-1"
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
              filtersOpen={filtersOpen}
              onToggleLive={() => runsQuery.setLive(!live)}
              onToggleFilters={() => setFiltersOpen((open) => !open)}
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
            onCursorChange: (next) => runsQuery.setParams({ cursor: next }),
            onPageSizeChange: (next) =>
              runsQuery.setParams({ cursor: null, pageSize: next }),
          }}
        />
        <div
          className={cn(
            "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            filtersOpen ? "w-72" : "w-0",
          )}
        >
          <RunsFilterPanel
            query={runsQuery}
            open={filtersOpen}
            onClose={() => setFiltersOpen(false)}
          />
        </div>
      </div>
    </DataTableProvider>
  );
}
