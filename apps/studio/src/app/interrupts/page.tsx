import { cookies } from "next/headers";
import InterruptsPageClient from "@/features/interrupts/components/interrupts-page-client";
import {
  DEFAULT_INTERRUPTS_TABLE_PREFERENCES,
  INTERRUPTS_TABLE_PREFERENCES_COOKIE,
  parseInterruptsTablePreferences,
} from "@/features/interrupts/lib/table-preferences";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { getStudioInterrupts } from "@/lib/studio-api";

export default async function InterruptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const renderedAt = Date.now();
  const [query, cookieStore] = await Promise.all([searchParams, cookies()]);
  const preferences = {
    ...DEFAULT_INTERRUPTS_TABLE_PREFERENCES,
    ...parseInterruptsTablePreferences(
      cookieStore.get(INTERRUPTS_TABLE_PREFERENCES_COOKIE)?.value,
    ),
  };
  const interruptsResult = await getStudioInterrupts({
    ...query,
    sort: query.sort ?? preferences.sort,
    dir: query.dir ?? preferences.dir,
    pageSize: query.pageSize ?? String(preferences.pageSize),
  });
  if (interruptsResult.error) {
    return (
      <StudioDataError
        title="Unable to load interrupts"
        error={interruptsResult.error}
      />
    );
  }

  return (
    <InterruptsPageClient
      interrupts={interruptsResult.data.items}
      totalCount={interruptsResult.data.totalCount}
      preferences={preferences}
      initialNow={renderedAt}
    />
  );
}
