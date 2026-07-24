"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
import type { Run } from "@/features/runs/schema";
import { detailNavigationHref } from "@/lib/nuqs";
import { cn } from "@/lib/utils";

type RunsPageClientProps = {
  runs: Run[];
  totalCount: number;
  /** DB/server-provided table preferences for the current user. */
  preferences?: Partial<RunsTablePreferences>;
};

export default function RunsPageClient({
  runs: initialRuns,
  totalCount,
  preferences,
}: RunsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Single owner of all persistable table state (layout + sort + dir +
  // pageSize + saved views). Written to a cookie so the server renders the
  // right preferences on refresh; wire `onPersist` to a server action to also
  // write the user's profile in the DB.
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
  const [refreshing, startRefreshTransition] = useTransition();
  const [now, setNow] = useState(0);
  const { live } = runsQuery;
  const hasActiveRuns = runsQuery.filteredRuns.some(
    (run) => run.status === "running" || run.status === "interrupted",
  );

  useEffect(() => {
    if (!live && !hasActiveRuns) return;
    const timer = window.setInterval(() => setNow((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [live, hasActiveRuns]);

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
    const href = detailNavigationHref(`/runs/${run.id}`, searchParams);
    if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
    else if (runsQuery.filtersOpen) {
      void runsQuery.setFiltersOpen(false).then(() => router.push(href));
    } else {
      router.push(href);
    }
  }

  const columns = createRunColumns({
    liveSeconds: now,
    onToggleStatus: runsQuery.toggleStatus,
    onCopy: copy,
    workflowFilter: runsQuery.workflow,
    versionFilter: runsQuery.version,
  });

  return (
    <DataTableProvider
      columns={columns}
      initialLayout={prefs.value.layout}
      onLayoutChange={(layout) => prefs.save({ layout })}
    >
      <div className="flex h-full min-h-0">
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
              filtersOpen={runsQuery.filtersOpen}
              views={prefs.value.views}
              onToggleLive={() => runsQuery.setLive(!live)}
              onToggleFilters={runsQuery.toggleFiltersOpen}
              onRefresh={() =>
                startRefreshTransition(() => {
                  router.refresh();
                })
              }
              onViewsChange={(views) => prefs.save({ views })}
            />
          }
          emptyState={<RunsEmptyState onClear={runsQuery.clearFilters} />}
          scrollRestoreKey="runs-table-scroll-position"
          pagination={{
            cursor: runsQuery.cursor,
            pageSize: runsQuery.pageSize,
            pageSizes: PAGE_SIZES,
            totalCount,
            serverSide: true,
            onCursorChange: (next) => runsQuery.setParams({ cursor: next }),
            onPageSizeChange: (next) =>
              runsQuery.setParams({ cursor: null, pageSize: next }),
          }}
        />
        <div
          className={cn(
            "h-full shrink-0 overflow-hidden transition-[width,margin] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            runsQuery.filtersOpen ? "ml-2 w-72" : "ml-0 w-0",
          )}
        >
          <RunsFilterPanel
            query={runsQuery}
            open={runsQuery.filtersOpen}
            onClose={() => runsQuery.setFiltersOpen(false)}
          />
        </div>
      </div>
    </DataTableProvider>
  );
}
