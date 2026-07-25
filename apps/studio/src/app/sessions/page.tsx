import { cookies } from "next/headers";
import SessionsPageClient from "@/features/sessions/components/sessions-page-client";
import {
  DEFAULT_SESSIONS_TABLE_PREFERENCES,
  parseSessionsTablePreferences,
  SESSIONS_TABLE_PREFERENCES_COOKIE,
} from "@/features/sessions/lib/table-preferences";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { getStudioSessions } from "@/lib/studio-api";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const renderedAt = Date.now();
  const [query, cookieStore] = await Promise.all([searchParams, cookies()]);
  const preferences = {
    ...DEFAULT_SESSIONS_TABLE_PREFERENCES,
    ...parseSessionsTablePreferences(
      cookieStore.get(SESSIONS_TABLE_PREFERENCES_COOKIE)?.value,
    ),
  };
  const sessionsResult = await getStudioSessions({
    ...query,
    sort: query.sort ?? preferences.sort,
    dir: query.dir ?? preferences.dir,
    pageSize: query.pageSize ?? String(preferences.pageSize),
  });
  if (sessionsResult.error) {
    return (
      <StudioDataError
        title="Unable to load sessions"
        error={sessionsResult.error}
      />
    );
  }

  return (
    <SessionsPageClient
      sessions={sessionsResult.data.items}
      totalCount={sessionsResult.data.totalCount}
      preferences={preferences}
      initialNow={renderedAt}
    />
  );
}
