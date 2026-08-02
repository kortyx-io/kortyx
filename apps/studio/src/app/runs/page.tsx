import { cookies } from "next/headers";
import RunsPageClient from "@/features/runs/components/runs-page-client";
import {
  DEFAULT_RUNS_TABLE_PREFERENCES,
  parseRunsTablePreferences,
  RUNS_TABLE_PREFERENCES_COOKIE,
} from "@/features/runs/lib/table-preferences";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { getStudioRuns } from "@/lib/studio-api";

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const renderedAt = Date.now();
  const [query, cookieStore] = await Promise.all([searchParams, cookies()]);
  const preferences = {
    ...DEFAULT_RUNS_TABLE_PREFERENCES,
    ...parseRunsTablePreferences(
      cookieStore.get(RUNS_TABLE_PREFERENCES_COOKIE)?.value,
    ),
  };
  const runsResult = await getStudioRuns({
    ...query,
    sort: query.sort ?? preferences.sort,
    dir: query.dir ?? preferences.dir,
    pageSize: query.pageSize ?? String(preferences.pageSize),
  });

  if (runsResult.error) {
    return (
      <StudioDataError title="Unable to load runs" error={runsResult.error} />
    );
  }

  return (
    <RunsPageClient
      runs={runsResult.data.items}
      totalCount={runsResult.data.totalCount}
      preferences={preferences}
      initialNow={renderedAt}
    />
  );
}
