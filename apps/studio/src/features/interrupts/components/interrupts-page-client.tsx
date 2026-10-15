"use client";

import { useEffect, useState } from "react";
import { DataTable, DataTableProvider } from "@/components/data-table";
import { createInterruptColumns } from "@/features/interrupts/components/interrupt-table-columns";
import { InterruptsEmptyState } from "@/features/interrupts/components/interrupts-empty-state";
import {
  type InterruptsViewQuery,
  useInterruptsQuery,
} from "@/features/interrupts/hooks/use-interrupts-query";
import {
  DEFAULT_INTERRUPTS_TABLE_PREFERENCES,
  INTERRUPTS_TABLE_PREFERENCES_COOKIE,
} from "@/features/interrupts/lib/table-preferences";
import type { Interrupt, InterruptSortKey } from "@/features/interrupts/schema";
import { PAGE_SIZES } from "@/features/runs/lib/constants";
import { ListToolbar } from "@/features/telemetry/components/list-toolbar";
import { OperationalFilterScope } from "@/features/telemetry/components/operational-filter-scope";
import { useListTablePreferences } from "@/features/telemetry/hooks/use-list-table-preferences";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import type { ListTablePreferences } from "@/features/telemetry/lib/table-preferences";
import { detailNavigationHref } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { studioDetailHref } from "@/lib/studio-routes";

export default function InterruptsPageClient({
  interrupts,
  totalCount,
  preferences,
  initialNow,
}: {
  interrupts: Interrupt[];
  totalCount: number;
  initialNow: number;
  preferences?: Partial<
    ListTablePreferences<InterruptSortKey, InterruptsViewQuery>
  >;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const liveRefresh = useLiveRefresh({
    enabled: query.live,
    resource: "interrupts",
  });
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const current = Date.now();
    const nextExpiry = interrupts
      .filter((interrupt) => interrupt.status === "pending")
      .map((interrupt) =>
        interrupt.expiresAt ? Date.parse(interrupt.expiresAt) : Number.NaN,
      )
      .filter((expiresAt) => Number.isFinite(expiresAt) && expiresAt > current)
      .sort((a, b) => a - b)[0];
    if (nextExpiry === undefined) return;
    const timer = window.setTimeout(
      () => {
        setNow(Date.now());
        router.refresh();
      },
      Math.max(0, nextExpiry - current + 50),
    );
    return () => window.clearTimeout(timer);
  }, [interrupts, router]);
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
      <div className="flex h-full min-h-0">
        <DataTable
          tableId="interrupts"
          search={{
            label: "Search interrupts",
            placeholder: "Search requests, sessions, workflows, responses…",
            value: query.q,
            onChange: (value) => {
              void query.setParams({ q: value || null, cursor: 0 });
            },
          }}
          filterResource="interrupts"
          onClearLegacyFilters={query.clearFilters}
          filterScope={<OperationalFilterScope query={query} />}
          className="min-w-0 flex-1"
          data={query.filteredInterrupts}
          getRowKey={(interrupt) => interrupt.id}
          onRowClick={(interrupt, event) => {
            const href = detailNavigationHref(
              studioDetailHref("interrupts", interrupt.id),
              searchParams,
            );
            if (event.metaKey || event.ctrlKey)
              window.open(href, "_blank", "noopener");
            else if (query.filtersOpen) {
              void query.setFiltersOpen(false).then(() => router.push(href));
            } else {
              router.push(href);
            }
          }}
          rowTone={(interrupt) =>
            interrupt.status === "failed" ? "danger" : undefined
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
              refreshing={liveRefresh.refreshing}
              live={query.live}
              liveStatus={liveRefresh.status}
              onToggleLive={() => query.setLive(!query.live)}
              onRefresh={liveRefresh.refreshNow}
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
            totalCount,
            serverSide: true,
            onCursorChange: (cursor) => query.setParams({ cursor }),
            onPageSizeChange: (pageSize) =>
              query.setParams({ cursor: null, pageSize }),
          }}
        />
      </div>
    </DataTableProvider>
  );
}
