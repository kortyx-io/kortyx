"use client";

import { SAMPLE_PROJECT } from "@kortyx/telemetry-contracts";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { useStudioRouteScope } from "@/components/studio-route-provider";
import { effectiveInterruptStatus } from "@/features/interrupts/lib/interrupt-presentation";
import { createRunColumns } from "@/features/runs/components/run-table-columns";
import { RunsEmptyState } from "@/features/runs/components/runs-empty-state";
import { RunsToolbar } from "@/features/runs/components/runs-toolbar";
import { useRunsQuery } from "@/features/runs/hooks/use-runs-query";
import type { RunsTablePreferences } from "@/features/runs/lib/table-preferences";
import type { Run } from "@/features/runs/schema";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { readLegacyRunsViews } from "@/features/telemetry/lib/legacy-table-views";
import {
  runsScopeFilters,
  studioFilterCompatibility,
} from "@/features/telemetry/lib/table-configuration";
import { detailNavigationHref } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { studioDetailHref } from "@/lib/studio-routes";

type RunsPageClientProps = {
  runs: Run[];
  totalCount: number;
  initialNow: number;
  /** DB/server-provided table preferences for the current user. */
  preferences?: Partial<RunsTablePreferences>;
};

export default function RunsPageClient({
  runs: initialRuns,
  totalCount,
  preferences,
  initialNow,
}: RunsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const runsQuery = useRunsQuery(initialRuns, preferences);
  const [wallClock, setNow] = useState(initialNow);
  const sampleProject = useStudioRouteScope()?.sampleProject === true;
  const now = sampleProject
    ? Date.parse(SAMPLE_PROJECT.referenceTime)
    : wallClock;
  const { live } = runsQuery;
  const liveRefresh = useLiveRefresh({ enabled: live, resource: "runs" });
  const hasActiveRuns = runsQuery.filteredRuns.some((run) => {
    if (
      run.status === "running" ||
      (run.parentRunId && run.status === "interrupted")
    )
      return true;
    if (run.status !== "interrupted" || !run.interruptStatus) return false;
    return (
      effectiveInterruptStatus(
        {
          status: run.interruptStatus,
          expiresAt: run.interruptExpiresAt,
        },
        now,
      ) === "pending"
    );
  });

  useEffect(() => {
    if (sampleProject || (!live && !hasActiveRuns)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [live, hasActiveRuns, sampleProject]);

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => undefined);
  }

  function openRun(run: Run, event: React.MouseEvent<HTMLTableRowElement>) {
    const target = new URL(
      detailNavigationHref(
        studioDetailHref("runs", run.parentRunId ?? run.id),
        searchParams,
      ),
      window.location.origin,
    );
    if (run.invocationId) {
      target.searchParams.set("tab", "calls");
      target.searchParams.set("call", run.invocationId);
      if (run.branchId) target.searchParams.set("branch", run.branchId);
    }
    const href = `${target.pathname}${target.search}`;
    if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
    else if (runsQuery.filtersOpen) {
      void runsQuery.setFiltersOpen(false).then(() => router.push(href));
    } else {
      router.push(href);
    }
  }

  const columns = createRunColumns({
    now,
    onToggleStatus: runsQuery.toggleStatus,
    onCopy: copy,
    workflowFilter: runsQuery.workflow,
    versionFilter: runsQuery.version,
  });

  return (
    <div className="flex h-full min-h-0">
      <DataTable
        query={{
          mode: "remote",
          pageSizes: [10, 20, 50, 100, 250],
          defaults: {
            sort: preferences?.sort ?? "started",
            dir: preferences?.dir ?? "desc",
            pageSize: preferences?.pageSize ?? 20,
          },
        }}
        totalCount={totalCount}
        scopeFilters={runsScopeFilters}
        compatibility={studioFilterCompatibility("runs")}
        legacyViews={readLegacyRunsViews}
        columns={columns}
        initialLayout={preferences?.layout}
        tableId="runs"
        search={{
          label: "Search runs",
          placeholder: "Search runs, sessions, workflows, errors…",
        }}
        filterResource="runs"
        className="min-w-0 flex-1"
        data={runsQuery.filteredRuns}
        getRowKey={(run) => run.id}
        onRowClick={openRun}
        rowTone={(run) => (run.status === "failed" ? "danger" : undefined)}
        header={
          <RunsToolbar
            live={live}
            liveStatus={liveRefresh.status}
            refreshing={liveRefresh.refreshing}
            onToggleLive={() => runsQuery.setLive(!live)}
            onRefresh={liveRefresh.refreshNow}
          />
        }
        emptyState={({ clearFilters }) => (
          <RunsEmptyState onClear={clearFilters} />
        )}
        scrollRestoreKey="runs-table-scroll-position"
      />
    </div>
  );
}
