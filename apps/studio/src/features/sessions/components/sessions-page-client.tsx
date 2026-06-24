"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, DataTableProvider } from "@/components/data-table";
import { PAGE_SIZES } from "@/features/runs/lib/constants";
import { createSessionColumns } from "@/features/sessions/components/session-table-columns";
import { SessionsEmptyState } from "@/features/sessions/components/sessions-empty-state";
import { SessionsFilterPanel } from "@/features/sessions/components/sessions-filter-panel";
import {
  type SessionsViewQuery,
  useSessionsQuery,
} from "@/features/sessions/hooks/use-sessions-query";
import {
  DEFAULT_SESSIONS_TABLE_PREFERENCES,
  SESSIONS_TABLE_PREFERENCES_COOKIE,
} from "@/features/sessions/lib/table-preferences";
import type { Session, SessionSortKey } from "@/features/sessions/schema";
import { ListToolbar } from "@/features/telemetry/components/list-toolbar";
import { ListViewsMenu } from "@/features/telemetry/components/list-views-menu";
import { useListTablePreferences } from "@/features/telemetry/hooks/use-list-table-preferences";
import type { ListTablePreferences } from "@/features/telemetry/lib/table-preferences";
import { cn } from "@/lib/utils";

export default function SessionsPageClient({
  sessions,
  preferences,
}: {
  sessions: Session[];
  preferences?: Partial<
    ListTablePreferences<SessionSortKey, SessionsViewQuery>
  >;
}) {
  const router = useRouter();
  const prefs = useListTablePreferences({
    cookieName: SESSIONS_TABLE_PREFERENCES_COOKIE,
    defaults: DEFAULT_SESSIONS_TABLE_PREFERENCES,
    initial: preferences,
  });
  const query = useSessionsQuery(sessions, {
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
    if (!query.live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [query.live]);
  const columns = createSessionColumns({
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
          data={query.filteredSessions}
          getRowKey={(session) => session.id}
          loading={loading}
          onRowClick={(session, event) => {
            const href = `/sessions/${session.id}`;
            if (event.metaKey || event.ctrlKey)
              window.open(href, "_blank", "noopener");
            else router.push(href);
          }}
          rowClassName={(session) =>
            session.status === "failed" ? "bg-red-500/[0.025]" : undefined
          }
          sort={query.sort}
          direction={query.dir}
          onSort={query.handleSort}
          onSetSortDirection={query.setSortDirection}
          onClearSort={query.clearSort}
          header={
            <ListToolbar
              title="Sessions"
              subtitle="Operational inbox for every session"
              search={query.q}
              searchPlaceholder="Search sessions, users, workflows, errors…"
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
            <SessionsEmptyState
              hasFilters={query.hasActiveFilters}
              onClear={query.clearFilters}
            />
          }
          scrollRestoreKey="sessions-table-scroll-position"
          pagination={{
            cursor: query.cursor,
            pageSize: query.pageSize,
            pageSizes: PAGE_SIZES,
            totalCount: query.filteredSessions.length,
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
          <SessionsFilterPanel
            query={query}
            open={filtersOpen}
            onClose={() => setFiltersOpen(false)}
          />
        </div>
      </div>
    </DataTableProvider>
  );
}
