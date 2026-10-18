"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { createInterruptColumns } from "@/features/interrupts/components/interrupt-table-columns";
import { InterruptsEmptyState } from "@/features/interrupts/components/interrupts-empty-state";
import {
  type InterruptsViewQuery,
  useInterruptsQuery,
} from "@/features/interrupts/hooks/use-interrupts-query";
import type { Interrupt, InterruptSortKey } from "@/features/interrupts/schema";
import { ListToolbar } from "@/features/telemetry/components/list-toolbar";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { readLegacyInterruptsViews } from "@/features/telemetry/lib/legacy-table-views";
import {
  operationalScopeFilters,
  studioFilterCompatibility,
} from "@/features/telemetry/lib/table-configuration";
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
  const query = useInterruptsQuery(interrupts, preferences);
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
  return (
    <div className="flex h-full min-h-0">
      <DataTable
        query={{
          mode: "remote",
          pageSizes: [10, 20, 50, 100, 250],
          defaults: {
            sort: preferences?.sort ?? "priority",
            dir: preferences?.dir ?? "asc",
            pageSize: preferences?.pageSize ?? 20,
          },
        }}
        totalCount={totalCount}
        scopeFilters={operationalScopeFilters}
        compatibility={studioFilterCompatibility("interrupts")}
        legacyViews={readLegacyInterruptsViews}
        columns={columns}
        initialLayout={preferences?.layout}
        tableId="interrupts"
        search={{
          label: "Search interrupts",
          placeholder: "Search requests, sessions, workflows, responses…",
        }}
        filterResource="interrupts"
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
        emptyState={({ clearFilters, hasFilters }) => (
          <InterruptsEmptyState
            hasFilters={hasFilters}
            onClear={clearFilters}
          />
        )}
        scrollRestoreKey="interrupts-table-scroll-position"
      />
    </div>
  );
}
