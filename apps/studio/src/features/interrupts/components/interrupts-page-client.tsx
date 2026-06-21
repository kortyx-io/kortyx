"use client";

import { useEffect, useState } from "react";
import { DataTable, DataTableProvider } from "@/components/data-table";
import { createInterruptColumns } from "@/features/interrupts/components/interrupt-table-columns";
import { InterruptsEmptyState } from "@/features/interrupts/components/interrupts-empty-state";
import { InterruptsFilterPanel } from "@/features/interrupts/components/interrupts-filter-panel";
import {
  type InterruptsViewQuery,
  useInterruptsQuery,
} from "@/features/interrupts/hooks/use-interrupts-query";
import {
  DEFAULT_INTERRUPTS_TABLE_PREFERENCES,
  INTERRUPTS_TABLE_PREFERENCES_COOKIE,
} from "@/features/interrupts/lib/table-preferences";
import type { Interrupt, InterruptSortKey } from "@/features/interrupts/types";
import { PAGE_SIZES } from "@/features/runs/lib/constants";
import { ListToolbar } from "@/features/telemetry/components/list-toolbar";
import { ListViewsMenu } from "@/features/telemetry/components/list-views-menu";
import { useListTablePreferences } from "@/features/telemetry/hooks/use-list-table-preferences";
import type { ListTablePreferences } from "@/features/telemetry/lib/table-preferences";
import { cn } from "@/lib/utils";

export default function InterruptsPageClient({
  interrupts,
  preferences,
}: {
  interrupts: Interrupt[];
  preferences?: Partial<
    ListTablePreferences<InterruptSortKey, InterruptsViewQuery>
  >;
}) {
  const prefs = useListTablePreferences({
    cookieName: INTERRUPTS_TABLE_PREFERENCES_COOKIE,
    defaults: DEFAULT_INTERRUPTS_TABLE_PREFERENCES,
    initial: preferences,
  });
  const query = useInterruptsQuery(interrupts, {
    sort: prefs.value.sort,
    dir: prefs.value.dir,
    pageSize: prefs.value.pageSize,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 140);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const columns = createInterruptColumns({
    now,
    onCopy: (value) =>
      navigator.clipboard.writeText(value).catch(() => undefined),
  });
  useEffect(() => {
    prefs.save({ sort: query.sort, dir: query.dir, pageSize: query.pageSize });
  }, [prefs, query.dir, query.pageSize, query.sort]);
  return (
    <DataTableProvider
      columns={columns}
      initialLayout={prefs.value.layout}
      onLayoutChange={(layout) => prefs.save({ layout })}
    >
      <div className="flex h-full min-h-0 gap-2">
        <DataTable
          className="min-w-0 flex-1"
          data={query.filteredInterrupts}
          getRowKey={(interrupt) => interrupt.id}
          loading={loading}
          rowClassName={(interrupt) =>
            interrupt.status === "failed" ? "bg-red-500/[0.025]" : undefined
          }
          sort={query.sort}
          direction={query.dir}
          onSort={query.handleSort}
          onSetSortDirection={query.setSortDirection}
          onClearSort={query.clearSort}
          header={
            <ListToolbar
              title="Interrupts"
              subtitle="Operational inbox for every human request"
              search={query.q}
              searchPlaceholder="Search requests, sessions, workflows, responses…"
              activeFilterCount={query.activeFilterCount}
              filtersOpen={filtersOpen}
              refreshing={refreshing}
              live={query.live}
              onSearchChange={(value) => query.setParams({ q: value || null })}
              onToggleFilters={() => setFiltersOpen((open) => !open)}
              onClearFilters={query.clearFilters}
              onToggleLive={() => query.setLive(!query.live)}
              onRefresh={() => {
                setRefreshing(true);
                setLoading(true);
                window.setTimeout(() => {
                  setRefreshing(false);
                  setLoading(false);
                }, 650);
              }}
              views={
                <ListViewsMenu
                  currentQuery={query.viewQuery}
                  standardQuery={query.standardViewQuery}
                  views={prefs.value.views}
                  onApplyQuery={query.applyViewQuery}
                  onViewsChange={(views) => prefs.save({ views })}
                />
              }
            />
          }
          emptyState={
            <InterruptsEmptyState
              hasFilters={query.hasActiveFilters}
              onClear={query.clearFilters}
            />
          }
          scrollRestoreKey="interrupts-table-scroll-position"
          pagination={{
            cursor: query.cursor,
            pageSize: query.pageSize,
            pageSizes: PAGE_SIZES,
            totalCount: query.filteredInterrupts.length,
            onCursorChange: (cursor) => query.setParams({ cursor }),
            onPageSizeChange: (pageSize) =>
              query.setParams({ cursor: null, pageSize }),
          }}
        />
        <div
          className={cn(
            "h-full min-h-0 shrink-0 self-stretch overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            filtersOpen ? "w-72" : "w-0",
          )}
        >
          <InterruptsFilterPanel
            query={query}
            open={filtersOpen}
            onClose={() => setFiltersOpen(false)}
          />
        </div>
      </div>
    </DataTableProvider>
  );
}
