"use client";

import { SAMPLE_PROJECT } from "@kortyx/telemetry-contracts";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { useStudioRouteScope } from "@/components/studio-route-provider";
import { effectiveInterruptStatus } from "@/features/interrupts/lib/interrupt-presentation";
import { createSessionColumns } from "@/features/sessions/components/session-table-columns";
import { SessionsEmptyState } from "@/features/sessions/components/sessions-empty-state";
import {
  type SessionsViewQuery,
  useSessionsQuery,
} from "@/features/sessions/hooks/use-sessions-query";
import type { Session, SessionSortKey } from "@/features/sessions/schema";
import { ListToolbar } from "@/features/telemetry/components/list-toolbar";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { readLegacySessionsViews } from "@/features/telemetry/lib/legacy-table-views";
import {
  operationalScopeFilters,
  studioFilterCompatibility,
} from "@/features/telemetry/lib/table-configuration";
import type { ListTablePreferences } from "@/features/telemetry/lib/table-preferences";
import { detailNavigationHref } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { studioDetailHref } from "@/lib/studio-routes";

export default function SessionsPageClient({
  sessions,
  totalCount,
  preferences,
  initialNow,
}: {
  sessions: Session[];
  totalCount: number;
  initialNow: number;
  preferences?: Partial<
    ListTablePreferences<SessionSortKey, SessionsViewQuery>
  >;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useSessionsQuery(sessions, preferences);
  const liveRefresh = useLiveRefresh({
    enabled: query.live,
    resource: "sessions",
  });
  const [wallClock, setNow] = useState(initialNow);
  const sampleProject = useStudioRouteScope()?.sampleProject === true;
  const now = sampleProject
    ? Date.parse(SAMPLE_PROJECT.referenceTime)
    : wallClock;
  const hasActiveSessions = query.filteredSessions.some((session) => {
    if (session.status === "running") return true;
    if (session.status !== "interrupted" || !session.interruptStatus) {
      return false;
    }
    return (
      effectiveInterruptStatus(
        {
          status: session.interruptStatus,
          expiresAt: session.interruptExpiresAt,
        },
        now,
      ) === "pending"
    );
  });
  useEffect(() => {
    if (sampleProject || (!query.live && !hasActiveSessions)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [query.live, hasActiveSessions, sampleProject]);
  const columns = createSessionColumns({
    now,
    onCopy: (value) =>
      navigator.clipboard.writeText(value).catch(() => undefined),
  });
  return (
    <div className="flex h-full min-h-0">
      <DataTable
        help={{ filters: studioHelp.filters, views: studioHelp.views }}
        query={{
          mode: "remote",
          pageSizes: [10, 20, 50, 100, 250],
          defaults: {
            sort: preferences?.sort ?? "activity",
            dir: preferences?.dir ?? "desc",
            pageSize: preferences?.pageSize ?? 20,
          },
        }}
        totalCount={totalCount}
        scopeFilters={operationalScopeFilters}
        compatibility={studioFilterCompatibility("sessions")}
        legacyViews={readLegacySessionsViews}
        columns={columns}
        initialLayout={preferences?.layout}
        tableId="sessions"
        search={{
          label: "Search sessions",
          placeholder: "Search sessions, users, workflows, errors…",
        }}
        filterResource="sessions"
        className="min-w-0 flex-1"
        data={query.filteredSessions}
        getRowKey={(session) => session.id}
        onRowClick={(session, event) => {
          const href = detailNavigationHref(
            studioDetailHref("sessions", session.id),
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
        rowTone={(session) =>
          session.status === "failed" ? "danger" : undefined
        }
        header={
          <ListToolbar
            title="Sessions"
            subtitle="Operational inbox for every session"
            refreshing={liveRefresh.refreshing}
            live={query.live}
            liveStatus={liveRefresh.status}
            onToggleLive={() => query.setLive(!query.live)}
            onRefresh={liveRefresh.refreshNow}
          />
        }
        emptyState={({ clearFilters, hasFilters }) => (
          <SessionsEmptyState hasFilters={hasFilters} onClear={clearFilters} />
        )}
        scrollRestoreKey="sessions-table-scroll-position"
      />
    </div>
  );
}
