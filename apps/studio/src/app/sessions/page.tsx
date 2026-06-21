import { cookies } from "next/headers";
import SessionsPageClient from "@/features/sessions/components/sessions-page-client";
import { getMockSessions } from "@/features/sessions/data/mock-sessions";
import {
  parseSessionsTablePreferences,
  SESSIONS_TABLE_PREFERENCES_COOKIE,
} from "@/features/sessions/lib/table-preferences";

export default async function SessionsPage() {
  const [sessions, cookieStore] = await Promise.all([
    getMockSessions(),
    cookies(),
  ]);
  return (
    <SessionsPageClient
      sessions={sessions}
      preferences={parseSessionsTablePreferences(
        cookieStore.get(SESSIONS_TABLE_PREFERENCES_COOKIE)?.value,
      )}
    />
  );
}
