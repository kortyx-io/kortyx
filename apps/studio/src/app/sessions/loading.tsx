import { cookies } from "next/headers";
import {
  DEFAULT_SESSIONS_TABLE_PREFERENCES,
  parseSessionsTablePreferences,
  SESSIONS_TABLE_PREFERENCES_COOKIE,
} from "@/features/sessions/lib/table-preferences";
import { StudioRouteLoading } from "@/features/telemetry/components/studio-route-loading";

export default async function SessionsLoading() {
  const cookieStore = await cookies();
  const preferences = {
    ...DEFAULT_SESSIONS_TABLE_PREFERENCES,
    ...parseSessionsTablePreferences(
      cookieStore.get(SESSIONS_TABLE_PREFERENCES_COOKIE)?.value,
    ),
  };
  return (
    <StudioRouteLoading
      route="sessions"
      layout={preferences.layout}
      sort={preferences.sort}
      direction={preferences.dir}
      pageSize={preferences.pageSize}
    />
  );
}
