import { cookies } from "next/headers";
import {
  DEFAULT_RUNS_TABLE_PREFERENCES,
  parseRunsTablePreferences,
  RUNS_TABLE_PREFERENCES_COOKIE,
} from "@/features/runs/lib/table-preferences";
import { StudioRouteLoading } from "@/features/telemetry/components/studio-route-loading";

export default async function RunsLoading() {
  const cookieStore = await cookies();
  const preferences = {
    ...DEFAULT_RUNS_TABLE_PREFERENCES,
    ...parseRunsTablePreferences(
      cookieStore.get(RUNS_TABLE_PREFERENCES_COOKIE)?.value,
    ),
  };
  return (
    <StudioRouteLoading
      route="runs"
      layout={preferences.layout}
      sort={preferences.sort}
      direction={preferences.dir}
      pageSize={preferences.pageSize}
    />
  );
}
