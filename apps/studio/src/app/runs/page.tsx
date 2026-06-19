import { cookies } from "next/headers";
import RunsPageClient from "@/features/runs/components/runs-page-client";
import { getMockRuns } from "@/features/runs/data/mock-runs";
import {
  parseRunsTablePreferences,
  RUNS_TABLE_PREFERENCES_COOKIE,
} from "@/features/runs/lib/table-preferences";

export default async function RunsPage() {
  const [runs, cookieStore] = await Promise.all([getMockRuns(), cookies()]);
  const preferences = parseRunsTablePreferences(
    cookieStore.get(RUNS_TABLE_PREFERENCES_COOKIE)?.value,
  );

  return <RunsPageClient runs={runs} preferences={preferences} />;
}
